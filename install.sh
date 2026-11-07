#!/usr/bin/env bash
set -euo pipefail
SRC=$(cd "$(dirname "$0")" && pwd)
ROOT=$(readlink -m "${PPLX_ROOT:-$HOME/.local/opt/perplexity-desktop}")
BIN=${XDG_BIN_HOME:-$HOME/.local/bin}
DATA=${XDG_DATA_HOME:-$HOME/.local/share}
case ${1:-} in --help|-h) echo 'Usage: bash install.sh [--adopt]'; exit 0;; ''|--adopt) ;; *) echo 'Unknown option' >&2; exit 2;; esac
[[ $# -le 1 && $(uname -s)-$(uname -m) == Linux-x86_64 ]] || exit 2
case "$ROOT" in /|"$HOME"|"$HOME/.local"|"$HOME/.local/opt"|"$SRC") echo 'Unsafe installation root' >&2; exit 1;; esac
GLIBC=$(getconf GNU_LIBC_VERSION | awk '{print $2}')
[[ $(printf '%s\n' 2.39 "$GLIBC" | sort -V | head -1) == 2.39 ]] || { echo 'PerplexityDeck requires glibc 2.39 or newer (Debian 13 or a supported Fedora release).' >&2; exit 1; }
for tool in node gpg tar flock ldd; do command -v "$tool" >/dev/null || { echo "Missing $tool. See docs/INSTALL.md" >&2; exit 1; }; done
command -v 7zz >/dev/null || command -v 7z >/dev/null || { echo '7-Zip required' >&2; exit 1; }
node -e 'if(+process.versions.node.split(".")[0]<18)process.exit(1)'
for alias in perplexitydeck perplexity-desktop perplexity; do
 if [[ -e $BIN/$alias || -L $BIN/$alias ]]; then
  [[ -L $BIN/$alias && $(readlink -f "$BIN/$alias") == "$ROOT/perplexity-desktop.sh" ]] || { echo "Refusing to replace unrelated $BIN/$alias" >&2; exit 1; }
 fi
done
mkdir -p "$ROOT/updater" "$ROOT/share" "$BIN" "$DATA/applications" "${XDG_CONFIG_HOME:-$HOME/.config}"
cp -a "$SRC/updater/." "$ROOT/updater/"
cp -a "$SRC/share/." "$ROOT/share/"
install -m755 "$SRC/perplexity-desktop.sh" "$ROOT/perplexity-desktop.sh"
install -m755 "$SRC/uninstall.sh" "$ROOT/uninstall.sh"
if [[ ${1:-} == --adopt ]]; then PPLX_ROOT="$ROOT" node "$ROOT/updater/updater.js" --reshim; else PPLX_ROOT="$ROOT" node "$ROOT/updater/updater.js"; fi
for alias in perplexitydeck perplexity-desktop perplexity; do ln -sfn "$ROOT/perplexity-desktop.sh" "$BIN/$alias"; done
node - "$SRC/share/perplexity-desktop.desktop" "$DATA/applications/perplexity-desktop.desktop" "$BIN/perplexitydeck" "$ROOT/share/icons/perplexity-desktop-512.png" <<'JS'
const fs=require('fs');let s=fs.readFileSync(process.argv[2],'utf8').replace(/^Exec=@BIN@/gm,()=> 'Exec='+JSON.stringify(process.argv[4])).replace(/^Icon=.*$/m,()=> 'Icon='+process.argv[5]);fs.writeFileSync(process.argv[3],s);
JS
if command -v xdg-mime >/dev/null; then
 for scheme in perplexity-app perplexity; do
  owner=$(xdg-mime query default "x-scheme-handler/$scheme" 2>/dev/null || true)
  case "$owner" in ''|perplexity-desktop.desktop) xdg-mime default perplexity-desktop.desktop "x-scheme-handler/$scheme" || true;; esac
 done
fi
command -v update-desktop-database >/dev/null && update-desktop-database "$DATA/applications" || true
echo "Installed PerplexityDeck. Run: $BIN/perplexitydeck"
