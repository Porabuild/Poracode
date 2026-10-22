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
    resolveRef: (ref, variant) =>
      cache.resolutionForImageKey(environmentImageRefKey(ref, variant)).url,
    subscribeRef: (ref, listener, priority, variant) =>
      cache.subscribeImageKey(environmentImageRefKey(ref, variant), listener, priority),
    requestRef: (ref, priority, variant) => {
      cache.imageRefResolution(ref, priority, variant);
    },
    resolvePath: (path, variant) =>
      cache.resolutionForImageKey(environmentLocalImageKey(path, variant)).url,
    subscribePath: (path, listener, priority, variant) =>
      cache.subscribeImageKey(environmentLocalImageKey(path, variant), listener, priority),
    requestPath: (path, priority, variant) => {
      cache.localImageResolution(path, priority, variant);
    },
  };
}
