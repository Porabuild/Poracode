import type { RemoteImageRefValue } from "@/shared/remote";
import {
  environmentImageRefKey,
  environmentLocalImageKey,
} from "@/shared/remote/clientEnvironmentImages";
import { resolveLocalFileUrlPath } from "@/shared/promptContent";
import type { ImageViewSource } from "./imageViewSource";
import type { LightboxImage } from "@/renderer/components/composer/ImageLightbox";
import type { RemoteImageReadiness } from "@/renderer/state/remoteServers/environmentSessions";

export function galleryImageResource(
  readiness: RemoteImageReadiness,
  target: RemoteImageRefValue | string,
): NonNullable<LightboxImage["resource"]> {
  return typeof target === "string"
    ? {
        key: environmentLocalImageKey(target),
        getSnapshot: () => readiness.resolvePath(target),
        subscribe: (listener) => readiness.subscribePath(target, listener, "focus"),
        request: () => {
          readiness.requestPath(target, "focus");
        },
      }
    : {
        key: environmentImageRefKey(target),
        getSnapshot: () => readiness.resolveRef(target),
        subscribe: (listener) => readiness.subscribeRef(target, listener, "focus"),
        request: () => {
          readiness.requestRef(target, "focus");
        },
      };
}

/** Coordinate provenance survives URL deduplication and pending-to-ready changes. */
export class GalleryImageReadiness {
  readonly readyRemoteRefs: RemoteImageRefValue[] = [];
  readonly readyRemotePaths: string[] = [];
  readonly pendingRemoteRefs: RemoteImageRefValue[] = [];
  readonly pendingRemotePaths: string[] = [];
  private readonly refKeys = new Set<string>();
  private readonly paths = new Set<string>();

  recordRef(source: ImageViewSource): void {
    if (!source.remoteRef) return;
    const key = environmentImageRefKey(source.remoteRef);
    if (this.refKeys.has(key)) return;
    this.refKeys.add(key);
    if (source.src) this.readyRemoteRefs.push(source.remoteRef);
    else this.pendingRemoteRefs.push(source.remoteRef);
  }

  recordPath(path: string, src: string): void {
    // Native file/protocol and external URLs have no revocable cache coordinate.
    // The authenticated byte cache publishes blob URLs, or an empty snapshot.
    if (src && !src.startsWith("blob:")) return;
    if (this.paths.has(path)) return;
    this.paths.add(path);
    if (src) this.readyRemotePaths.push(path);
    else this.pendingRemotePaths.push(path);
  }

  recordLocalUrl(url: string, src: string, pathForUrl?: (url: string) => string): void {
    if (src && !src.startsWith("blob:")) return;
    try {
      this.recordPath(pathForUrl ? pathForUrl(url) : resolveLocalFileUrlPath(url), src);
    } catch {
      // A resolver may render a URL without an addressable host path. Keep the
      // image, but do not fabricate an authenticated readiness coordinate.
    }
  }
}
