import { unified } from "unified";
import remarkParse from "remark-parse";
import { assistantDisplayText } from "@/shared/assistantMessageText";
import type { MessageItemPayload, ToolCallPayload } from "@/shared/contracts";
import { resolveLocalImageDisplayUrl } from "@/shared/localImageDisplay";
import { resolveMarkdownImageUrl } from "@/shared/markdownLocalImages";
import {
  fileNameFromPath,
  isImagePath,
  resolveLocalFileUrlPath,
  toLocalFileUrl,
} from "@/shared/promptContent";
import { getProjectFsPath } from "@/shared/wsl";
import { resolveProjectLocation } from "@/shared/worktree";
import type { RemoteImageRefValue } from "@/shared/remote";
import { readBridge } from "@/renderer/bridge";
import {
  getRuntimeItemPayload,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { attachmentImageUrl } from "@/renderer/components/composer/useAttachments";
import { resolveThreadMarkdownImageRoots } from "@/renderer/components/thread/threadMarkdownImageRoots";
import { imageViewSourceFromImageBlock, resolveImageViewSource } from "./imageViewSource";

/** Renderable thread image for galleries, mosaics, and the fullscreen lightbox. */
export interface ThreadGalleryImage {
  /** Renderable URL — `data:`, `poracode-local://`, or remote HTTP(S). */
  src: string;
  /** Accessible label / alt text. */
  alt?: string;
}

export interface ThreadGalleryResolvers {
  /** Resolve a user-attachment path (remote desktop image endpoint). */
  imageUrlForPath?: ((path: string) => string) | undefined;
  /** Resolve a host-held image reference (remote desktop image endpoint). */
  remoteImageRefUrl?: ((ref: RemoteImageRefValue) => string) | undefined;
  /** Resolve a `poracode-local://` URL on a remote client. */
  remoteLocalImageUrl?: ((url: string) => string) | undefined;
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
 * session).
 */
export function collectThreadGalleryImages(
  items: readonly RuntimeChatItem[],
  resolvers: ThreadGalleryResolvers = {},
): ThreadGalleryImage[] {
  const gallery: ThreadGalleryImage[] = [];
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
        push({
          src: attachmentImageUrl(att, resolvers.imageUrlForPath),
          ...(att.name ? { alt: att.name } : {}),
        });
      }
    } else if (item.type === "assistant_message") {
      const payload = getRuntimeItemPayload<MessageItemPayload>(item, "assistant_message");
      const blocks = (payload?.content ?? []).filter((b) => b.kind === "image");
      for (let j = blocks.length - 1; j >= 0; j--) {
        const source = imageViewSourceFromImageBlock(
          blocks[j] as { dataUrl?: unknown; mimeType?: unknown; name?: unknown },
          resolvers.remoteImageRefUrl,
        );
        if (source) push({ src: source.src, ...(source.alt ? { alt: source.alt } : {}) });
      }
      // Pure text deltas intentionally do not invalidate the gallery cache.
      // Collect markdown once the item completes, when its structural version
      // advances and the parsed destination is no longer a streaming tail.
      if (item.state === "completed") {
        const text = assistantDisplayText(item);
        const markdown = extractMarkdownGalleryImages(text, resolvers);
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
      const source = resolveImageViewSource(
        item.payload as ToolCallPayload | undefined,
        resolvers.remoteImageRefUrl,
      );
      if (source) push({ src: source.src, ...(source.alt ? { alt: source.alt } : {}) });
    }
  }
  return gallery;
}

/** Mirrors `imageViewSource`'s status check: errored tool calls show the accordion. */
function readToolStatus(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const status = (payload as Record<string, unknown>).status;
  return typeof status === "string" ? status : undefined;
}

function buildUserImageAttachments(item: RuntimeChatItem): { path: string; name?: string }[] {
  const payload = getRuntimeItemPayload<MessageItemPayload>(item, "user_message");
  const content = payload?.content ?? [];
  const out: { path: string; name?: string }[] = [];
  content.forEach((block) => {
    if (block.kind === "image" && block.source === "attachment" && block.path) {
      out.push({
        path: block.path,
        ...resolveAttachmentName(block.name, block.path),
      });
    } else if (block.kind === "file" && block.source === "attachment" && block.path) {
      if (!isImagePath(block.path, block.mimeType ?? undefined)) return;
      out.push({
        path: block.path,
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

const HTML_IMG_RE = /<img\b[^>]*>/gi;
const SRC_FROM_HTML_RE = /(?:^|\s)src\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i;
const ALT_FROM_HTML_RE = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

interface MarkdownGalleryNode {
  type: string;
  url?: string;
  alt?: string | null;
  identifier?: string;
  value?: string;
  children?: MarkdownGalleryNode[];
  position?: { start?: { offset?: number } };
}

const markdownParser = unified().use(remarkParse).freeze();

/**
 * Extract parsed markdown + raw-HTML images from display text, in document
 * order, and resolve them with the same pipeline the chat renderer uses. Code
 * nodes and HTML comments never become candidates. Markdown image nodes
 * targets go through `resolveMarkdownImageUrl` (project/session roots);
 * raw-HTML targets only resolve absolute paths (mirroring the rehype
 * fallback, which has no roots). Anything the transcript sanitizer strips —
 * `data:`/`blob:`/`lightcode-local:` markdown targets, unresolvable relative
 * paths — is skipped so the gallery never shows what the transcript hides.
 */
export function extractMarkdownGalleryImages(
  text: string,
  resolvers: ThreadGalleryResolvers = {},
): ThreadGalleryImage[] {
  if (!text || (!text.includes("![") && !text.toLowerCase().includes("<img"))) return [];
  type Candidate = { index: number; alt: string; rawUrl: string; fromHtml: boolean };
  const candidates: Candidate[] = [];
  const tree = markdownParser.parse(text) as MarkdownGalleryNode;
  const definitions = new Map<string, string>();
  collectMarkdownDefinitions(tree, definitions);
  collectMarkdownCandidates(tree, candidates, definitions);
  candidates.sort((a, b) => a.index - b.index);
  const out: ThreadGalleryImage[] = [];
  for (const candidate of candidates) {
    if (!candidate.rawUrl) continue;
    const resolved = candidate.fromHtml
      ? resolveHtmlImageTarget(candidate.rawUrl, resolvers)
      : resolveMarkdownImageTarget(candidate.rawUrl, resolvers);
    if (resolved) {
      const alt = candidate.alt || fileNameFromPath(candidate.rawUrl);
      out.push({ src: resolved, ...(alt ? { alt } : {}) });
    }
  }
  return out;
}

function collectMarkdownCandidates(
  node: MarkdownGalleryNode,
  candidates: { index: number; alt: string; rawUrl: string; fromHtml: boolean }[],
  definitions: ReadonlyMap<string, string>,
): void {
  const nodeOffset = node.position?.start?.offset ?? 0;
  if (node.type === "image" && typeof node.url === "string") {
    candidates.push({
      index: nodeOffset,
      alt: node.alt?.trim() ?? "",
      rawUrl: node.url,
      fromHtml: false,
    });
  } else if (node.type === "imageReference" && node.identifier) {
    const url = definitions.get(node.identifier);
    if (url) {
      candidates.push({
        index: nodeOffset,
        alt: node.alt?.trim() ?? "",
        rawUrl: url,
        fromHtml: false,
      });
    }
  } else if (node.type === "html" && typeof node.value === "string") {
    const html = maskHiddenHtml(node.value);
    HTML_IMG_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = HTML_IMG_RE.exec(html)) !== null) {
      const srcMatch = SRC_FROM_HTML_RE.exec(match[0] ?? "");
      if (!srcMatch) continue;
      const altMatch = ALT_FROM_HTML_RE.exec(match[0] ?? "");
      candidates.push({
        index: nodeOffset + match.index,
        alt: decodeHtmlAttribute((altMatch?.[1] ?? altMatch?.[2] ?? altMatch?.[3] ?? "").trim()),
        rawUrl: decodeHtmlAttribute((srcMatch[1] ?? srcMatch[2] ?? srcMatch[3] ?? "").trim()),
        fromHtml: true,
      });
    }
  }
  node.children?.forEach((child) => collectMarkdownCandidates(child, candidates, definitions));
}

function collectMarkdownDefinitions(
  node: MarkdownGalleryNode,
  definitions: Map<string, string>,
): void {
  if (node.type === "definition" && node.identifier && node.url) {
    definitions.set(node.identifier, node.url);
  }
  node.children?.forEach((child) => collectMarkdownDefinitions(child, definitions));
}

function maskHiddenHtml(html: string): string {
  let visible = html.replace(/<!--[\s\S]*?(?:-->|$)/g, maskHtml);
  for (const tag of [
    "script",
    "style",
    "template",
    "textarea",
    "title",
    "noscript",
    "iframe",
    "object",
  ]) {
    visible = visible.replace(
      new RegExp(`<${tag}\\b[\\s\\S]*?(?:<\\/${tag}\\s*>|$)`, "gi"),
      maskHtml,
    );
  }
  return visible;
}

function maskHtml(value: string): string {
  return " ".repeat(value.length);
}

function decodeHtmlAttribute(value: string): string {
  if (!value.includes("&")) return value;
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function resolveMarkdownImageTarget(
  rawUrl: string,
  resolvers: ThreadGalleryResolvers,
): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed || isStrippedScheme(trimmed)) return null;
  const rewritten = resolveMarkdownImageUrl(trimmed, {
    ...(resolvers.projectRoot ? { projectRoot: resolvers.projectRoot } : {}),
    ...(resolvers.extraRoots?.length ? { extraRoots: resolvers.extraRoots } : {}),
  });
  if (rewritten) return mapLocalUrlToDisplay(rewritten, resolvers);
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("poracode-local://")) return mapLocalUrlToDisplay(trimmed, resolvers);
  // Absolute filesystem paths that skipped the pre-parse rewrite.
  if (isAbsoluteFsPath(trimmed)) return mapLocalUrlToDisplay(toLocalFileUrl(trimmed), resolvers);
  return null;
}

/**
 * Raw-HTML `<img>` fallback: the renderer's rehype pass resolves absolute
 * paths only (relative project paths need the pre-parse rewrite, which sees
 * markdown syntax alone), so the gallery applies no roots here either.
 */
function resolveHtmlImageTarget(rawUrl: string, resolvers: ThreadGalleryResolvers): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed || isStrippedScheme(trimmed)) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("poracode-local://")) return mapLocalUrlToDisplay(trimmed, resolvers);
  if (isAbsoluteFsPath(trimmed)) return mapLocalUrlToDisplay(toLocalFileUrl(trimmed), resolvers);
  return null;
}

/**
 * Schemes the transcript sanitizer strips from `<img src>` (only `http`,
 * `https`, and locally-added `poracode-local` survive). Gallery targets with
 * these schemes would never paint, so they are excluded.
 */
function isStrippedScheme(url: string): boolean {
  return /^(data|blob|lightcode-local):/i.test(url);
}

function isAbsoluteFsPath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\") || value.startsWith("/");
}

function mapLocalUrlToDisplay(poracodeLocalUrl: string, resolvers: ThreadGalleryResolvers): string {
  // Remote PWA: swap the local scheme for the desktop's authenticated endpoint.
  if (poracodeLocalUrl.startsWith("poracode-local://") && resolvers.remoteLocalImageUrl) {
    const mapped = resolvers.remoteLocalImageUrl(poracodeLocalUrl);
    if (mapped) return mapped;
  }
  // Desktop (no remote resolver installed) keeps `poracode-local://` untouched
  // for the privileged protocol handler; remote clients map via the global
  // resolver installed by the mobile bridge.
  return resolveLocalImageDisplayUrl(poracodeLocalUrl);
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
  const resolvers: ThreadGalleryResolvers = {};
  const remoteServerId = thread?.remoteServerId;
  if (remoteServerId) {
    const desktopId = remoteServerId;
    resolvers.imageUrlForPath = (path: string) =>
      useRemoteServersStore.getState().localImageUrl(desktopId, path);
    resolvers.remoteImageRefUrl = (ref) =>
      useRemoteServersStore.getState().imageRefUrl(desktopId, ref);
  }
  const project = thread ? state.projects?.find((p) => p.id === thread.projectId) : undefined;
  if (project && thread) {
    const projectLocation = resolveProjectLocation(project.location, thread.worktreePath);
    resolvers.projectRoot = getProjectFsPath(projectLocation);
    if (remoteServerId) {
      resolvers.remoteLocalImageUrl = (url: string) => {
        const platform =
          projectLocation.kind === "windows"
            ? ("win32" as NodeJS.Platform)
            : ("linux" as NodeJS.Platform);
        const imagePath = resolveLocalFileUrlPath(url, platform);
        return useRemoteServersStore.getState().localImageUrl(remoteServerId, imagePath);
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

export interface GalleryCacheRevision {
  structuralVersion: number;
  remoteRevision: string;
  locale: string;
}

type RemoteGalleryState = Pick<
  ReturnType<typeof useRemoteServersStore.getState>,
  "servers" | "runtime"
>;

export function selectRemoteGalleryRevision(
  state: RemoteGalleryState,
  remoteServerId: string | undefined,
): string {
  if (!remoteServerId) return "";
  const server = state.servers.find((entry) => entry.desktopId === remoteServerId);
  const status = state.runtime[remoteServerId]?.status ?? "offline";
  return `${server?.endpoint ?? ""}\0${server?.accessToken ?? ""}\0${status}`;
}

interface GalleryCacheEntry {
  itemIds: readonly string[];
  itemsById: Record<string, RuntimeChatItem>;
  resolverKey: string;
  revision: GalleryCacheRevision;
  result: ThreadGalleryImage[];
}

const galleryCache = new Map<string, GalleryCacheEntry>();

function readCachedGallery(
  threadId: string,
  itemIds: readonly string[],
  itemsById: Record<string, RuntimeChatItem>,
  resolvers: ThreadGalleryResolvers,
  revision: GalleryCacheRevision,
): ThreadGalleryImage[] | null {
  const cached = galleryCache.get(threadId);
  if (
    cached &&
    cached.itemIds === itemIds &&
    cached.itemsById === itemsById &&
    cached.resolverKey === resolverCacheKey(resolvers) &&
    cached.revision.structuralVersion === revision.structuralVersion &&
    cached.revision.remoteRevision === revision.remoteRevision &&
    cached.revision.locale === revision.locale
  ) {
    return cached.result;
  }
  return null;
}

function writeCachedGallery(
  threadId: string,
  itemIds: readonly string[],
  itemsById: Record<string, RuntimeChatItem>,
  resolvers: ThreadGalleryResolvers,
  revision: GalleryCacheRevision,
  result: ThreadGalleryImage[],
): ThreadGalleryImage[] {
  if (galleryCache.size > 200) galleryCache.clear();
  galleryCache.set(threadId, {
    itemIds,
    itemsById,
    resolverKey: resolverCacheKey(resolvers),
    revision,
    result,
  });
  return result;
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
): ThreadGalleryImage[] {
  const cached = readCachedGallery(threadId, itemIds, itemsById, resolvers, revision);
  if (cached) return cached;
  const items = itemIds.map((id) => itemsById[id]).filter((item) => item !== undefined);
  const result = collectThreadGalleryImages(items, resolvers);
  return writeCachedGallery(threadId, itemIds, itemsById, resolvers, revision, result);
}
