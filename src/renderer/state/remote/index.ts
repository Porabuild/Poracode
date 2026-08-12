/**
 * Canonical remote-sync primitives used by browser and Electron remote-client
 * paths. Host integrations can extend {@link dispatchRemoteSupervisorEvent}
 * through {@link RemoteDispatchHooks} without forking the state model.
 *
 * These primitives live with canonical renderer state so every host surface
 * shares one state model without a second application layer.
 */
export {
  applyThreadSnapshot,
  dispatchRemoteSupervisorEvent,
  clearPendingRuntimeEvents,
  isThreadVisible,
} from "./sync";
export type { RemoteDispatchHooks } from "./sync";
export {
  collectRuntimeEventsFromSupervisoryMessage,
  requestsFromRuntimeItems,
  type OpenRuntimeRequestPreview,
} from "./runtimeRequests";
export { shouldReplaceRuntimeItemsFromSnapshot } from "./guards";
