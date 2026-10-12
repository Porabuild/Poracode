import { open } from "node:fs/promises";
import { bundledWebClientAssetPath } from "./bundledWebClient";

/** Generated entry heads must fit this bounded local-HTTP recognition window. */
export const LOCAL_CLIENT_HTML_HEAD_BYTES = 64 * 1024;

// Private, additive document contract; mirror in renderer/buildAssetBase.ts.
// Old renderers ignore it. It never changes the document's navigation base.
export const LOCAL_CLIENT_ASSET_BASE_META_NAME = "poracode-build-asset-base";
const ASSET_BASE_META = '<meta name="' + LOCAL_CLIENT_ASSET_BASE_META_NAME + '" content="/">';

export interface LocalClientHtml {
  readonly sourcePrefixBytes: number;
  readonly prefix: Buffer;
}

/**
 * Recognizes the generated Vite head using at most 64 KiB. Unrecognized,
 * incomplete, oversized or unreadable heads keep the legacy representation.
 * Only allowlisted script/link asset URLs change; body text, navigation URLs,
 * existing base tags and the on-disk Electron/hosted document remain intact.
 */
export async function readLocalClientHtml(
  filePath: string,
  size: number,
  isAborted?: () => boolean,
): Promise<LocalClientHtml | null> {
  if (isAborted?.()) return null;
  const handle = await open(filePath, "r").catch(() => null);
  if (!handle) return null;
  try {
    const bytes = Buffer.allocUnsafe(Math.min(size, LOCAL_CLIENT_HTML_HEAD_BYTES));
    let position = 0;
    while (position < bytes.length) {
      if (isAborted?.()) return null;
      const { bytesRead } = await handle.read(bytes, position, bytes.length - position, position);
      if (bytesRead === 0) break;
      position += bytesRead;
    }
    if (isAborted?.()) return null;
    return normalizeLocalClientHtmlHead(bytes.subarray(0, position));
  } catch {
    return null;
  } finally {
    await handle.close().catch(() => {});
  }
}

/** Pure bounded recognition, also exercised with split file reads in tests. */
export function normalizeLocalClientHtmlHead(bytes: Buffer): LocalClientHtml | null {
  const html = bytes.subarray(0, LOCAL_CLIENT_HTML_HEAD_BYTES).toString("utf8");
  // Quoted attributes and comments stay whole. Script/style text is skipped
  // separately, so embedded examples of link/head tags cannot be rewritten.
  const tags =
    /<!--[\s\S]*?(?:-->|$)|<![^>]*>|<(\/?)([a-z][a-z\d:-]*)(?:[^"'<>]|"[^"]*"|'[^']*')*>/giu;
  let headStart = -1;
  let headEnd = -1;
  let rewritten = "";
  let copied = 0;
  let hasAssetBase = false;
  let match: RegExpExecArray | null;
  while ((match = tags.exec(html)) !== null) {
    const tag = match[0];
    const name = match[2]?.toLowerCase();
    const closing = match[1] === "/";
    if (!name) continue;
    if (name === "head") {
      if (!closing) {
        if (headStart !== -1) return null;
        headStart = tags.lastIndex;
        rewritten = html.slice(0, headStart);
        copied = headStart;
      } else if (headStart !== -1) {
        headEnd = tags.lastIndex;
        break;
      }
    }
    if (name === "body" && !closing) return null;
    if (headStart !== -1 && !closing && name === "meta") {
      hasAssetBase ||=
        readAttribute(tag, "name") === LOCAL_CLIENT_ASSET_BASE_META_NAME &&
        readAttribute(tag, "content") === "/";
    }
    if (headStart !== -1 && !closing && (name === "script" || name === "link")) {
      const normalized = normalizeAssetTag(tag, name === "script" ? "src" : "href");
      rewritten += html.slice(copied, match.index) + normalized;
      copied = tags.lastIndex;
    }
    if (!closing && (name === "script" || name === "style" || name === "title")) {
      const rawEnd = new RegExp("</" + name + "\\s*>", "giu");
      rawEnd.lastIndex = tags.lastIndex;
      const end = rawEnd.exec(html);
      if (!end) return null;
      tags.lastIndex = rawEnd.lastIndex;
    }
  }
  if (headStart === -1 || headEnd === -1) return null;
  const sourceHead = Buffer.from(html.slice(0, headEnd));
  // Invalid UTF-8 can expand to replacement characters during decoding. A
  // guessed source offset would then skip original body bytes; preserve that
  // custom/corrupt document unchanged instead of repairing its head.
  if (!sourceHead.equals(bytes.subarray(0, sourceHead.length))) return null;
  rewritten += html.slice(copied, headEnd);
  if (!hasAssetBase) {
    rewritten = rewritten.slice(0, headStart) + ASSET_BASE_META + rewritten.slice(headStart);
  }
  return {
    sourcePrefixBytes: sourceHead.length,
    prefix: Buffer.from(rewritten),
  };
}

function normalizeAssetTag(tag: string, attribute: "src" | "href"): string {
  return tag.replace(
    quotedAttributes(),
    (
      original,
      space: string,
      name: string,
      equals: string,
      doubleValue: string | undefined,
      singleValue: string | undefined,
    ) => {
      const url = doubleValue ?? singleValue ?? "";
      if (name.toLowerCase() !== attribute || !url.startsWith("./")) return original;
      const rooted = url.slice(1);
      // Removing the dot must never create a network authority. The URL parser
      // strips tabs/newlines and treats backslashes as slashes on HTTP(S).
      if (/^\/[\t\n\r]*\//u.test(rooted) || rooted.includes("\\")) return original;
      // Character references in query values stay verbatim. Ambiguous encoded
      // path markup is custom HTML, so keep its original URL rather than
      // guessing HTML entity semantics or rooting a hidden reserved route.
      if ((rooted.split(/[?#]/u, 1)[0] ?? "").includes("&")) return original;
      const pathname = new URL(rooted, "http://local-client.invalid").pathname;
      if (bundledWebClientAssetPath(pathname) === null) return original;
      const quote = doubleValue === undefined ? "'" : '"';
      return space + name + equals + quote + rooted + quote;
    },
  );
}

function quotedAttributes(): RegExp {
  return /(\s+)([^\s"'<>/=]+)(\s*=\s*)(?:"([^"]*)"|'([^']*)')/gu;
}

function readAttribute(tag: string, name: string): string | undefined {
  for (const match of tag.matchAll(quotedAttributes())) {
    if (match[2]?.toLowerCase() === name) return match[4] ?? match[5];
  }
  return undefined;
}
