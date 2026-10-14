import {
  environmentImageRefKey,
  environmentLocalImageKey,
  type RemoteEnvironmentImageCache,
} from "@/shared/remote/clientEnvironmentImages";
import type { RemoteImageReadiness } from "./remoteServers/environmentSessions";

/** Pure snapshots and explicit prioritized requests for a stable cache owner. */
export function createCacheImageReadiness(
  cache: RemoteEnvironmentImageCache,
): RemoteImageReadiness {
  return {
    resolveRef: (ref) => cache.resolutionForImageKey(environmentImageRefKey(ref)).url,
    subscribeRef: (ref, listener, priority) =>
      cache.subscribeImageKey(environmentImageRefKey(ref), listener, priority),
    requestRef: (ref, priority) => {
      cache.imageRefResolution(ref, priority);
    },
    resolvePath: (path) => cache.resolutionForImageKey(environmentLocalImageKey(path)).url,
    subscribePath: (path, listener, priority) =>
      cache.subscribeImageKey(environmentLocalImageKey(path), listener, priority),
    requestPath: (path, priority) => {
      cache.localImageResolution(path, priority);
    },
  };
}
