import { unified } from "unified";
import remarkParse from "remark-parse";
import { assistantDisplayText } from "@/shared/assistantMessageText";
import { isVideoPath } from "@/shared/chatVideo";
import { fileNameFromPath, isImagePath } from "@/shared/promptContent";
import { normalizeWindowsDrivePath } from "@/shared/pathUtils";
import type { MessageItemPayload } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { getThreadMap } from "@/renderer/state/useThread";
import {
  getRuntimeItemPayload,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";
import {
  AUTO_PATH_FILE_HREF_PREFIX,
  AUTO_PATH_FOLDER_HREF_PREFIX,
  parsePathRefUrl,
} from "./ChatPane/parts/items/markdownPathRefs";
import { parseProjectPathRef } from "./ChatPane/parts/items/parseProjectPathRef";
import { resolveThreadTranscriptMarkdownFormatter } from "./threadTranscriptMarkdown";

type MarkdownFormatter = ((text: string) => string) | undefined;

export type ThreadArtifactCategory = "file" | "artifact";

export interface ThreadArtifact {
  target: string;
  name: string;
  external: boolean;
  category: ThreadArtifactCategory;
}

export interface ThreadFilesAndArtifacts {
  files: readonly ThreadArtifact[];
  artifacts: readonly ThreadArtifact[];
}

interface MarkdownNode {
  type: string;
  url?: string;
  identifier?: string;
  value?: string;
  children?: MarkdownNode[];
}

/** Non-code deliverable/document/archive/audio files linked by the agent count as Files. */
const DELIVERABLE_FILE_EXT_RE =
  /\.(?:pdf|docx?|xlsx?|pptx?|csv|tsv|zip|gz|tar|7z|rar|mp3|wav|ogg|m4a|flac|epub|rtf)$/i;
const EXTERNAL_EXTRA_FILE_EXT_RE = /\.(?:json|txt|md|html?)$/i;

const parser = unified().use(remarkParse).freeze();
const itemCache = new WeakMap<RuntimeChatItem, Map<MarkdownFormatter, readonly ThreadArtifact[]>>();
const EMPTY_ARTIFACTS: readonly ThreadArtifact[] = [];
const EMPTY_SPLIT: ThreadFilesAndArtifacts = { files: EMPTY_ARTIFACTS, artifacts: EMPTY_ARTIFACTS };
const collectionCache = new WeakMap<
  readonly string[],
  {
    revision: number;
    formatter: MarkdownFormatter;
    all: readonly ThreadArtifact[];
    split: ThreadFilesAndArtifacts;
  }
>();

function itemArtifacts(
  item: RuntimeChatItem,
  formatter: MarkdownFormatter,
): readonly ThreadArtifact[] {
  if (item.parentItemId || (item.type !== "assistant_message" && item.type !== "user_message"))
    return EMPTY_ARTIFACTS;
  if (item.state !== "completed") return EMPTY_ARTIFACTS;
  const cached = itemCache.get(item)?.get(formatter);
  if (cached) return cached;
  const artifacts: ThreadArtifact[] = [];
  const payload = getRuntimeItemPayload<MessageItemPayload>(item, item.type);
  for (const block of payload?.content ?? []) {
    if (
      block.kind === "file" &&
      !isImagePath(block.path, block.mimeType ?? undefined) &&
      !isVideoPath(block.path, block.mimeType ?? undefined)
    )
      artifacts.push({
        target: normalizeWindowsDrivePath(block.path),
        name: block.name || fileNameFromPath(block.path),
        external: false,
        category: "file",
      });
  }
  if (item.type === "assistant_message") {
    const rawText = assistantDisplayText(item);
    const text = formatter ? formatter(rawText) : rawText;
    if (text.includes("[")) {
      const tree = parser.parse(text) as MarkdownNode;
      const definitions = new Map<string, string>();
      function collectDefinitions(node: MarkdownNode) {
        if (
          node.type === "definition" &&
          node.identifier &&
          node.url &&
          !definitions.has(node.identifier)
        )
          definitions.set(node.identifier, node.url);
        node.children?.forEach(collectDefinitions);
      }
      collectDefinitions(tree);
      function collectLinks(node: MarkdownNode) {
        const href =
          node.type === "link"
            ? node.url
            : node.type === "linkReference" && node.identifier
              ? definitions.get(node.identifier)
              : undefined;
        if (href) {
          const artifact = artifactFromHref(href);
          if (artifact) artifacts.push(artifact);
        }
        node.children?.forEach(collectLinks);
      }
      collectLinks(tree);
    }
  }
  const cachedByFormatter = itemCache.get(item) ?? new Map();
  cachedByFormatter.set(formatter, artifacts);
  itemCache.set(item, cachedByFormatter);
  return artifacts;
}

function artifactFromHref(href: string): ThreadArtifact | undefined {
  const explicit = parsePathRefUrl(href);
  if (explicit?.kind === "folder") return undefined;
  if (
    !explicit &&
    (href.startsWith(AUTO_PATH_FILE_HREF_PREFIX) || href.startsWith(AUTO_PATH_FOLDER_HREF_PREFIX))
  )
    return undefined;
  if (/^https?:\/\//i.test(href) && !explicit) {
    try {
      const url = new URL(href);
      if (
        !DELIVERABLE_FILE_EXT_RE.test(url.pathname) &&
        !EXTERNAL_EXTRA_FILE_EXT_RE.test(url.pathname)
      )
        return undefined;
      return {
        target: href,
        name: fileNameFromPath(decodeURIComponent(url.pathname)),
        external: true,
        category: "file",
      };
    } catch {
      return undefined;
    }
  }
  // Only file URLs, native paths and the existing internal path links can open files.
  if (
    !explicit &&
    /^[a-z][a-z\d+.-]*:/i.test(href) &&
    !/^file:\/\//i.test(href) &&
    !/^[a-z]:[\\/]/i.test(href)
  )
    return undefined;
  let path = explicit?.path ?? href;
  try {
    if (/^file:\/\//i.test(path)) {
      const url = new URL(path);
      path = decodeURIComponent(url.pathname);
      if (url.hostname) path = `//${url.hostname}${path}`;
      else if (/^\/[a-z]:[\\/]/i.test(path)) path = path.slice(1);
    } else if (!explicit) path = decodeURIComponent(path);
  } catch {
    return undefined;
  }
  const ref = explicit ?? parseProjectPathRef(path);
  const filePath =
    ref?.kind === "file" ? ref.path : /\.[a-z\d]{1,12}$/i.test(path) ? path : undefined;
  if (!filePath || isImagePath(filePath) || isVideoPath(filePath)) return undefined;
  const hasLineRef = ref?.kind === "file" && ref.line !== undefined;
  const category: ThreadArtifactCategory =
    !hasLineRef && DELIVERABLE_FILE_EXT_RE.test(filePath) ? "file" : "artifact";
  return {
    target: normalizeWindowsDrivePath(filePath),
    name: fileNameFromPath(filePath),
    external: false,
    category,
  };
}

export function collectThreadArtifacts(
  items: readonly RuntimeChatItem[],
  formatter?: MarkdownFormatter,
): readonly ThreadArtifact[] {
  const indexByTarget = new Map<string, number>();
  const artifacts: ThreadArtifact[] = [];
  for (let index = items.length - 1; index >= 0; index--) {
    for (const artifact of itemArtifacts(items[index]!, formatter)) {
      const existingIndex = indexByTarget.get(artifact.target);
      if (existingIndex !== undefined) {
        const existing = artifacts[existingIndex]!;
        const category =
          existing.category !== "file" && artifact.category === "file" ? "file" : existing.category;
        const existingIsDefaultName = existing.name === fileNameFromPath(existing.target);
        const incomingHasCustomName =
          artifact.category === "file" && artifact.name !== fileNameFromPath(artifact.target);
        const name = existingIsDefaultName && incomingHasCustomName ? artifact.name : existing.name;
        if (category !== existing.category || name !== existing.name) {
          artifacts[existingIndex] = { ...existing, category, name };
        }
        continue;
      }
      indexByTarget.set(artifact.target, artifacts.length);
      artifacts.push(artifact);
    }
  }
  return artifacts;
}

export function splitThreadArtifacts(items: readonly ThreadArtifact[]): ThreadFilesAndArtifacts {
  const files: ThreadArtifact[] = [];
  const artifacts: ThreadArtifact[] = [];
  for (const item of items) {
    if (item.category === "file") files.push(item);
    else artifacts.push(item);
  }
  return { files, artifacts };
}

export function collectThreadFilesAndArtifacts(
  items: readonly RuntimeChatItem[],
  formatter?: MarkdownFormatter,
): ThreadFilesAndArtifacts {
  return splitThreadArtifacts(collectThreadArtifacts(items, formatter));
}

function selectCachedArtifacts(
  state: ReturnType<typeof useAppStore.getState>,
  threadId: string | undefined,
): { all: readonly ThreadArtifact[]; split: ThreadFilesAndArtifacts } | undefined {
  if (!threadId) return undefined;
  const ids = state.runtimeItemIdsByThread[threadId];
  const byId = state.runtimeItemsByIdByThread[threadId];
  if (!ids || !byId) return undefined;
  // Like the image gallery, only completed message structure can add outputs;
  // streaming text must not rescan the loaded history for every subscriber.
  const revision = state.runtimeStructuralVersionByThread[threadId] ?? 0;
  const agentKind = getThreadMap(state.threads).get(threadId)?.agentKind;
  const formatter = agentKind ? resolveThreadTranscriptMarkdownFormatter(agentKind) : undefined;
  const cached = collectionCache.get(ids);
  if (cached?.revision === revision && cached.formatter === formatter) {
    return cached;
  }
  const resolvedItems: RuntimeChatItem[] = [];
  for (const id of ids) {
    const item = byId[id];
    if (item) resolvedItems.push(item);
  }
  const all = collectThreadArtifacts(resolvedItems, formatter);
  const split = splitThreadArtifacts(all);
  const entry = { revision, formatter, all, split };
  collectionCache.set(ids, entry);
  return entry;
}

export function useThreadArtifacts(threadId: string | undefined): readonly ThreadArtifact[] {
  return useAppStore((state) => selectCachedArtifacts(state, threadId)?.all ?? EMPTY_ARTIFACTS);
}

export function useThreadFilesAndArtifacts(threadId: string | undefined): ThreadFilesAndArtifacts {
  return useAppStore((state) => selectCachedArtifacts(state, threadId)?.split ?? EMPTY_SPLIT);
}
