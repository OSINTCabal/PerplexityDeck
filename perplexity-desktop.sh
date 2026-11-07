#!/bin/sh
cd "$HOME" 2>/dev/null || cd /
# perplexity-desktop launcher. Extra: --toggle (show/hide running window; bind to a GNOME shortcut),
#   --check-updates (desktop action), --update [--force|--rollback|--check]
OPT="${PPLX_ROOT:-$HOME/.local/opt/perplexity-desktop}"
export PPLX_ROOT="$OPT"
case "${1:-}" in
  --update) shift; exec "$OPT/updater/run-update.sh" "$@";;
  --check-updates)
    out=$("$OPT/updater/run-update.sh" --check 2>&1); rc=$?
    if [ $rc = 10 ]; then msg="Update available — installing…"; command -v notify-send >/dev/null && notify-send -a Perplexity -i perplexity-desktop "Perplexity" "$msg"
      "$OPT/updater/run-update.sh" && msg="Updated. Restart Perplexity to use the new version." || msg="Update failed — see: journalctl --user -u perplexity-desktop-update"
    elif [ $rc = 0 ]; then msg="Perplexity is up to date."; else msg="Update check failed."; fi
    command -v notify-send >/dev/null && notify-send -a Perplexity -i perplexity-desktop "Perplexity" "$msg"; echo "$out"; echo "$msg"; exit 0;;
esac
. "$OPT/updater/select-runtime.sh"
APP=$(select_runtime)
[ -n "$APP" ] || { echo "perplexity-desktop: no installed build in $OPT" >&2; exit 1; }
export CHROME_DESKTOP=perplexity-desktop.desktop
export PERPLEXITY_XPLAT_ELECTRON_USER_DATA_PATH="${XDG_CONFIG_HOME:-$HOME/.config}/perplexity-desktop"
# Native Wayland: frameless window fills the screen exactly when maximised (under XWayland Chromium's CSD shadow
# insets leave ~20px gutters), crisp fractional HiDPI, text-input-v3 IME. PPLX_OZONE=x11 forces XWayland.
OZ="${PPLX_OZONE:-}"; if [ -z "$OZ" ]; then if [ -n "${WAYLAND_DISPLAY:-}" ]; then OZ=wayland; else OZ=x11; fi; fi
FLAGS="--ozone-platform=$OZ"; [ "$OZ" = wayland ] && FLAGS="$FLAGS --enable-wayland-ime --wayland-text-input-version=3"
# chrome-sandbox is not SUID in a per-user install; use the namespace sandbox, else fall back
if ! unshare -Ur true 2>/dev/null; then FLAGS="$FLAGS --no-sandbox"; fi
[ -n "${PPLX_EXTRA_FLAGS:-}" ] && FLAGS="$FLAGS $PPLX_EXTRA_FLAGS"
exec "$APP/perplexity" $FLAGS "$@"
