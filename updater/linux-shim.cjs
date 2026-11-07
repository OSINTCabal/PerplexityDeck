// Perplexity Linux shim — loaded before the vendor main (see linux-entry.mjs).
'use strict';
const { app, session, BrowserWindow, globalShortcut, Notification } = require('electron');
const path = require('path'), os = require('os'), fs = require('fs'), cp = require('child_process');
const log = (...a) => { if (process.env.PPLX_SHIM_DEBUG) console.error('[linux-shim]', ...a); };

// Keep the upstream application name: Linux keyring encryption keys use it.

// 1) own userData: ~/.config/perplexity-desktop (vendor main honours this env var too)
const UD = process.env.PERPLEXITY_XPLAT_ELECTRON_USER_DATA_PATH || path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'perplexity-desktop');
process.env.PERPLEXITY_XPLAT_ELECTRON_USER_DATA_PATH = UD;
fs.mkdirSync(UD, { recursive: true }); app.setPath('userData', UD);

// 2) Chromium switches for GNOME/Wayland: portal global shortcuts, PipeWire screen capture, CSD
const feats = ['GlobalShortcutsPortal', 'WebRTCPipeWireCapturer', 'WaylandWindowDecorations'];
const prev = app.commandLine.getSwitchValue('enable-features');
app.commandLine.appendSwitch('enable-features', [prev, ...feats].filter(Boolean).join(','));


// 3) Chrome-on-Linux UA + client hints for third-party pages (Google/Apple/email login, Cloudflare).
//    perplexity.ai keeps the vendor desktop UA so the backend still sees the desktop app.
const CHV = process.versions.chrome, MAJ = CHV.split('.')[0];
const CHROME_UA = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${MAJ}.0.0.0 Safari/537.36`;
const BRANDS = `"Chromium";v="${MAJ}", "Google Chrome";v="${MAJ}", "Not?A_Brand";v="99"`;
const FULL = `"Chromium";v="${CHV}", "Google Chrome";v="${CHV}", "Not?A_Brand";v="99.0.0.0"`;
const isVendor = (u) => { try { const h = new URL(u).hostname; return h === 'perplexity.localhost' || h === 'perplexity.ai' || h.endsWith('.perplexity.ai') || h === 'localhost' || h === '127.0.0.1'; } catch { return true; } };
const vendorUA = app.userAgentFallback;
const fixSession = (s) => {
  if (!s || s.__pplxShim) return; s.__pplxShim = true;
  s.webRequest.onBeforeSendHeaders({ urls: ['https://*/*', 'http://*/*', 'wss://*/*'] }, (d, cb) => {
    const h = d.requestHeaders;
    if (!isVendor(d.url)) {
      h['User-Agent'] = CHROME_UA;
      for (const k of Object.keys(h)) if (/^sec-ch-ua/i.test(k)) delete h[k];
      h['sec-ch-ua'] = BRANDS; h['sec-ch-ua-mobile'] = '?0'; h['sec-ch-ua-platform'] = '"Linux"';
    }
    cb({ requestHeaders: h });
  });
};
app.on('session-created', fixSession);
app.on('web-contents-created', (_e, wc) => {
  // Chrome UA in JS (navigator.userAgent / userAgentData) for third-party pages opened in-app
  wc.on('did-start-navigation', (ev) => { if (ev.isMainFrame && !isVendor(ev.url)) wc.setUserAgent(CHROME_UA); });
  // 4) popups/menus over drag regions must not be draggable; 5) window controls readable on light & dark
  wc.on('dom-ready', () => {
    if (!isVendor(wc.getURL())) return;
    wc.insertCSS(`[role=menu],[role=menuitem],[role=listbox],[role=option],[role=dialog],[role=tooltip],[role=combobox],
      [data-radix-popper-content-wrapper],[data-radix-portal],[data-side],[data-state=open],dialog,select,input,textarea,button,a,
      [contenteditable],[data-no-drag],.no-drag{-webkit-app-region:no-drag !important}
      [aria-label="Minimize" i],[aria-label="Maximize" i],[aria-label="Restore" i],[aria-label="Close" i],[aria-label="Restore Down" i],
      [data-window-control],[class*="caption-button" i]{opacity:1 !important;
        filter:drop-shadow(0 0 1px rgb(from currentColor calc(255 - r) calc(255 - g) calc(255 - b) / .9)) drop-shadow(0 0 2px rgb(from currentColor calc(255 - r) calc(255 - g) calc(255 - b) / .6))}`).catch(() => {});
  });
});
app.whenReady().then(() => { fixSession(session.defaultSession); app.userAgentFallback = vendorUA; });

// 6) deep links: vendor scheme perplexity-app:// (login/handoff) + perplexity:// alias, only if unowned
const OUR = process.env.CHROME_DESKTOP || 'perplexity-desktop.desktop';
const owner = (scheme) => { try { return cp.execFileSync('xdg-mime', ['query', 'default', `x-scheme-handler/${scheme}`], { encoding: 'utf8', timeout: 3000 }).trim(); } catch { return ''; } };
const origSet = app.setAsDefaultProtocolClient.bind(app);
app.setAsDefaultProtocolClient = (scheme, ...rest) => {
  const o = owner(scheme);
  if (o && o !== OUR) { log(`not registering ${scheme}:// — owned by ${o}`); return false; }
  if (o === OUR) return true; // already ours via the .desktop MimeType (launcher wraps the right binary)
  try { return cp.spawnSync('xdg-mime', ['default', OUR, `x-scheme-handler/${scheme}`], { stdio: 'ignore', timeout: 3000 }).status === 0; } catch { return origSet(scheme, ...rest); }
};
app.whenReady().then(() => { const o = owner('perplexity'); if (!o) app.setAsDefaultProtocolClient('perplexity'); });
// perplexity://x -> perplexity-app://x so the vendor handler sees it
const mapArgv = (argv) => argv.map((a) => /^perplexity:\/\//i.test(a) ? a.replace(/^perplexity:/i, 'perplexity-app:') : a);
process.argv = mapArgv(process.argv);

// 7) global hotkey: GNOME Wayland only honours GlobalShortcutsPortal (needs xdg-desktop-portal-gnome >= 47 and
//    user consent); fallback = `perplexity-desktop --toggle` bound as a GNOME custom shortcut by install.sh.
// main window = the normal one; skip the always-on-top transparent Quick Ask ('Taskbar'), Voice and tray popups
const mainWin = () => (require('electron').BaseWindow || BrowserWindow).getAllWindows().filter((w) => !w.isDestroyed() && !w.isAlwaysOnTop() && !/Taskbar|Voice/.test(w.getTitle())).sort((a, b) => b.getBounds().width * b.getBounds().height - a.getBounds().width * a.getBounds().height)[0];
const toggle = (wasShown) => { const w = mainWin(); if (!w) return; if (wasShown) w.hide(); else { w.show(); w.focus(); } };
const shown = () => { const w = mainWin(); return !!(w && w.isVisible() && w.isFocused() && !w.isMinimized()); };
const gotLock = app.requestSingleInstanceLock();
app.requestSingleInstanceLock = () => gotLock;
if (!gotLock) log('secondary instance; forwarding argv to primary');
app.prependListener('second-instance', (_e, argv) => {
  for (let i = 0; i < argv.length; i++) if (/^perplexity:\/\//i.test(argv[i])) argv[i] = argv[i].replace(/^perplexity:/i, 'perplexity-app:');
  if (argv.includes('--toggle')) { const s = shown(); setTimeout(() => toggle(s), 50); }
  if (argv.includes('--hide')) setTimeout(() => { const w = mainWin(); w && w.hide(); }, 50);
});
const origReg = globalShortcut.register.bind(globalShortcut);
globalShortcut.register = (acc, cb) => { let ok = false; try { ok = origReg(acc, cb); } catch (e) { log('globalShortcut', acc, e.message); } if (!ok) log(`global shortcut ${acc} unavailable (Wayland?) — use: perplexity-desktop --toggle`); return ok; };

// 8) test hook: PPLX_SHIM_SHOT=<file> captures the main window after N seconds
if (process.env.PPLX_SHIM_SHOT) app.whenReady().then(() => setTimeout(async () => {
  try { const all = require('electron').webContents.getAllWebContents(); const t = all.find((c) => /signin|index|\/$/.test(c.getURL()) && !/voice|taskbar|appbar|notice/.test(c.getURL())) || mainWin().webContents; const img = await t.capturePage(); fs.writeFileSync(process.env.PPLX_SHIM_SHOT, img.toPNG());
    const rep = { contents: all.map((c) => c.getURL()), captured: t.getURL(), windows: BrowserWindow.getAllWindows().map((x) => ({ title: x.getTitle(), url: x.webContents.getURL(), visible: x.isVisible(), bounds: x.getBounds() })), userData: app.getPath('userData'), schemes: { 'perplexity-app': owner('perplexity-app'), perplexity: owner('perplexity') }, ua3p: CHROME_UA, shortcutsRegistered: globalShortcut.isRegistered ? null : null };
    fs.writeFileSync(process.env.PPLX_SHIM_SHOT + '.json', JSON.stringify(rep, null, 1)); } catch (e) { fs.writeFileSync(process.env.PPLX_SHIM_SHOT + '.err', String(e.stack)); }
}, +(process.env.PPLX_SHIM_SHOT_DELAY || 20000)));
// 10) Linux frameless layout fix: the vendor sizes its WebContentsViews from getContentSize() inside 'resize', but on
//     Linux (X11 and Wayland) maximise/restore deliver the final size after that event (CSD shadow insets are dropped
//     late), leaving the SPA view 32x10 px short: white gutters and the Close button pushed into them. Re-emit 'resize'
//     once the size has settled so the vendor re-runs its own layout.
const settle = (w) => {
  if (w.__pplxSettle) return; w.__pplxSettle = true; let t1, t2, busy = false;
  const kick = () => { if (busy || w.isDestroyed()) return; busy = true; try { w.emit('resize'); } finally { busy = false; } };
  const sched = () => { if (busy) return; clearTimeout(t1); clearTimeout(t2); t1 = setTimeout(kick, 60); t2 = setTimeout(kick, 350); };
  for (const ev of ['resize', 'resized', 'maximize', 'unmaximize', 'restore', 'show', 'enter-full-screen', 'leave-full-screen']) w.on(ev, sched);
  sched(); setTimeout(kick, 2000); // window may have been maximised/shown before we attached
};
const scanWins = () => { for (const w of (require('electron').BaseWindow || BrowserWindow).getAllWindows()) if (!w.isDestroyed() && w.isResizable()) settle(w); };
app.whenReady().then(() => { scanWins(); setInterval(scanWins, 500).unref?.(); });
log('loaded', UD);
