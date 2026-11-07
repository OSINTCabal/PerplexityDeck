#!/bin/sh
# Runs updater.js with Node >= 18. The vendor Electron has the RunAsNode fuse disabled, so it cannot act as node:
# use system node if present, else a pinned official Node.js build (sha256-pinned) cached per user.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
NV=v22.23.4; NSHA=1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce
C="${XDG_CACHE_HOME:-$HOME/.cache}/perplexity-desktop-updater"; N="$C/node-$NV-linux-x64/bin/node"
NODE=""
if command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]>=18' 2>/dev/null)" = true ]; then NODE=node; fi
if [ -z "$NODE" ]; then
  if [ ! -x "$N" ]; then mkdir -p "$C"; T="$C/node-$NV-linux-x64.tar.xz"
    curl -fsSL --proto '=https' -o "$T.part" "https://nodejs.org/dist/$NV/node-$NV-linux-x64.tar.xz"
    echo "$NSHA  $T.part" | sha256sum -c --quiet - || { rm -f "$T.part"; echo "node download sha256 mismatch" >&2; exit 1; }
    mv "$T.part" "$T"; tar -xJf "$T" -C "$C" "node-$NV-linux-x64/bin/node"; rm -f "$T"; fi
  NODE="$N"; fi
exec "$NODE" "$HERE/updater.js" "$@"
