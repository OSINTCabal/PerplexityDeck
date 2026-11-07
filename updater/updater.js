#!/usr/bin/env node
// perplexity-desktop updater: official signed apt feed (packages.perplexity.ai) -> verified .deb -> shimmed per-user build.
// usage: updater.js --check | --force | --rollback | (no arg = update if newer) | --stage <outdir> (build use) [--json]
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const C = require('./upd-core.js');
const REPO = 'https://packages.perplexity.ai/deb', DIST = 'stable', ARCH = 'amd64';
const KEY_FPR = '5CE6FE16BD533152E64EFD93C751F9CAC952A583';
const ROOT = process.env.PPLX_ROOT || path.join(os.homedir(), '.local/opt/perplexity-desktop');
const CACHE = path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'perplexity-desktop-updater');
const args = process.argv.slice(2); C.json = args.includes('--json');
let releaseLock;
const validVersion = v => { if (!/^\d+(\.\d+)+$/.test(v)) throw new Error("Invalid upstream version"); return v; };
const KEYRING = [path.join(__dirname, 'perplexity-archive.gpg')].find((p) => fs.existsSync(p));

function gpgVerify(file) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pplx-gpg-'));
  try {
    const r = cp.spawnSync('gpg', ['--homedir', home, '--batch', '--no-default-keyring', '--keyring', KEYRING, '--status-fd', '1', '--verify', file], { encoding: 'utf8' });
    const ok = r.status === 0 && new RegExp(`^\\[GNUPG:\\] VALIDSIG ${KEY_FPR} `, 'm').test(r.stdout);
    if (!ok) throw new Error('InRelease signature invalid or not by pinned key ' + KEY_FPR + ': ' + (r.stderr || '').trim());
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
}
const field = (blk, k) => (blk.match(new RegExp(`^${k}: (.*)$`, 'm')) || [])[1];
async function feed() {
  fs.mkdirSync(CACHE, { recursive: true });
  const inrel = path.join(CACHE, 'InRelease'); fs.writeFileSync(inrel, await C.request(`${REPO}/dists/${DIST}/InRelease`));
  gpgVerify(inrel);
  const txt = fs.readFileSync(inrel, 'utf8'); const sha = txt.split('SHA256:')[1] || '';
  const m = sha.match(new RegExp(`^ ([0-9a-f]{64}) +(\\d+) main/binary-${ARCH}/Packages$`, 'm')); if (!m) throw new Error('Packages not listed in InRelease');
  const pk = await C.request(`${REPO}/dists/${DIST}/main/binary-${ARCH}/Packages`);
  if (require('crypto').createHash('sha256').update(pk).digest('hex') !== m[1]) throw new Error('Packages sha256 mismatch');
  if (pk.length !== Number(m[2])) throw new Error('Packages size mismatch');
  const blk = pk.toString().split(/\n\n/).filter((b) => field(b, 'Package') === 'perplexity').sort((a, b) => C.vcmp(field(b, 'Version'), field(a, 'Version')))[0];
  if (!blk) throw new Error('perplexity not in Packages');
  return { version: field(blk, 'Version'), url: `${REPO}/${field(blk, 'Filename').split('/').map(encodeURIComponent).join('/')}`, sha256: field(blk, 'SHA256'), size: +field(blk, 'Size'), date: field(txt, 'Date') };
}
const installed = () => { try { return C.installedVersions(ROOT).pop() || null; } catch { return null; } };

// build a shimmed app dir from a verified .deb
function stage(deb, outDir) {
  const zz = C.sevenZip(ROOT); const w = fs.mkdtempSync(path.join(CACHE, 'stage-'));
  try {
    C.x7z(zz, deb, w); const data = fs.readdirSync(w).find((f) => /^data\.tar/.test(f)); if (!data) throw new Error('no data.tar in deb');
    C.x7z(zz, path.join(w, data), w); const tar = fs.readdirSync(w).find((f) => f === 'data.tar'); if (tar) C.x7z(zz, path.join(w, tar), path.join(w, 'root'));
    const src = path.join(w, 'root/opt/Perplexity'); if (!fs.existsSync(path.join(src, 'perplexity'))) throw new Error('unexpected deb layout');
    fs.rmSync(outDir, { recursive: true, force: true }); fs.renameSync(src, outDir);
    for (const f of ['perplexity', 'chrome-sandbox', 'chrome_crashpad_handler', ...fs.readdirSync(path.join(outDir, 'resources/native/bin')).map((b) => 'resources/native/bin/' + b)]) { const p = path.join(outDir, f); if (fs.existsSync(p)) fs.chmodSync(p, 0o755); }
    if (fs.existsSync(path.join(outDir, 'resources/linux'))) for (const f of fs.readdirSync(path.join(outDir, 'resources/linux'))) fs.chmodSync(path.join(outDir, 'resources/linux', f), 0o755);
    applyShim(outDir);
    if (asarMain(path.join(outDir, 'resources/app.asar')) !== 'linux-entry.mjs') throw new Error('shim not active');
    const icon = path.join(w, 'root/usr/share/icons/hicolor/512x512/apps/perplexity.png'); if (fs.existsSync(icon)) fs.copyFileSync(icon, path.join(outDir, 'vendor-icon.png'));
  } finally { fs.rmSync(w, { recursive: true, force: true }); }
}
function applyShim(appDir) {
  const asar = path.join(appDir, 'resources/app.asar'), tmp = asar + '.d';
  fs.rmSync(tmp, { recursive: true, force: true }); C.extractAsar(asar, tmp);
  const pj = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
  if (pj.main === 'linux-entry.mjs' && pj.pplxVendorMain) pj.main = pj.pplxVendorMain; // re-shim an already shimmed build
  if (pj.main !== 'main/index.js') throw new Error('vendor main changed: ' + pj.main + ' (shim needs review)');
  for (const f of ['linux-shim.cjs', 'linux-entry.mjs']) { fs.copyFileSync(path.join(__dirname, f), path.join(tmp, f)); }
  C.syntaxCheck(path.join(tmp, 'linux-shim.cjs'));
  pj.pplxVendorMain = pj.main; pj.main = 'linux-entry.mjs';
  // Electron overrides CHROME_DESKTOP with <name>.desktop; the portal app id (GlobalShortcuts, notifications) must match our .desktop
  pj.desktopName = 'perplexity-desktop.desktop'; fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify(pj, null, 2));
  const unp = C.unpackedSet(asar + '.unpacked'); C.packAsar(tmp, asar, (r) => unp.has(r)); fs.rmSync(tmp, { recursive: true, force: true });
  fs.writeFileSync(path.join(appDir, '.shim'), 'linux-shim applied ' + new Date().toISOString() + '\n');
}

// RunAsNode fuse is off in the vendor binary, so smoke-test without executing Electron: ELF + ldd + version file
function smokeTest(dir) {
  const exe = path.join(dir, 'perplexity'); const b = Buffer.alloc(4); const fd = fs.openSync(exe, 'r'); fs.readSync(fd, b, 0, 4, 0); fs.closeSync(fd);
  if (b.toString('latin1') !== '\x7fELF') throw new Error('not an ELF binary: ' + exe);
  const miss = []; for (const f of [exe, ...fs.readdirSync(path.join(dir, 'resources/native/bin')).map((x) => path.join(dir, 'resources/native/bin', x))]) {
    const r = cp.spawnSync('ldd', [f], { encoding: 'utf8' }); for (const l of (r.stdout || '').split('\n')) if (/not found/.test(l)) miss.push(path.basename(f) + ': ' + l.trim()); }
  if (miss.length) throw new Error('missing libraries:\n' + miss.join('\n'));
  return fs.readFileSync(path.join(dir, 'version'), 'utf8').trim();
}
function asarMain(asar) { const fd = fs.openSync(asar, 'r'); const b = Buffer.alloc(16); fs.readSync(fd, b, 0, 16, 0); const jl = b.readUInt32LE(12), j = Buffer.alloc(jl); fs.readSync(fd, j, 0, jl, 16);
  const e = JSON.parse(j).files['package.json']; const p = Buffer.alloc(e.size); fs.readSync(fd, p, 0, e.size, 8 + b.readUInt32LE(4) + Number(e.offset)); fs.closeSync(fd); return JSON.parse(p).main; }

(async () => {
  const known=new Set(['--check','--force','--rollback','--json','--reshim','--stage']);
  if(args[0]!=='--stage' && args.some(a=>!known.has(a))) throw new Error('Unknown updater option');
  fs.mkdirSync(ROOT,{recursive:true});fs.mkdirSync(CACHE,{recursive:true});
  if (args[0] === '--stage') { // build-time: --stage <deb> <outdir>
    const [deb, out] = args.slice(1); stage(path.resolve(deb), path.resolve(out)); C.log('staged', out); return;
  }
  if (args[0] === '--reshim') { // re-apply the current shim to the installed build in place (asar backed up alongside)
    releaseLock = await C.lock(ROOT); const cur = installed(); if (!cur) throw new Error('nothing installed'); if(C.isRunning(path.join(ROOT,'app-'+cur))) throw new Error('Close PerplexityDeck before changing integration'); const d = path.join(ROOT, 'app-' + cur), a = path.join(d, 'resources/app.asar');
    fs.copyFileSync(a, a + '.pre-reshim'); applyShim(d); if (asarMain(a) !== 'linux-entry.mjs') { fs.copyFileSync(a + '.pre-reshim', a); throw new Error('reshim failed; restored'); }
    C.emit({ event: 'reshimmed', version: cur }); return;
  }
  if (args.includes('--rollback')) {
    releaseLock = await C.lock(ROOT); const rb = fs.readdirSync(ROOT).filter((d) => /^rollback-\d+(\.\d+)+$/.test(d)).sort((a, b) => C.vcmp(a.slice(9), b.slice(9))).pop();
    if (!rb) throw new Error('no rollback copy in ' + ROOT);
    const cur = installed(), v = validVersion(rb.slice(9)), A = (x) => path.join(ROOT, 'app-' + x), T = path.join(ROOT, '.rollback-swap');
    if(cur && C.isRunning(A(cur))) throw new Error('Close PerplexityDeck before rollback');
    fs.rmSync(T, { recursive: true, force: true });
    if (cur) fs.renameSync(A(cur), T);              // current build aside
    fs.renameSync(path.join(ROOT, rb), A(v));      // rollback copy becomes the active build
    if (cur) fs.renameSync(T, path.join(ROOT, 'rollback-' + cur)); // previous active kept as the new rollback (roll forward again with --rollback)
    fs.writeFileSync(path.join(ROOT, 'pinned-version'), v + '\n'); // timer won't re-upgrade until --force
    C.emit({ event: 'rolledback', from: cur, to: v }); return;
  }
  const f = await feed(), cur = installed(); validVersion(f.version.replace(/\+.*/, '')); const newer = !cur || C.vcmp(f.version.replace(/\+.*/, ''), cur) > 0;
  const pinned = fs.existsSync(path.join(ROOT, 'pinned-version')) ? fs.readFileSync(path.join(ROOT, 'pinned-version'), 'utf8').trim() : null;
  if (args.includes('--check')) { C.emit({ event: 'check', installed: cur, latest: f.version, updateAvailable: newer, pinned, url: f.url, sha256: f.sha256 }); process.exitCode = newer ? 10 : 0; return; }
  const force = args.includes('--force');
  if (!force && (!newer || (pinned && pinned === cur))) { C.emit({ event: 'uptodate', installed: cur, latest: f.version, pinned }); return; }
  releaseLock = await C.lock(ROOT);
  if (cur && C.isRunning(path.join(ROOT,'app-'+cur))) throw new Error('Close PerplexityDeck before updating');
  const deb = await C.fetchVerified(f.url, path.join(CACHE, path.basename(decodeURIComponent(f.url))), { digest: f.sha256, size: f.size });
  const ver = f.version.replace(/\+.*/, ''); const tmp = path.join(ROOT, `app-${ver}.tmp`);
  stage(deb, tmp);
  const smoke = smokeTest(tmp); const main = asarMain(path.join(tmp, 'resources/app.asar'));
  if (main !== 'linux-entry.mjs') throw new Error('shim not active after rebuild: ' + main);
  const prev = cur;
  if (prev === ver) { const backup=path.join(ROOT,'rollback-'+prev+'.new');fs.rmSync(backup,{recursive:true,force:true});cp.execFileSync('cp',['-al',path.join(ROOT,'app-'+prev),backup]); }
  C.commit(ROOT, tmp, ver);
  if (prev) { for (const d of fs.readdirSync(ROOT)) if (/^rollback-/.test(d) && !d.endsWith('.new')) fs.rmSync(path.join(ROOT, d), { recursive: true, force: true });
    if (prev === ver) fs.renameSync(path.join(ROOT, 'rollback-' + prev + '.new'), path.join(ROOT, 'rollback-' + prev));
    else fs.renameSync(path.join(ROOT, 'app-' + prev), path.join(ROOT, 'rollback-' + prev)); }
  for (const d of fs.readdirSync(ROOT)) if (/\.old-\d+$/.test(d)) fs.rmSync(path.join(ROOT, d), { recursive: true, force: true });
  fs.rmSync(path.join(ROOT, 'pinned-version'), { force: true });
  C.emit({ event: 'updated', from: prev, to: ver, electron: smoke, deb: f.url, sha256: f.sha256 });
})().catch((e) => { C.log('ERROR', e.message || e); process.exitCode=1; }).finally(async()=>{if(releaseLock)await releaseLock();});
