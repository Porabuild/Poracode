// Device-owned procedures served locally in standalone attach mode.
//
// Attached Electron owns native device/window functions; the headless owner
// owns backend processes, authoritative SQLite/settings/keys and server
// procedures. This single constant is the ownership list both the main-side
// attach handler and its tests consume, so no mirrored copy can drift (see
// .agents/docs/versioning.md).
//
// `getSharedSettings` is deliberately absent: settings are server-authoritative
// here and arrive over the existing remote owner pull/push sync, never from a
// local file. Unknown/unsupported local calls loud-reject instead of routing
// to a backend that does not exist in attach mode.
import type { MainLocalProcedureName } from "./procedureMap";

export const ATTACH_DEVICE_PROCEDURES: ReadonlySet<MainLocalProcedureName> = new Set([
  "setRendererEventInterests",
  "probeTlsCertificateFingerprint",
  "getKeybindings",
  "setKeybindings",
  "setGlobalShortcutsSuspended",
  "focusWindow",
  "getUpdateStatus",
  "checkForUpdate",
  "startUpdateDownload",
  "installUpdate",
]);

export function isAttachDeviceProcedure(name: string): name is MainLocalProcedureName {
  return ATTACH_DEVICE_PROCEDURES.has(name as MainLocalProcedureName);
}
