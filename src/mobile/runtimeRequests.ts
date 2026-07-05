/**
 * Re-export shim. The primitives moved to the shared renderer module
 * `@/renderer/state/remote/runtimeRequests` so the desktop-as-client store can
 * import them without crossing back into `@/mobile` (which would re-create the
 * renderer ↔ mobile import cycle). Mobile callers keep importing from here.
 */
export {
  collectRuntimeEventsFromSupervisoryMessage,
  requestsFromRuntimeItems,
  type OpenRuntimeRequestPreview,
} from "@/renderer/state/remote/runtimeRequests";
