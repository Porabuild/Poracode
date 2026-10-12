import { extractMarkdownGalleryImages } from "./threadGalleryMarkdownImages";
export { extractMarkdownGalleryImages } from "./threadGalleryMarkdownImages";
import { GalleryImageReadiness } from "./threadGalleryImageReadiness";
import { assistantDisplayText } from "@/shared/assistantMessageText";
import type { MessageItemPayload, ToolCallPayload } from "@/shared/contracts";
import {
  fileNameFromPath,
  isImagePath,
  mimeForPath,
  resolveLocalFileUrlPath,
  toLocalFileUrl,
} from "@/shared/promptContent";
import { getProjectFsPath } from "@/shared/wsl";
import { resolveProjectLocation } from "@/shared/worktree";
import type { RemoteImageRefValue } from "@/shared/remote";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import {
  getRuntimeItemPayload,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import {
  forgetThreadGalleryCache,
  readThreadGalleryCache,
  writeThreadGalleryCache,
  type GalleryCacheRevision,
} from "@/renderer/state/threadGalleryCache";
import {
  getRemoteBridgeImageReadiness,
  getRemoteBridgeClient,
  remoteBridgeImageRefUrl,
  remoteBridgeLocalImageUrl,
} from "@/renderer/browser/remoteBridge";
import {
  readManagedLoopbackImageSession,
  type ManagedLoopbackImageSession,
} from "@/renderer/state/managedLoopbackImages";
import { managedRootOwner } from "@/renderer/state/managedRootCatalog/rootCatalogCommands";
import type { RemoteImageReadiness } from "@/renderer/state/remoteServers/environmentSessions";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { attachmentImageUrl } from "@/renderer/components/composer/useAttachments";
import type { LightboxImage } from "@/renderer/components/composer/ImageLightbox";
import { resolveThreadMarkdownImageRoots } from "@/renderer/components/thread/threadMarkdownImageRoots";
import { imageViewSourceFromImageBlock, resolveImageViewSources } from "./imageViewSource";

/** Renderable thread image for galleries, mosaics, and the fullscreen lightbox. */
export type ThreadGalleryImage = LightboxImage;

/** One collection pass: the renderable images plus the host-held refs still pending. */
export interface ThreadGalleryCollection {
  readonly images: readonly ThreadGalleryImage[];
  /**
   * Environment-held references the transcript currently presents as pending
   * (resolved URL is still empty). Consumers subscribe to these keys through
   * the existing bounded keyed readiness surface so an already-open gallery or
   * lightbox picks the image up when its blob lands.
   */
  readonly pendingRemoteRefs: readonly RemoteImageRefValue[];
  /** Remote user-attachment paths awaiting a renderable blob URL. */
  readonly pendingRemotePaths: readonly string[];
  /** Ready cache coordinates remain watched even when URLs deduplicate. */
  readonly readyRemoteRefs: readonly RemoteImageRefValue[];
  readonly readyRemotePaths: readonly string[];
}

export interface ThreadGalleryResolvers {
  /** Resolve a user-attachment path (remote desktop image endpoint). */
  imageUrlForPath?: ((path: string) => string) | undefined;
  /** Resolve a host-held image reference (remote desktop image endpoint). */
  remoteImageRefUrl?: ((ref: RemoteImageRefValue) => string) | undefined;
  /** Resolve a `poracode-local://` URL on a remote client. */
  remoteLocalImageUrl?: ((url: string) => string) | undefined;
  /** Decodes the same host path used by the local-URL resolver for keyed readiness. */
  localImagePathForUrl?: ((url: string) => string) | undefined;
  /** Project / worktree filesystem root for project-relative markdown images. */
  projectRoot?: string | undefined;
  /** Extra roots for session-media relative images. */
  extraRoots?: readonly string[] | undefined;
}

/**
 * Collect every renderable image newest-first: later thread items come before
 * earlier ones, and within an item later display positions come first (blocks
 * before markdown, document tails before heads). Skips sub-agent children
 * (they render in the overlay, not the main transcript) and anything that
 * cannot resolve to a renderable URL on this client (remote refs without a
 * session). Host-held refs whose authenticated blob is still pending are
 * reported separately (not as images) so the consumer can subscribe to their
 * readiness keys instead of dropping them until an incidental re-render.
 */
export function collectThreadGallery(
  items: readonly RuntimeChatItem[],
  resolvers: ThreadGalleryResolvers = {},
): ThreadGalleryCollection {
  const gallery: ThreadGalleryImage[] = [];
  const readiness = new GalleryImageReadiness();
  const seen = new Set<string>();

  const push = (image: ThreadGalleryImage | null | undefined) => {
    if (!image || !image.src) return;
    // One source is one gallery image even when repeated with different alt
    // text. This also keeps click-by-source navigation unambiguous.
    if (seen.has(image.src)) return;
    seen.add(image.src);
    gallery.push(image);
  };

  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (!item || item.parentItemId) continue;
    if (item.type === "user_message") {
      const attachments = buildUserImageAttachments(item);
      for (let j = attachments.length - 1; j >= 0; j--) {
        const att = attachments[j];
        if (!att) continue;
        const mime = att.mimeType ?? mimeForPath(att.path);
        const src = attachmentImageUrl(att, resolvers.imageUrlForPath);
        readiness.recordPath(att.path, src);
        push({
          src,
          ...(att.name ? { alt: att.name, fileName: att.name } : {}),
          ...(mime ? { mime } : {}),
        });
      }
    } else if (item.type === "assistant_message") {
      const payload = getRuntimeItemPayload<MessageItemPayload>(item, "assistant_message");
      const blocks = (payload?.content ?? []).filter((b) => b.kind === "image");
      for (let j = blocks.length - 1; j >= 0; j--) {
        const source = imageViewSourceFromImageBlock(
          blocks[j] as { dataUrl?: unknown; mimeType?: unknown; name?: unknown },
          resolvers.remoteImageRefUrl,
          { pendingAsPlaceholder: true },
        );
        if (!source) continue;
        readiness.recordRef(source);
        push({ src: source.src, alt: source.alt, mime: source.mime, fileName: source.fileName });
      }
      // Pure text deltas intentionally do not invalidate the gallery cache.
      // Collect markdown once the item completes, when its structural version
      // advances and the parsed destination is no longer a streaming tail.
      if (item.state === "completed") {
        const text = assistantDisplayText(item);
        const markdown = extractMarkdownGalleryImages(text, resolvers, (url, src) =>
          readiness.recordLocalUrl(url, src, resolvers.localImagePathForUrl),
        );
        for (let j = markdown.length - 1; j >= 0; j--) push(markdown[j]);
      }
    } else if (
      item.type === "image_view" ||
      item.type === "tool_call" ||
      item.type === "mcp_tool_call" ||
      item.type === "dynamic_tool_call"
    ) {
      // An errored tool call renders the generic accordion, never an image
      // card (mirrors `ImageView`'s render decision).
      if (readToolStatus(item.payload) === "error") continue;
      const sources = resolveImageViewSources(
        item.payload as ToolCallPayload | undefined,
        resolvers.remoteImageRefUrl,
        { pendingAsPlaceholder: true },
      );
      for (let index = sources.length - 1; index >= 0; index--) {
        const source = sources[index];
        if (!source) continue;
        readiness.recordRef(source);
        push({ src: source.src, alt: source.alt, mime: source.mime, fileName: source.fileName });
      }
    }
  }
  return {
    images: gallery,
    readyRemoteRefs: readiness.readyRemoteRefs,
    readyRemotePaths: readiness.readyRemotePaths,
    pendingRemoteRefs: readiness.pendingRemoteRefs,
    pendingRemotePaths: readiness.pendingRemotePaths,
  };
}

/** Image-only compatibility wrapper for synchronous click-time collectors. */
export function collectThreadGalleryImages(
  items: readonly RuntimeChatItem[],
  resolvers: ThreadGalleryResolvers = {},
): readonly ThreadGalleryImage[] {
  return collectThreadGallery(items, resolvers).images;
}

/** Mirrors `imageViewSource`'s status check: errored tool calls show the accordion. */
function readToolStatus(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const status = (payload as Record<string, unknown>).status;
  return typeof status === "string" ? status : undefined;
}

function buildUserImageAttachments(
  item: RuntimeChatItem,
): { path: string; name?: string; mimeType?: string }[] {
  const payload = getRuntimeItemPayload<MessageItemPayload>(item, "user_message");
  const content = payload?.content ?? [];
  const out: { path: string; name?: string; mimeType?: string }[] = [];
  content.forEach((block) => {
    if (block.kind === "image" && block.source === "attachment" && block.path) {
      out.push({
        path: block.path,
        ...(block.mimeType ? { mimeType: block.mimeType } : {}),
        ...resolveAttachmentName(block.name, block.path),
      });
    } else if (block.kind === "file" && block.source === "attachment" && block.path) {
      if (!isImagePath(block.path, block.mimeType ?? undefined)) return;
      out.push({
        path: block.path,
        ...(block.mimeType ? { mimeType: block.mimeType } : {}),
        ...resolveAttachmentName(block.name, block.path),
      });
    }
  });
  return out;
}

function resolveAttachmentName(name: unknown, path: string): { name?: string } {
  const resolved = typeof name === "string" && name.length > 0 ? name : fileNameFromPath(path);
  return resolved ? { name: resolved } : {};
}

interface GalleryStoreShape {
  runtimeItemIdsByThread: Record<string, readonly string[]>;
  runtimeItemsByIdByThread: Record<string, Record<string, RuntimeChatItem>>;
  threads?:
    | readonly {
        id: string;
        projectId: string;
        agentKind: string;
        sessionRef?: { providerSessionId?: string } | undefined;
        worktreePath?: string | undefined;
        remoteServerId?: string | undefined;
      }[]
    | undefined;
  projects?:
    | readonly { id: string; location: import("@/shared/contracts").ProjectLocation }[]
    | undefined;
}

const unavailableImageUrl = () => "";

function galleryRemoteServer(remoteServerId: string | undefined) {
  if (typeof remoteServerId !== "string" || remoteServerId.length === 0) return undefined;
  return useRemoteServersStore
    .getState()
    .servers.find((server) => remoteConnectionKey(server) === remoteServerId);
}

/**
 * The volatile image owner, identical for hook-time and click-time cache reads.
 * Environment adapters are freshly constructed; the remote record/revision
 * already carries their connection identity. Own-host sessions instead need
 * their stable custody object so a same-endpoint replacement invalidates URLs.
 */
export function threadGalleryImageAuthority(
  thread: { id: string; remoteServerId?: string | undefined } | undefined,
  managedSession: ManagedLoopbackImageSession | null = readManagedLoopbackImageSession(),
  browserReadiness: RemoteImageReadiness | undefined = getRemoteBridgeImageReadiness(),
): object | null | undefined {
  if (!thread) return undefined;
  if (isRemoteSession()) {
    if (
      thread.remoteServerId !== undefined &&
      (typeof thread.remoteServerId !== "string" || thread.remoteServerId.length === 0)
    )
      return undefined;
    // Browser/attached projections already route through the selected bridge,
    // including when its persisted row is temporarily absent. Environment
    // clients expose keyed readiness through their connection, not this cache.
    return browserReadiness ?? getRemoteBridgeClient();
  }
  if (thread.remoteServerId !== undefined) return galleryRemoteServer(thread.remoteServerId);
  if (managedRootOwner(thread)) return managedSession;
  return undefined;
}

/**
 * Build the ChatPane-mirroring resolvers for a thread from store state alone
 * (plus the live remote clients): attachment paths, host-held refs, and
 * project/session roots for markdown targets.
 */
export function buildGalleryResolversFromState(
  state: GalleryStoreShape,
  threadId: string,
): ThreadGalleryResolvers {
  const thread = state.threads?.find((t) => t.id === threadId);
  const resolvers: ThreadGalleryResolvers = { remoteImageRefUrl: unavailableImageUrl };
  const remoteServerId = thread?.remoteServerId;
  const browserSession = isRemoteSession();
  const validRemoteServerId =
    remoteServerId === undefined ||
    (typeof remoteServerId === "string" && remoteServerId.length > 0);
  if (thread && browserSession && validRemoteServerId) {
    // Keep the selected browser/attached client and its existing image cache.
    resolvers.imageUrlForPath = remoteBridgeLocalImageUrl;
    resolvers.remoteImageRefUrl = remoteBridgeImageRefUrl;
  } else if (remoteServerId !== undefined) {
    // A present but malformed/missing connection never becomes an own-host image.
    const server = browserSession ? undefined : galleryRemoteServer(remoteServerId);
    resolvers.imageUrlForPath = server
      ? (path) => useRemoteServersStore.getState().localImageUrl(remoteServerId, path)
      : unavailableImageUrl;
    resolvers.remoteImageRefUrl = server
      ? (ref) => useRemoteServersStore.getState().imageRefUrl(remoteServerId, ref)
      : unavailableImageUrl;
  } else if (thread && managedRootOwner(thread)) {
    resolvers.remoteImageRefUrl =
      readManagedLoopbackImageSession()?.readiness.resolveRef ?? unavailableImageUrl;
    resolvers.imageUrlForPath = toLocalFileUrl;
    resolvers.remoteLocalImageUrl = (url) => url;
  }
  const project = thread ? state.projects?.find((p) => p.id === thread.projectId) : undefined;
  if (project && thread) {
    const projectLocation = resolveProjectLocation(project.location, thread.worktreePath);
    resolvers.projectRoot = getProjectFsPath(projectLocation);
    if (remoteServerId !== undefined) {
      resolvers.localImagePathForUrl = (url) =>
        resolveLocalFileUrlPath(url, projectLocation.kind === "windows" ? "win32" : "linux");
      resolvers.remoteLocalImageUrl = (url: string) => {
        const platform =
          projectLocation.kind === "windows"
            ? ("win32" as NodeJS.Platform)
            : ("linux" as NodeJS.Platform);
        const imagePath = resolveLocalFileUrlPath(url, platform);
        if (browserSession) return validRemoteServerId ? remoteBridgeLocalImageUrl(imagePath) : "";
        return galleryRemoteServer(remoteServerId)
          ? useRemoteServersStore.getState().localImageUrl(remoteServerId, imagePath)
          : "";
      };
    }
    const homeDir = readBridge()?.homeDir ?? undefined;
    const extraRoots = resolveThreadMarkdownImageRoots({
      agentKind: thread.agentKind,
      ...(thread.sessionRef?.providerSessionId
        ? { sessionId: thread.sessionRef.providerSessionId }
        : {}),
      projectLocation,
      ...(homeDir ? { homeDir } : {}),
      ...(remoteServerId ? { isRemote: true as const } : {}),
    });
    if (extraRoots) resolvers.extraRoots = extraRoots;
  }
  return resolvers;
}

function resolverCacheKey(resolvers: ThreadGalleryResolvers): string {
  return [resolvers.projectRoot ?? "", resolvers.extraRoots?.join("\0") ?? ""].join("\n");
}

export type { GalleryCacheRevision };

type RemoteGalleryState = Pick<
  ReturnType<typeof useRemoteServersStore.getState>,
  "servers" | "runtime"
>;

export function selectRemoteGalleryRevision(
  state: RemoteGalleryState,
  remoteServerId: string | undefined,
): string {
  if (!remoteServerId) return "";
  // `remoteServerId` on a projected thread is the CONNECTION key, which for a
  // host-owned environment is not the child host identity.
  const server = state.servers.find((entry) => remoteConnectionKey(entry) === remoteServerId);
  const status = state.runtime[remoteServerId]?.status ?? "offline";
  return `${server?.endpoint ?? ""}\0${server?.accessToken ?? ""}\0${status}`;
}

/**
 * Drops one thread's cached collection. Readiness transitions call this so the
 * next collection pass (from any subscriber) sees the newly resolved URL.
 */
export function invalidateCachedThreadGallery(threadId: string): void {
  forgetThreadGalleryCache(threadId);
}

/**
 * Shared cached collection: every subscriber (bubble, mosaic, click-time
 * lookups) reuses one computation per store update instead of rebuilding
 * multi-MB display URLs per component per streaming tick.
 */
export function getCachedThreadGallery(
  threadId: string,
  itemIds: readonly string[],
  itemsById: Record<string, RuntimeChatItem>,
  resolvers: ThreadGalleryResolvers,
  revision: GalleryCacheRevision,
): ThreadGalleryCollection {
  const cached = readThreadGalleryCache(
    threadId,
    itemIds,
    itemsById,
    resolverCacheKey(resolvers),
    revision,
  );
  if (cached) return cached;
  const items = itemIds.map((id) => itemsById[id]).filter((item) => item !== undefined);
  const result = collectThreadGallery(items, resolvers);
  return writeThreadGalleryCache(
    threadId,
    itemIds,
    itemsById,
    resolverCacheKey(resolvers),
    revision,
    result,
  );
}
