import {
  disposeNativeRuntime,
  resolveNativeNode,
  startNativeRuntimeSession,
} from "../native/runtime";

/**
 * Kick off the native Node resolver during supervisor boot so the
 * (potentially slow) login-shell probe runs in parallel with the rest of
 * boot. Resolves to nothing — callers don't need to await; subsequent
 * `resolveInstallNodePath` callers reuse the same memoized promise from
 * `native/runtime`.
 *
 * Surfaces a single `console.warn` line when the background download
 * install fails (corporate proxy, DNS block, checksum mismatch). Without
 * this, failures are completely silent and users keep paying the
 * Electron-as-Node startup tax indefinitely.
 */
export function prefetchNativeNodeRuntime(baseDir: string): () => Promise<void> {
  startNativeRuntimeSession(baseDir);
  let warnedFailure = false;
  void resolveNativeNode({
    baseDir,
    onProgress: (event) => {
      if (event.kind === "background-install-failed" && !warnedFailure) {
        warnedFailure = true;
        console.warn(
          `[supervisor] background Node runtime install failed; ` +
            `staying on Electron-as-Node fallback. Reason: ${event.reason ?? "unknown"}`,
        );
        return;
      }
      if (event.kind === "background-install-ready") {
        console.log(
          `[supervisor] background Node runtime ready at ${event.nodePath}; ` +
            `next launch will use bare-Node hooks.`,
        );
      }
    },
  }).catch((error) => {
    if (error?.name !== "AbortError")
      console.warn("[supervisor] Node runtime probe failed:", error);
  });
  return () => disposeNativeRuntime(baseDir);
}
