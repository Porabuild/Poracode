import { ContentSurface } from "@/renderer/components/common/ContentSurface";
/* oxlint-disable jsx-a11y/media-has-caption -- Agent-provided video files have no caption track in the resource contract. */
import { isClientDraftAsset } from "@/renderer/state/composerDrafts/clientDraftDatabase";
import { readDraftAsset } from "@/renderer/state/composerDrafts/readDraftAsset";
import { resolveThreadImageAuthority } from "../thread/threadImageAuthority";
import { galleryImageResource } from "../thread/ChatPane/parts/items/threadGalleryImageReadiness";
import type { RemoteImageReadiness } from "@/renderer/state/remoteServers/environmentSessions";
import type { ProjectLocation } from "@/shared/contracts";
import { chatVideoFilePath } from "@/shared/chatVideo";
import { localImageThumbUrl } from "@/shared/localImageThumb";
import type { EnvironmentImagePriority } from "@/shared/remote/clientEnvironmentImages";
import { memo, useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Film,
  Image as ImageIcon,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@heroui/react";
import { useFileMediaSource } from "@/renderer/components/media/useFileMediaSource";
import { attachmentImageUrl, type Attachment } from "./useAttachments";
import { ImageLightboxActions } from "./ImageLightboxActions";
import { MAX_SCALE, MIN_SCALE, SCALE_STEP, useImageLightboxZoom } from "./useImageLightboxZoom";
import { useThreadGalleryImages } from "../thread/useThreadGalleryImages";
import { threadVideosForLightbox, useThreadVideos } from "../thread/threadVideos";
import { useRenderOnNotify } from "@/renderer/state/remoteServers/useRemoteImageReadiness";

/** A pre-resolved image or video for the lightbox: a renderable URL plus an accessible label. */
export interface LightboxImage {
  /** Media kind; defaults to `"image"`. */
  kind?: "image" | "video";
  /** Renderable media URL — a `data:`, `poracode-local://`, or remote URL. */
  src: string;
  /** Already-displayed thumbnail to retain until the original is decoded. */
  previewSrc?: string;
  /**
   * Tiny host stand-in for the thumbnail strip only. The stage must not use
   * it: the bitmap is a few dozen pixels and has no layout dimensions.
   */
  stripPreviewSrc?: string;
  width?: number;
  height?: number;
  /** Accessible label / alt text. */
  alt?: string;
  /** Original download name and MIME type, retained when the display URL is opaque. */
  fileName?: string;
  mime?: string;
  /** Local or remote workspace path for requesting video playback grants. */
  videoPath?: string;
  /** Project location used to request video media grants. */
  mediaLocation?: ProjectLocation;
  /** Optional owner-supplied byte read (e.g. the pinned client that issued a media grant). */
  readBytes?: () => Promise<Uint8Array<ArrayBuffer>>;
  /**
   * Stable cache coordinate. `request` loads the full original for the open
   * image. Preview methods read the host's downscaled card for the strip and
   * do not start that original fetch.
   */
  resource?: {
    key: string;
    subscribe: (listener: () => void, priority?: EnvironmentImagePriority) => () => void;
    getSnapshot: () => string;
    request: (priority?: EnvironmentImagePriority) => void;
    getPreviewSnapshot?: () => string;
    subscribePreview?: (listener: () => void, priority?: EnvironmentImagePriority) => () => void;
    requestPreview?: (priority?: EnvironmentImagePriority) => void;
  };
}

type LightboxState = {
  images: readonly LightboxImage[];
  initialIndex: number;
  nonce: number;
  /**
   * Thread whose gallery opened this lightbox, when it was opened live. The
   * thread's gallery hook updates the image set through
   * {@link updateImageLightboxFromThread} as pending host-held blobs resolve.
   */
  liveThreadId: string | null;
  includeThreadVideos: boolean;
  dispose?: () => void;
};

let lightboxState: LightboxState | null = null;
let lightboxNonce = 0;
let attachmentOpenGeneration = 0;
const lightboxListeners = new Set<() => void>();

export function imageLightboxRevision(): number {
  return lightboxNonce;
}

function emitLightboxChange() {
  for (const listener of lightboxListeners) listener();
}

function subscribeLightbox(listener: () => void): () => void {
  lightboxListeners.add(listener);
  return () => {
    lightboxListeners.delete(listener);
  };
}

function getLightboxSnapshot(): LightboxState | null {
  return lightboxState;
}

export function openImageLightbox(
  images: readonly LightboxImage[],
  initialIndex: number,
  options?: {
    readonly liveThreadId?: string;
    readonly includeThreadVideos?: boolean;
    readonly onClose?: () => void;
  },
): void {
  if (images.length === 0) return;
  attachmentOpenGeneration++;
  lightboxState?.dispose?.();
  lightboxState = {
    images: [...images],
    initialIndex: Math.min(Math.max(0, initialIndex), images.length - 1),
    nonce: ++lightboxNonce,
    liveThreadId: options?.liveThreadId ?? null,
    includeThreadVideos: options?.includeThreadVideos ?? false,
    ...(options?.onClose ? { dispose: options.onClose } : {}),
  };
  emitLightboxChange();
}

/**
 * Replaces the open lightbox's image set when (and only when) it was opened
 * from the same thread's gallery. The view relocates its current image by
 * source, so a pending image landing never changes what the user is looking at.
 */
export function updateImageLightboxFromThread(
  threadId: string | undefined,
  images: readonly LightboxImage[],
  videos?: readonly LightboxImage[],
): void {
  if (!lightboxState || threadId === undefined || lightboxState.liveThreadId !== threadId) return;
  if (lightboxState.images === images) return;
  const previousImages = new Map(lightboxState.images.map((image) => [imageKey(image), image]));
  const media = lightboxState.includeThreadVideos
    ? [...images, ...(videos ?? lightboxState.images.filter((image) => image.kind === "video"))]
    : images;
  lightboxState = {
    ...lightboxState,
    images: media.map((image) => {
      const previous = previousImages.get(imageKey(image));
      const previewSrc = previous?.src === image.src ? previous.previewSrc : undefined;
      const updated = previewSrc ? { ...previous, ...image, previewSrc } : image;
      // Keep the active playback grant when only the surrounding gallery changed.
      return image.kind === "video" &&
        previous?.mediaLocation &&
        JSON.stringify(previous.mediaLocation) === JSON.stringify(image.mediaLocation)
        ? { ...updated, mediaLocation: previous.mediaLocation }
        : updated;
    }),
  };
  emitLightboxChange();
}

export function updateImageLightboxFromPreview(
  previewSrc: string,
  images: readonly LightboxImage[],
  liveThreadId?: string,
): void {
  if (!lightboxState?.images.some((image) => image.src === previewSrc)) return;
  lightboxState = { ...lightboxState, images, liveThreadId: liveThreadId ?? null };
  emitLightboxChange();
}

/** A retired editor grant must not leave actions pointing at an expired resource. */
export function closeImageLightboxForSource(src: string): void {
  if (
    lightboxState?.liveThreadId === null &&
    lightboxState.images.some((image) => image.src === src)
  )
    closeImageLightbox();
}

export function openAttachmentLightbox(
  attachments: readonly Attachment[],
  initialIndex: number,
  imageUrlForPath?: (path: string) => string,
  remoteImageReadiness?: RemoteImageReadiness,
): void {
  const describe = (attachment: Attachment): LightboxImage => {
    const authority = attachment.source
      ? resolveThreadImageAuthority({
          id: "attachment-preview",
          ...(attachment.source.remoteServerId
            ? { remoteServerId: attachment.source.remoteServerId }
            : {}),
        })
      : undefined;
    const readiness = attachment.source
      ? authority?.kind === "managed"
        ? undefined
        : authority?.readiness
      : remoteImageReadiness;
    const src = attachmentImageUrl(
      attachment,
      readiness?.resolvePath ?? authority?.localImageUrl ?? imageUrlForPath,
    );
    return {
      src,
      ...(!attachment.previewUrl && readiness && (!src || src.startsWith("blob:"))
        ? { resource: galleryImageResource(readiness, attachment.path) }
        : {}),
      alt: attachment.name,
      fileName: attachment.name,
      ...(attachment.mimeType ? { mime: attachment.mimeType } : {}),
    };
  };
  if (!attachments.some((attachment) => isClientDraftAsset(attachment.path))) {
    openImageLightbox(attachments.map(describe), initialIndex);
    return;
  }
  const generation = ++attachmentOpenGeneration;
  const urls: string[] = [];
  let disposed = false;
  const release = () => {
    disposed = true;
    for (const url of urls.splice(0)) URL.revokeObjectURL(url);
  };
  void Promise.all(
    attachments.map(async (attachment): Promise<LightboxImage> => {
      if (!isClientDraftAsset(attachment.path)) return describe(attachment);
      const { blob } = await readDraftAsset(attachment);
      if (disposed || attachmentOpenGeneration !== generation) {
        release();
        throw new DOMException("Attachment preview closed", "AbortError");
      }
      const src = URL.createObjectURL(blob);
      urls.push(src);
      return {
        src,
        alt: attachment.name,
        fileName: attachment.name,
        mime: blob.type,
        readBytes: async () => new Uint8Array(await blob.arrayBuffer()),
      };
    }),
  )
    .then((images) => {
      if (disposed || attachmentOpenGeneration !== generation) {
        release();
        return;
      }
      openImageLightbox(images, initialIndex, { onClose: release });
    })
    .catch((error: unknown) => {
      release();
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("[poracode] draft image preview failed", error);
    });
}

export function closeImageLightbox(): void {
  attachmentOpenGeneration++;
  if (lightboxState === null) return;
  lightboxState.dispose?.();
  lightboxNonce++;
  lightboxState = null;
  emitLightboxChange();
}

export const ImageLightboxHost = memo(function ImageLightboxHost() {
  const state = useSyncExternalStore(subscribeLightbox, getLightboxSnapshot, getLightboxSnapshot);
  useEffect(() => closeImageLightbox, []);
  const gallery = useThreadGalleryImages(state?.liveThreadId ?? undefined, {
    lightbox: true,
    requestPending: false,
  });
  const mediaThreadId = state?.includeThreadVideos ? (state.liveThreadId ?? undefined) : undefined;
  const videos = useThreadVideos(mediaThreadId);
  useEffect(() => {
    if (mediaThreadId) {
      updateImageLightboxFromThread(
        mediaThreadId,
        gallery,
        threadVideosForLightbox(videos, mediaThreadId),
      );
    }
  }, [mediaThreadId, gallery, videos]);
  if (!state) return null;
  return (
    <ImageLightboxView
      key={state.nonce}
      images={state.images}
      initialIndex={state.initialIndex}
      onClose={closeImageLightbox}
    />
  );
});

/**
 * Source-agnostic fullscreen image and video viewer. Accepts already-resolved
 * image URLs (`data:`, `poracode-local://`, remote) as well as video entries.
 * Supports keyboard nav and prev/next chrome for multi-item galleries; a single
 * item renders without that chrome.
 */
export function ImageLightboxView(props: {
  images: readonly LightboxImage[];
  initialIndex: number;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const { images, initialIndex, onClose } = props;
  const [index, setIndex] = useState(initialIndex);
  const selected = images[index];
  const resource = selected?.resource;
  const onNotify = useRenderOnNotify();
  const resolvedSrc = useSyncExternalStore(
    resource ? (listener) => resource.subscribe(onNotify(listener)) : subscribeEmptyImage,
    resource?.getSnapshot ?? emptyImageSnapshot,
  );
  const current = selected
    ? { ...selected, src: resource ? resolvedSrc : selected.src }
    : undefined;
  const isVideo = current?.kind === "video";
  const fullSrc = current?.src;
  const previewSrc = current?.src === selected?.src ? current?.previewSrc : undefined;
  const currentImageKey =
    current && !isVideo ? (previewSrc ?? imageKey(current) ?? current.src) : undefined;
  const goPrevious = () => setIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  const goNext = () => setIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  const {
    scale,
    pan,
    swipeX,
    animate,
    stageRef,
    imageRef,
    zoomBy,
    resetZoom,
    onDoubleClick,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onLostPointerCapture,
    onClickCapture,
  } = useImageLightboxZoom(
    currentImageKey,
    images.length > 1 ? { onPrevious: goPrevious, onNext: goNext } : undefined,
  );

  useEffect(() => {
    if (resource && !resolvedSrc) resource.request();
  });

  // Reset the index when a new lightbox opens, and reset zoom/pan whenever
  // the visible image changes (prop or keyboard/button nav) — tracked during
  // render instead of sync setStates in effects.
  const [prevImageKey, setPrevImageKey] = useState({ initial: initialIndex, current: index });
  if (prevImageKey.initial !== initialIndex || prevImageKey.current !== index) {
    const nextIndex = prevImageKey.initial !== initialIndex ? initialIndex : index;
    setPrevImageKey({ initial: initialIndex, current: nextIndex });
    if (nextIndex !== index) setIndex(nextIndex);
    resetZoom();
  }

  // A live gallery update (a pending host-held blob resolving) replaces the
  // image array while this lightbox stays open: keep the user on the same
  // source by relocating the index, falling back to a clamp when it vanished.
  const [previousImages, setPreviousImages] = useState(images);
  if (previousImages !== images) {
    const previousSrc = imageKey(previousImages[index]);
    const located = previousSrc
      ? images.findIndex(
          (image) => imageKey(image) === previousSrc || image.previewSrc === previousSrc,
        )
      : -1;
    const nextIndex = located >= 0 ? located : Math.min(index, Math.max(0, images.length - 1));
    setPreviousImages(images);
    if (located >= 0) setPrevImageKey({ initial: initialIndex, current: nextIndex });
    if (nextIndex !== index) setIndex(nextIndex);
  }

  const [decodedSrc, setDecodedSrc] = useState<string>();
  useEffect(() => {
    if (isVideo || !fullSrc || !previewSrc || fullSrc === previewSrc) return;
    let active = true;
    const image = new Image();
    image.src = fullSrc;
    void image.decode().then(
      () => {
        if (active) setDecodedSrc(fullSrc);
      },
      () => {},
    );
    return () => {
      active = false;
    };
  }, [fullSrc, isVideo, previewSrc]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      } else if (e.target instanceof HTMLVideoElement) {
        return;
      } else if (e.key === "ArrowLeft") {
        setIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
      } else if (e.key === "ArrowRight") {
        setIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, images.length]);

  if (!current) return null;

  return createPortal(
    <div // eslint-disable-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- backdrop click-to-dismiss is mouse-only by design; Escape (handled via the useEffect above) is the keyboard equivalent
      className="poracode-image-lightbox"
      onClick={(event) => {
        const target = event.target;
        if (
          target === event.currentTarget ||
          (target instanceof HTMLElement &&
            target.classList.contains("poracode-image-lightbox__stage"))
        ) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label={current.alt || (isVideo ? t`Video preview` : t`Image preview`)}
    >
      <button
        type="button"
        className="poracode-image-lightbox__close"
        aria-label={t`Close preview`}
        onClick={onClose}
      >
        <X className="size-5" />
      </button>

      {images.length > 1 ? (
        <button
          type="button"
          className="poracode-image-lightbox__nav poracode-image-lightbox__nav--prev"
          aria-label={t`Previous image`}
          onClick={(e) => {
            e.stopPropagation();
            goPrevious();
          }}
        >
          <ChevronLeft className="size-6" />
        </button>
      ) : null}

      <div
        ref={stageRef}
        className={`poracode-image-lightbox__stage${images.length > 1 ? " poracode-image-lightbox__stage--with-strip" : ""}`}
        style={{ containerType: "size" }}
        {...(!isVideo
          ? {
              onClickCapture,
              onPointerDown,
              onPointerMove,
              onPointerUp,
              onPointerCancel,
              onLostPointerCapture,
            }
          : {})}
      >
        {isVideo ? (
          <LightboxVideoPlayer key={current.videoPath ?? current.src} item={current} />
        ) : current.src ? (
          <img // eslint-disable-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- the stage handles pointer-drag panning and pinch; keyboard image navigation remains on the dialog
            ref={imageRef}
            className={`poracode-image-lightbox__image${scale > MIN_SCALE ? " poracode-image-lightbox__image--zoomed" : ""}`}
            src={previewSrc && decodedSrc !== current.src ? previewSrc : current.src}
            alt={current.alt ?? ""}
            style={{
              transform: `translate3d(${pan.x + swipeX}px, ${pan.y}px, 0) scale(${scale})`,
              ...(animate ? {} : { transition: "none" }),
              ...(previewSrc && current.width && current.height
                ? {
                    width: `min(100%, calc(100cqh * ${current.width} / ${current.height}))`,
                    aspectRatio: `${current.width} / ${current.height}`,
                  }
                : {}),
            }}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={onDoubleClick}
            decoding="async"
            draggable={false}
          />
        ) : (
          <span role="status">{t`Loading…`}</span>
        )}
      </div>

      {images.length > 1 ? (
        <button
          type="button"
          className="poracode-image-lightbox__nav poracode-image-lightbox__nav--next"
          aria-label={t`Next image`}
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
        >
          <ChevronRight className="size-6" />
        </button>
      ) : null}

      <div className="poracode-image-lightbox__footer">
        <div className="poracode-image-lightbox__footer-controls">
          {!isVideo ? (
            <div className="poracode-image-lightbox__zoom">
              <button
                type="button"
                className="poracode-image-lightbox__zoom-button"
                aria-label={t`Zoom out`}
                disabled={scale <= MIN_SCALE}
                onClick={(event) => {
                  event.stopPropagation();
                  zoomBy(-SCALE_STEP);
                }}
              >
                <ZoomOut className="size-4" />
              </button>
              <span className="poracode-image-lightbox__zoom-value" aria-live="polite">
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                className="poracode-image-lightbox__zoom-button"
                aria-label={t`Zoom in`}
                disabled={scale >= MAX_SCALE}
                onClick={(event) => {
                  event.stopPropagation();
                  zoomBy(SCALE_STEP);
                }}
              >
                <ZoomIn className="size-4" />
              </button>
              {current.src ? <ImageLightboxActions image={current} /> : null}
            </div>
          ) : null}
          {images.length > 1 ? (
            <span className="poracode-image-lightbox__counter">
              {index + 1} / {images.length}
            </span>
          ) : null}
        </div>
        {images.length > 1 ? (
          <LightboxThumbnailStrip
            images={images}
            activeIndex={index}
            activeSrc={current.src || previewSrc || ""}
            onSelect={setIndex}
          />
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function LightboxVideoPlayer({ item }: { item: LightboxImage }) {
  const { t } = useLingui();
  const isDirectUrl = /^(https?:\/\/|blob:|data:)/iu.test(item.src);
  const path = isDirectUrl ? "" : (item.videoPath ?? chatVideoFilePath(item.src) ?? item.src);
  const [reload, setReload] = useState(0);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const { source, failed } = useFileMediaSource(
    !isDirectUrl && path ? (item.mediaLocation ?? null) : null,
    path,
    0,
    reload,
  );
  const resolvedUrl = isDirectUrl ? item.src : source?.url;
  const unavailable = isDirectUrl ? failedUrl === resolvedUrl : failed || failedUrl === resolvedUrl;

  if (resolvedUrl && !unavailable) {
    return (
      <video
        ref={ownVideoPlayer}
        src={resolvedUrl}
        controls
        playsInline
        autoPlay
        aria-label={item.alt || item.fileName || t`Video preview`}
        className="max-h-full max-w-full rounded-lg bg-black object-contain"
        onError={() => setFailedUrl(resolvedUrl)}
      />
    );
  }

  if (unavailable) {
    return (
      <ContentSurface className="flex flex-col items-center gap-2 px-4 py-3 text-sm text-muted">
        <span role="status">
          <Trans>This media preview is unavailable.</Trans>
        </span>
        <Button
          variant="ghost"
          size="sm"
          onPress={() => {
            setFailedUrl(null);
            setReload((value) => value + 1);
          }}
        >
          <Trans>Retry</Trans>
        </Button>
      </ContentSurface>
    );
  }

  return <span role="status">{t`Loading…`}</span>;
}

function ownVideoPlayer(player: HTMLVideoElement | null) {
  if (!player) return;
  return () => {
    player.pause();
    player.removeAttribute("src");
    player.load();
  };
}

const subscribeEmptyImage = () => () => undefined;
const emptyImageSnapshot = () => "";

function imageKey(image: LightboxImage | undefined): string | undefined {
  return image?.resource?.key ?? image?.src;
}

/** Tiles kept warm around the open image. The strip itself shows about a dozen. */
const LIGHTBOX_STRIP_RADIUS = 12;
/** Tiles that fit in the strip; these load ahead of the off-screen buffer. */
const LIGHTBOX_VISIBLE_RADIUS = 6;

function lightboxThumbEdge(): number {
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  // 3.25rem tile, at 2x device pixels, so the bitmap matches the painted size.
  return Math.ceil(52 * Math.max(1, dpr) * 2);
}

function displayThumb(url: string | undefined, edge: number): string {
  if (!url) return "";
  return localImageThumbUrl(url, edge) ?? url;
}

function stripPreviewPriority(
  distance: number,
  inView: boolean,
): EnvironmentImagePriority | undefined {
  if (distance <= LIGHTBOX_VISIBLE_RADIUS || inView) return "foreground";
  if (distance <= LIGHTBOX_STRIP_RADIUS) return "prefetch";
  return undefined;
}

/**
 * URL painted in one strip tile.
 *
 * Native `loading="lazy"` never starts inside this fixed overlay, so an
 * `<img>` with a URL must be eager and absolutely sized. A card or stand-in
 * wins over the full original so the tile does not decode the open image.
 */
function lightboxThumbSrc(
  item: LightboxImage,
  options: {
    edge: number;
    near: boolean;
    isActive: boolean;
    activeSrc: string;
    previewSnapshot: string;
  },
): string {
  if (item.kind === "video") return "";
  const { edge, near, isActive, activeSrc, previewSnapshot } = options;
  const card = displayThumb(previewSnapshot, edge);
  if (card) return card;
  if (item.previewSrc) return displayThumb(item.previewSrc, edge);
  if (item.stripPreviewSrc) return item.stripPreviewSrc;
  if (!near) return "";
  return (
    displayThumb(item.resource?.getSnapshot(), edge) ||
    displayThumb(item.src, edge) ||
    (isActive ? displayThumb(activeSrc, edge) : "")
  );
}

function LightboxThumbnailStrip({
  images,
  activeIndex,
  activeSrc,
  onSelect,
}: {
  images: readonly LightboxImage[];
  activeIndex: number;
  activeSrc: string;
  onSelect: (index: number) => void;
}) {
  const { t } = useLingui();
  const [strip, setStrip] = useState<HTMLDivElement | null>(null);
  const [inView, setInView] = useState<ReadonlySet<number>>(() => new Set());
  const edge = lightboxThumbEdge();

  useLayoutEffect(() => {
    const el = strip?.querySelector<HTMLElement>(`[data-thumb-index="${activeIndex}"]`);
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest", inline: "center", behavior: "auto" });
    }
  }, [activeIndex, strip]);

  useEffect(() => {
    if (!strip || typeof IntersectionObserver !== "function") return;
    const observer = new IntersectionObserver(
      (entries) => {
        setInView((current) => {
          const next = new Set(current);
          let changed = false;
          for (const entry of entries) {
            const index = Number(entry.target.getAttribute("data-thumb-index"));
            if (!Number.isInteger(index)) continue;
            if (entry.isIntersecting) {
              if (!next.has(index)) {
                next.add(index);
                changed = true;
              }
            } else if (next.delete(index)) changed = true;
          }
          return changed ? next : current;
        });
      },
      { root: strip, rootMargin: "120px", threshold: 0 },
    );
    const indexes = new Set(images.map((_, index) => index));
    for (const node of strip.querySelectorAll<HTMLElement>("[data-thumb-index]")) {
      const index = Number(node.getAttribute("data-thumb-index"));
      if (indexes.has(index)) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [strip, images]);

  return (
    <div
      ref={setStrip}
      className="poracode-image-lightbox__strip"
      data-poracode-lightbox-strip="true"
      role="list"
      aria-label={t`Image preview`}
    >
      {images.map((item, itemIndex) => (
        <LightboxStripThumb
          key={`${imageKey(item) ?? item.videoPath ?? "media"}:${itemIndex}`}
          item={item}
          itemIndex={itemIndex}
          count={images.length}
          active={itemIndex === activeIndex}
          priority={stripPreviewPriority(Math.abs(itemIndex - activeIndex), inView.has(itemIndex))}
          activeSrc={activeSrc}
          edge={edge}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function LightboxStripThumb({
  item,
  itemIndex,
  count,
  active,
  priority,
  activeSrc,
  edge,
  onSelect,
}: {
  item: LightboxImage;
  itemIndex: number;
  count: number;
  active: boolean;
  priority: EnvironmentImagePriority | undefined;
  activeSrc: string;
  edge: number;
  onSelect: (index: number) => void;
}) {
  const { t } = useLingui();
  const resource = item.resource;
  const onNotify = useRenderOnNotify();
  const isVideo = item.kind === "video";
  const trackPreview =
    priority !== undefined && !isVideo && resource?.subscribePreview !== undefined;
  const previewSnapshot = useSyncExternalStore(
    (listener) =>
      trackPreview && resource?.subscribePreview
        ? resource.subscribePreview(onNotify(listener), priority)
        : subscribeEmptyImage,
    () => (trackPreview ? (resource?.getPreviewSnapshot?.() ?? "") : ""),
  );
  const thumbSrc = lightboxThumbSrc(item, {
    edge,
    near: priority !== undefined,
    isActive: active,
    activeSrc,
    previewSnapshot,
  });
  const label = isVideo ? t`Video preview` : t`Open image ${itemIndex + 1} of ${count}`;
  return (
    <div role="listitem" className="shrink-0">
      <button
        type="button"
        data-thumb-index={itemIndex}
        className={`poracode-image-lightbox__thumb${active ? " poracode-image-lightbox__thumb--active" : ""}`}
        aria-label={label}
        aria-current={active ? "true" : undefined}
        title={item.alt || item.fileName || label}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(itemIndex);
        }}
      >
        {isVideo ? (
          <Film className="size-4 text-white/80" aria-hidden="true" />
        ) : thumbSrc ? (
          <img
            src={thumbSrc}
            alt=""
            draggable={false}
            decoding="async"
            className="poracode-image-lightbox__thumb-image"
          />
        ) : (
          <ImageIcon className="size-3.5 text-white/50" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
