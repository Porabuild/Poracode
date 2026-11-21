import type { RemoteImageRefValue } from "@/shared/remote";
import {
  cardVariantForRef,
  environmentImageRefKey,
  environmentLocalImageKey,
  type EnvironmentImagePriority,
  type EnvironmentImageVariant,
} from "@/shared/remote/clientEnvironmentImages";
import { resolveLocalFileUrlPath } from "@/shared/promptContent";
import type { ImageViewSource } from "./imageViewSource";
import type { LightboxImage } from "@/renderer/components/composer/ImageLightbox";
import type { RemoteImageReadiness } from "@/renderer/state/remoteServers/environmentSessions";

export function galleryImageResource(
  readiness: RemoteImageReadiness,
  target: RemoteImageRefValue | string,
): NonNullable<LightboxImage["resource"]> {
  // Strip tiles ask for the host's downscaled card. Small refs already fit a
  // tile, so they keep the full coordinate instead of splitting the cache.
  const previewVariant: EnvironmentImageVariant | undefined =
    typeof target === "string" ? "card" : cardVariantForRef(target);
  const read = (variant?: EnvironmentImageVariant) =>
    typeof target === "string"
      ? readiness.resolvePath(target, variant)
      : readiness.resolveRef(target, variant);
  const listen = (
    listener: () => void,
    priority: EnvironmentImagePriority = "focus",
    variant?: EnvironmentImageVariant,
  ) =>
    typeof target === "string"
      ? readiness.subscribePath(target, listener, priority, variant)
      : readiness.subscribeRef(target, listener, priority, variant);
  const ask = (priority: EnvironmentImagePriority = "focus", variant?: EnvironmentImageVariant) => {
    if (typeof target === "string") readiness.requestPath(target, priority, variant);
    else readiness.requestRef(target, priority, variant);
  };
  return {
    key:
      typeof target === "string"
        ? environmentLocalImageKey(target)
        : environmentImageRefKey(target),
    getSnapshot: () => read(),
    subscribe: (listener, priority) => listen(listener, priority),
    request: (priority) => {
      ask(priority);
    },
    getPreviewSnapshot: () => read(previewVariant),
    subscribePreview: (listener, priority = "foreground") =>
      listen(listener, priority, previewVariant),
    requestPreview: (priority = "foreground") => {
      ask(priority, previewVariant);
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
