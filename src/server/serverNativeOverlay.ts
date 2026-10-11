/**
 * Typed reader for the single native-overlay implementation. The install
 * logic lives in `scripts/server-native-overlay.mjs` and is shipped inside the
 * server tarball, so the TypeScript side re-exports rather than maintaining a
 * second copy (docs/.agents/docs/versioning.md).
 */
export {
  applyServerNativeOverlay,
  betterSqlite3OverlayTargets,
  overlayTargets,
  readBetterSqlite3Overlay,
  readNodePtyOverlay,
  selectOverlayTarget,
  validateOverlayWrapperVersions,
} from "../../scripts/server-native-overlay.mjs";

/** Point `<prefix>/current` at a release directory (relative symlink). */
export { writeCurrentSymlink } from "../../scripts/server-release-install.mjs";
