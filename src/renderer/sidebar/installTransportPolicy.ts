import { isChatSidebarSurface } from "@/renderer/clientSurface";
import { installRemoteTransportFactories } from "@/renderer/state/remoteServers/transportFactories";
import { createSidebarTransportPolicy } from "./transportPolicy";

export const sidebarTransportPolicy = createSidebarTransportPolicy();
// First bootstrap dependency: installed before stores hydrate or any surface mounts.
if (isChatSidebarSurface()) {
  installRemoteTransportFactories(sidebarTransportPolicy);
}
