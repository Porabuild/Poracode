/**
 * Re-export shim. The guard moved to the shared renderer module
 * `@/renderer/state/remote/guards` alongside the other snapshot helpers, so the
 * desktop-as-client store can import it without crossing into `@/mobile`.
 */
export { shouldReplaceRuntimeItemsFromSnapshot } from "@/renderer/state/remote/guards";
