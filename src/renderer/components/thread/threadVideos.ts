import { unified } from "unified";
import remarkParse from "remark-parse";
import { assistantDisplayText } from "@/shared/assistantMessageText";
import {
  chatVideoFilePath,
  completedToolVideoSources,
  isChatVideoSource,
  isVideoPath,
} from "@/shared/chatVideo";
import { resolveMarkdownImageUrl } from "@/shared/markdownLocalImages";
import { normalizeWindowsDrivePath } from "@/shared/pathUtils";
import { fileNameFromPath, toLocalFileUrl } from "@/shared/promptContent";
import { getProjectFsPath } from "@/shared/wsl";
import { resolveProjectLocation } from "@/shared/worktree";
import type { MessageItemPayload } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import type { LightboxImage } from "@/renderer/components/composer/ImageLightbox";
import { buildFileEditorContext } from "@/renderer/utils/gitHelpers";
import {
  getRuntimeItemPayload,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";
import {
  AUTO_PATH_FILE_HREF_PREFIX,
  AUTO_PATH_FOLDER_HREF_PREFIX,
  parsePathRefUrl,
} from "./ChatPane/parts/items/markdownPathRefs";
import { resolveThreadMarkdownImageRoots, threadHostHomeDir } from "./threadMarkdownImageRoots";
import { resolveThreadTranscriptMarkdownFormatter } from "./threadTranscriptMarkdown";

type MarkdownFormatter = ((text: string) => string) | undefined;

export interface ThreadVideoResolvers {
  projectRoot?: string | undefined;
  extraRoots?: readonly string[] | undefined;
}

export interface ThreadVideo {
  target: string;
  name: string;
  src: string;
  mimeType?: string;
  external: boolean;
  filePath?: string;
}

export function threadVideosForLightbox(
  videos: readonly ThreadVideo[],
  threadId: string | undefined,
): LightboxImage[] {
  const state = useAppStore.getState();
  const thread = state.threads.find((candidate) => candidate.id === threadId);
  const project = thread
    ? state.projects.find((candidate) => candidate.id === thread.projectId)
    : undefined;
  const baseLocation =
    thread && project
      ? buildFileEditorContext(project, thread.worktreePath, thread.worktreeBranch).projectLocation
      : undefined;
  const mediaLocation =
    baseLocation && thread?.remoteServerId && !baseLocation.remoteServerId
      ? { ...baseLocation, remoteServerId: thread.remoteServerId }
      : baseLocation;
  return videos.map((video) => ({
    kind: "video",
    src: video.src,
    alt: video.name,
    fileName: video.name,
    ...(video.mimeType ? { mime: video.mimeType } : {}),
    ...(video.filePath ? { videoPath: video.filePath } : {}),
    ...(mediaLocation ? { mediaLocation } : {}),
  }));
}

interface MarkdownNode {
  type: string;
  url?: string;
  alt?: string | null;
  identifier?: string;
  value?: string;
  children?: MarkdownNode[];
  position?: { start?: { offset?: number } };
}

const HTML_VIDEO_SRC_RE = /<\/?(?:video|source)\b[^>]*>/gi;
const SRC_FROM_HTML_RE = /(?:^|\s)src\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i;
const TITLE_FROM_HTML_RE = /\btitle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

const parser = unified().use(remarkParse).freeze();
const EMPTY_VIDEOS: readonly ThreadVideo[] = [];
const itemCache = new WeakMap<RuntimeChatItem, Map<string, readonly ThreadVideo[]>>();
const collectionCache = new WeakMap<
  readonly string[],
  { revision: number; resolverKey: string; videos: readonly ThreadVideo[] }
>();

function resolversCacheKey(formatter: MarkdownFormatter, resolvers: ThreadVideoResolvers): string {
  return [
    formatter ? "formatted" : "raw",
    resolvers.projectRoot ?? "",
    resolvers.extraRoots?.join("\0") ?? "",
  ].join("\n");
}

function buildLocalOrExternalVideo(
  rawPath: string,
  name?: string,
  mimeType?: string,
  resolvers: ThreadVideoResolvers = {},
): ThreadVideo | undefined {
  const trimmed = rawPath.trim();
  if (!trimmed) return undefined;
  for (const char of trimmed) if (char.charCodeAt(0) < 32) return undefined;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (!isVideoPath(url.pathname, mimeType)) return undefined;
      const decodedName = fileNameFromPath(decodeURIComponent(url.pathname));
      return {
        target: trimmed,
        name: name?.trim() || decodedName || trimmed,
        src: trimmed,
        external: true,
        ...(mimeType ? { mimeType } : {}),
      };
    } catch {
      return undefined;
    }
  }

  // Reject unsafe or non-file custom schemes while allowing file://, poracode-local://,
  // Windows drive paths, and relative project paths.
  if (
    /^[a-z][a-z\d+.-]*:/i.test(trimmed) &&
    !/^(file:\/\/|poracode-local:\/\/local\/)/i.test(trimmed) &&
    !/^[a-z]:[\\/]/i.test(trimmed)
  ) {
    return undefined;
  }

  const resolvedUrl =
    resolveMarkdownImageUrl(trimmed, {
      ...(resolvers.projectRoot ? { projectRoot: resolvers.projectRoot } : {}),
      ...(resolvers.extraRoots?.length ? { extraRoots: resolvers.extraRoots } : {}),
    }) ?? trimmed;

  const filePath = chatVideoFilePath(resolvedUrl) ?? resolvedUrl;
  if (!isVideoPath(filePath, mimeType)) return undefined;
  const normalizedTarget = normalizeWindowsDrivePath(filePath);
  const src = isChatVideoSource(resolvedUrl, mimeType)
    ? resolvedUrl
    : toLocalFileUrl(normalizedTarget);

  return {
    target: normalizedTarget,
    name: name?.trim() || fileNameFromPath(normalizedTarget),
    src,
    external: false,
    filePath: normalizedTarget,
    ...(mimeType ? { mimeType } : {}),
  };
}

function videoFromHref(
  href: string,
  label: string | undefined,
  fromVideoTag: boolean,
  resolvers: ThreadVideoResolvers,
): ThreadVideo | undefined {
  const explicit = parsePathRefUrl(href);
  if (explicit?.kind === "folder") return undefined;
  if (
    !explicit &&
    (href.startsWith(AUTO_PATH_FILE_HREF_PREFIX) || href.startsWith(AUTO_PATH_FOLDER_HREF_PREFIX))
  ) {
    return undefined;
  }
  const target = explicit?.path ?? href;
  if (fromVideoTag && /^https?:\/\//i.test(target) && isChatVideoSource(target, "video/*")) {
    return {
      target,
      name: label?.trim() || fileNameFromPath(target),
      src: target,
      external: true,
      mimeType: "video/*",
    };
  }
  return buildLocalOrExternalVideo(target, label, fromVideoTag ? "video/*" : undefined, resolvers);
}

function maskHiddenHtml(html: string): string {
  let visible = html.replace(/<!--[\s\S]*?(?:-->|$)/g, (m) => " ".repeat(m.length));
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
    visible = visible.replace(new RegExp(`<${tag}\\b[\\s\\S]*?(?:<\\/${tag}\\s*>|$)`, "gi"), (m) =>
      " ".repeat(m.length),
    );
  }
  return visible;
}

function decodeHtmlAttribute(value: string): string {
  if (!value.includes("&") || typeof document === "undefined") return value;
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function itemVideos(
  item: RuntimeChatItem,
  formatter: MarkdownFormatter,
  resolvers: ThreadVideoResolvers,
): readonly ThreadVideo[] {
  if (item.parentItemId) return EMPTY_VIDEOS;
  const cacheKey = resolversCacheKey(formatter, resolvers);
  const cached = itemCache.get(item)?.get(cacheKey);
  if (cached) return cached;

  const videos: ThreadVideo[] = [];

  if (item.type === "user_message" || item.type === "assistant_message") {
    const payload = getRuntimeItemPayload<MessageItemPayload>(item, item.type);
    const content = payload?.content ?? [];
    for (let index = content.length - 1; index >= 0; index--) {
      const block = content[index];
      if (block?.kind !== "file") continue;
      if (!isVideoPath(block.path, block.mimeType ?? undefined)) continue;
      const video = buildLocalOrExternalVideo(
        block.path,
        block.name,
        block.mimeType ?? undefined,
        resolvers,
      );
      if (video) videos.push(video);
    }

    if (item.type === "assistant_message" && item.state === "completed") {
      const rawText = assistantDisplayText(item);
      const text = formatter ? formatter(rawText) : rawText;
      const lower = text.toLowerCase();
      if (text.includes("[") || lower.includes("<video") || lower.includes("<source")) {
        type Candidate = { offset: number; href: string; label?: string; fromVideoTag: boolean };
        const candidates: Candidate[] = [];
        const tree = parser.parse(text) as MarkdownNode;
        const definitions = new Map<string, string>();
        function collectDefinitions(node: MarkdownNode) {
          if (
            node.type === "definition" &&
            node.identifier &&
            node.url &&
            !definitions.has(node.identifier)
          ) {
            definitions.set(node.identifier, node.url);
          }
          node.children?.forEach(collectDefinitions);
        }
        collectDefinitions(tree);

        function flattenText(node: MarkdownNode): string {
          if (typeof node.value === "string") return node.value;
          return (node.children ?? []).map(flattenText).join("");
        }

        let insideVideo = false;
        function collectCandidates(node: MarkdownNode) {
          const offset = node.position?.start?.offset ?? 0;
          if ((node.type === "link" || node.type === "image") && node.url) {
            const label =
              node.type === "image" ? (node.alt?.trim() ?? "") : flattenText(node).trim();
            candidates.push({ offset, href: node.url, label, fromVideoTag: false });
          } else if (
            (node.type === "linkReference" || node.type === "imageReference") &&
            node.identifier
          ) {
            const url = definitions.get(node.identifier);
            if (url) {
              const label =
                node.type === "imageReference"
                  ? (node.alt?.trim() ?? "")
                  : flattenText(node).trim();
              candidates.push({ offset, href: url, label, fromVideoTag: false });
            }
          } else if (node.type === "html" && typeof node.value === "string") {
            const html = maskHiddenHtml(node.value);
            HTML_VIDEO_SRC_RE.lastIndex = 0;
            let match: RegExpExecArray | null;
            while ((match = HTML_VIDEO_SRC_RE.exec(html)) !== null) {
              if (/^<\/video\b/i.test(match[0])) {
                insideVideo = false;
                continue;
              }
              const videoTag = /^<video\b/i.test(match[0]);
              if (videoTag) insideVideo = !/\/\s*>$/.test(match[0]);
              if (!videoTag && !insideVideo) continue;
              const srcMatch = SRC_FROM_HTML_RE.exec(match[0] ?? "");
              if (!srcMatch) continue;
              const titleMatch = TITLE_FROM_HTML_RE.exec(match[0] ?? "");
              candidates.push({
                offset: offset + match.index,
                href: decodeHtmlAttribute((srcMatch[1] ?? srcMatch[2] ?? srcMatch[3] ?? "").trim()),
                label: decodeHtmlAttribute(
                  (titleMatch?.[1] ?? titleMatch?.[2] ?? titleMatch?.[3] ?? "").trim(),
                ),
                fromVideoTag: true,
              });
            }
          }
          node.children?.forEach(collectCandidates);
        }
        collectCandidates(tree);
        candidates.sort((a, b) => a.offset - b.offset);
        for (let index = candidates.length - 1; index >= 0; index--) {
          const candidate = candidates[index]!;
          const video = videoFromHref(
            candidate.href,
            candidate.label,
            candidate.fromVideoTag,
            resolvers,
          );
          if (video) videos.push(video);
        }
      }
    }
  } else {
    const toolVideos = completedToolVideoSources(item);
    for (let index = toolVideos.length - 1; index >= 0; index--) {
      const source = toolVideos[index]!;
      const video = buildLocalOrExternalVideo(source.src, source.name, source.mimeType, resolvers);
      if (video) videos.push(video);
    }
  }

  const cachedByKey = itemCache.get(item) ?? new Map();
  cachedByKey.set(cacheKey, videos);
  itemCache.set(item, cachedByKey);
  return videos;
}

export function collectThreadVideos(
  items: readonly RuntimeChatItem[],
  formatter?: MarkdownFormatter,
  resolvers: ThreadVideoResolvers = {},
): readonly ThreadVideo[] {
  const seen = new Set<string>();
  const videos: ThreadVideo[] = [];
  for (let index = items.length - 1; index >= 0; index--) {
    for (const video of itemVideos(items[index]!, formatter, resolvers)) {
      if (seen.has(video.target)) continue;
      seen.add(video.target);
      videos.push(video);
    }
  }
  return videos;
}

export function useThreadVideos(threadId: string | undefined): readonly ThreadVideo[] {
  return useAppStore((state) => {
    if (!threadId) return EMPTY_VIDEOS;
    const ids = state.runtimeItemIdsByThread[threadId];
    const byId = state.runtimeItemsByIdByThread[threadId];
    if (!ids || !byId) return EMPTY_VIDEOS;
    const revision = state.runtimeStructuralVersionByThread[threadId] ?? 0;
    const thread = state.threads.find((candidate) => candidate.id === threadId);
    const formatter = thread?.agentKind
      ? resolveThreadTranscriptMarkdownFormatter(thread.agentKind)
      : undefined;
    const project = thread
      ? state.projects.find((candidate) => candidate.id === thread.projectId)
      : undefined;
    const resolvers: ThreadVideoResolvers = {};
    if (project && thread) {
      const projectLocation = resolveProjectLocation(project.location, thread.worktreePath);
      resolvers.projectRoot = getProjectFsPath(projectLocation);
      const homeDir = threadHostHomeDir(thread);
      const extraRoots = resolveThreadMarkdownImageRoots({
        agentKind: thread.agentKind,
        ...(thread.sessionRef?.providerSessionId
          ? { sessionId: thread.sessionRef.providerSessionId }
          : {}),
        projectLocation,
        ...(homeDir ? { homeDir } : {}),
      });
      if (extraRoots) resolvers.extraRoots = extraRoots;
    }
    const resolverKey = resolversCacheKey(formatter, resolvers);
    const cached = collectionCache.get(ids);
    if (cached?.revision === revision && cached.resolverKey === resolverKey) {
      return cached.videos;
    }
    const videos = collectThreadVideos(
      ids.flatMap((id) => (byId[id] ? [byId[id]] : [])),
      formatter,
      resolvers,
    );
    collectionCache.set(ids, { revision, resolverKey, videos });
    return videos;
  });
}
