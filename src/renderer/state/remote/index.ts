/**
 * Shared remote-sync primitives used by both the desktop-as-client remote
 * servers store (`remoteServersStore`) and the mobile PWA's store sync
 * (`mobile/storeSync`). The desktop imports the core mutators directly; the
 * mobile PWA wraps {@link dispatchRemoteSupervisorEvent} with its own Live
 * Activity / terminal-feed / git-summaries fan-out via {@link RemoteDispatchHooks}.
 *
 * Relocating these primitives here breaks the previous renderer ↔ mobile
 * import cycle: mobile modules still import renderer state (one direction), but
 * the renderer no longer imports anything from `@/mobile`.
 */
export {
  applyThreadSnapshot,
  dispatchRemoteSupervisorEvent,
  clearPendingRuntimeEvents,
} from "./sync";
export type { RemoteDispatchHooks } from "./sync";
export {
  collectRuntimeEventsFromSupervisoryMessage,
  requestsFromRuntimeItems,
  type OpenRuntimeRequestPreview,
} from "./runtimeRequests";
export { shouldReplaceRuntimeItemsFromSnapshot } from "./guards";
