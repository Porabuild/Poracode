import { hasElectronHostBridge } from "./clientRuntime";

/**
 * A hosted web client can keep running a previous build after a deploy has
 * removed that build's lazy chunks: an open tab, or the service worker's cached
 * shell when the network is slow at launch. Importing one of those chunks then
 * fails. Reloading once loads the current build; another chunk failure soon
 * after is a real fault and still reaches the crash screen.
 */
const RELOAD_MARKER_KEY = "poracode:stale-build-reload";
const RELOAD_WINDOW_MS = 60_000;

// Each engine words a failed `import()` differently; Vite adds its own for CSS.
const STALE_CHUNK_MESSAGES = [
  "Failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "Importing a module script failed",
  "Unable to preload CSS",
];

let reloadPage = () => window.location.reload();
let reloading = false;

export function isStaleBuildChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return STALE_CHUNK_MESSAGES.some((candidate) => message.includes(candidate));
}

/** True once a reload is under way, so crash surfaces render nothing meanwhile. */
export function isStaleBuildReloadPending(): boolean {
  return reloading;
}

/**
 * Reloads the page when `error` is a missing build chunk in a browser client
 * and no such reload happened in this tab within the last minute. Returns
 * whether a reload is under way. Electron loads its build from the app
 * package, so a missing chunk there is never a stale deploy.
 */
export function reloadForStaleBuild(error: unknown): boolean {
  if (reloading) return true;
  if (hasElectronHostBridge() || !isStaleBuildChunkError(error)) return false;
  const now = Date.now();
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_MARKER_KEY));
    if (now - last < RELOAD_WINDOW_MS) return false;
    window.sessionStorage.setItem(RELOAD_MARKER_KEY, String(now));
  } catch {
    // Without the marker a build that is really broken would reload forever.
    return false;
  }
  reloading = true;
  reloadPage();
  return true;
}

export function resetStaleBuildRecoveryForTest(reload: () => void): void {
  reloading = false;
  reloadPage = reload;
}
