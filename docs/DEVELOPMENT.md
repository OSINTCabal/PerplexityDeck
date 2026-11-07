# Develop PerplexityDeck

The source contains Linux launchers, update scripts, desktop entries, artwork, and tests. Downloaded upstream applications and personal profiles are not part of this repository.

```bash
bash -n install.sh
node --test tests/*.test.cjs
```

Use Node 18 or newer for the test runner. Run installation, rollback, and uninstall checks only against disposable paths, as described in [installation](INSTALL.md).
