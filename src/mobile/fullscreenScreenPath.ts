/**
 * True for routes that render a fullscreen overlay screen with their own
 * chrome and no `.m-main` (RootLayout's "fullscreen" layout). These carry the
 * `m-screen` view-transition name; navigations into/out of them add the
 * `screen` transition type so the page chrome holds steady under the slide.
 *
 * Kept dependency-free (no store/renderer imports) so the pure navigation
 * predicates in lightweightThreadListPop can share it while staying testable
 * in a plain node environment.
 */
export function isFullscreenScreenPath(path: string): boolean {
  return (
    path.startsWith("/workspace/") ||
    path.startsWith("/notes/") ||
    path.startsWith("/pr/") ||
    path.startsWith("/terminal/")
  );
}
