// Linux entry: shim first, then the untouched vendor main (static ESM imports evaluate in order).
import './linux-shim.cjs';
import './main/index.js';
