# Install PerplexityDeck

Both distributions use `bash install.sh` from the same source checkout. Linux x86-64 and a graphical desktop session are required. Install the system libraries first.

## Fedora

```bash
sudo dnf install nodejs gnupg2 7zip tar util-linux procps-ng nss gtk3 alsa-lib mesa-libgbm desktop-file-utils
```

## Debian 13 or newer

```bash
sudo apt update
sudo apt install nodejs gnupg p7zip-full tar util-linux procps libnss3 libgtk-3-0t64 libasound2t64 libgbm1 desktop-file-utils
```

PerplexityDeck requires Node 18 or newer and **glibc 2.39 or newer**. The upstream Google Workspace helper requires this libc version. Debian 12 does not meet it; use Debian 13 or newer. The installer checks this before downloading or changing application files.

## Install and launch

```bash
bash install.sh
~/.local/bin/perplexitydeck
```

The retained account profile is `perplexity-desktop` under the XDG config directory. The primary command is `perplexitydeck`; `perplexity` and `perplexity-desktop` remain compatibility aliases. The internal desktop ID stays `perplexity-desktop.desktop` so existing protocol callbacks and window grouping keep working.

To rename an existing installation without upgrading its application version, close it and run `bash install.sh --adopt`. The installer reapplies the Linux shim and preserves a backup of the packed application archive.

For disposable tests, set `PPLX_ROOT`, `XDG_BIN_HOME`, `XDG_DATA_HOME`, and `XDG_CONFIG_HOME` to temporary directories. Close the app before changing the installed integration. Ordinary reinstall preserves saved accounts; purge options explicitly remove them.

This installs the desktop integration, not a provider account or subscription. Finish any browser authentication yourself through an upstream-supported method.
