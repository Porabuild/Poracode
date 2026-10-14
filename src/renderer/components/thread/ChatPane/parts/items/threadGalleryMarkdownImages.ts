import { unified } from "unified";
import remarkParse from "remark-parse";
import { resolveLocalImageDisplayUrl } from "@/shared/localImageDisplay";
import { resolveMarkdownImageUrl } from "@/shared/markdownLocalImages";
import { fileNameFromPath, toLocalFileUrl } from "@/shared/promptContent";
import { imageUrlMetadata } from "@/renderer/utils/imageUrlMetadata";
import type { ThreadGalleryImage, ThreadGalleryResolvers } from "./threadGalleryImages";

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
  recordLocalUrl?: (url: string, src: string) => void,
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
  const displayResolvers: ThreadGalleryResolvers = recordLocalUrl
    ? {
        ...resolvers,
        remoteLocalImageUrl: (url) => {
          const src = resolvers.remoteLocalImageUrl
            ? resolvers.remoteLocalImageUrl(url)
            : resolveLocalImageDisplayUrl(url);
          recordLocalUrl(url, src);
          return src;
        },
      }
    : resolvers;
  for (const candidate of candidates) {
    if (!candidate.rawUrl) continue;
    const resolved = candidate.fromHtml
      ? resolveHtmlImageTarget(candidate.rawUrl, displayResolvers)
      : resolveMarkdownImageTarget(candidate.rawUrl, displayResolvers);
    if (resolved) {
      const alt = candidate.alt || fileNameFromPath(candidate.rawUrl);
      // Read metadata before a remote resolver replaces the original path with an opaque URL.
      const { fileName, mime } = imageUrlMetadata(candidate.rawUrl, alt);
      out.push({ src: resolved, fileName, mime, ...(alt ? { alt } : {}) });
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
    return resolvers.remoteLocalImageUrl(poracodeLocalUrl);
  }
  // Desktop (no remote resolver installed) keeps `poracode-local://` untouched
  // for the privileged protocol handler; remote clients map via the global
  // resolver installed by the mobile bridge.
  return resolveLocalImageDisplayUrl(poracodeLocalUrl);
}
