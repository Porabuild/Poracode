// Installs the remote `window.poracode` shim before any renderer module
// evaluates, so reused desktop components can call the bridge safely.
// (The crypto.randomUUID polyfill for insecure contexts lives in mobile.html
// as a classic script — bundler chunks can evaluate before this module.)
import { installRemoteBridge } from "./bridge";

installRemoteBridge();
