# Verification

Fresh source installation completed on Fedora 44 and Debian 13. Tests verified the official repository's InRelease signature against the pinned public key, package-list size and hash, package checksum, application shim entry point, ELF format, and native runtime library dependencies. The tested upstream version was 26.11.0 with Electron 44.9.1.

Debian 12 installation was tested and failed the native dependency check: the bundled `gws` helper requires GLIBC_2.39. The installer now checks for glibc 2.39 before downloading or changing application files. Debian 13 supplies a compatible libc. No helper was silently removed to bypass that requirement.

Eight regression tests cover installer boundaries, old-libc rejection, update locking, incomplete versions, activation recovery, and preserving the upstream profile and application identity. A host installation used paths containing spaces; desktop-entry validation passed.

The installed app was renamed through its desktop entry and primary `perplexitydeck` command. Existing aliases, profile paths, internal keyring identity, and login protocol handlers were preserved. The working upstream runtime was not upgraded for this rename.

Fresh browser consent, paid searches, graphical Debian operation, and a complete real update/rollback cycle were not exercised. The source repository excludes runtime bundles, accounts, browser profiles, and recovery files.

## Installer and documentation review, 2026-11-06

Fresh source installation completed on Fedora 44 and Debian 13 with upstream Perplexity 26.11.0 and Electron 44.9.1. The signed repository metadata, package hashes, runtime dependencies, and desktop entry passed verification. All eight regression tests pass. Debian 12 is intentionally rejected before downloading because this upstream package requires glibc 2.39 or newer.

Source secret scans, shell syntax, and local Markdown links passed. These checks used disposable installations and fixtures. Fresh interactive sign-in, paid requests, and full graphical acceptance were not repeated; existing account profiles were left in place.

## 1.0 release verification

Fresh source installation, the regression suite, desktop-entry validation, and clean-profile launch completed on Fedora 44 and Debian 13. Tests ran as an unprivileged user with isolated application, configuration, launcher, and data paths. Launcher paths included spaces.

Virtual display captures used container-only sandbox and software-rendering options; these options were not added to production launchers. Fresh browser consent, paid requests, real account persistence, and complete graphical workflows were not exercised.
