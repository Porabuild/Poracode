/**
 * On-disk cache for ACP registry agent icons.
 *
 * Registry icons ship as remote CDN URLs (e.g. `https://cdn.agentclientprotocol.com/.../glm-acp-agent.svg`).
 * Without caching, the renderer uses each URL as a CSS `mask-image` and Chromium has to
 * fetch the SVG before the mask paints — so on every cold start there is a flicker
 * where ACP agent tiles render with no glyph until the network round-trip completes.
 *
 * This helper downloads the SVG once at install / backfill time and returns a
 * `lightcode-local://` URL pointing at the cached file. The renderer can then paint
 * the icon synchronously on every subsequent app start.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { toLocalFileUrl } from "@/shared/promptContent";
import { downloadToFile } from "../runtime/download";

const ICON_INDEX_FILENAME = "icon-index.json";
const ICON_INDEX_VERSION = 1;

interface IconIndex {
  version: number;
  // agentId → source URL last downloaded. The on-disk filename is derived
  // deterministically from agentId + extension; storing the source URL is
  // what lets us detect "registry pointed at a new icon, re-download."
  entries: Record<string, string>;
}

function indexPath(iconsDir: string): string {
  return join(iconsDir, ICON_INDEX_FILENAME);
}

function readIconIndex(iconsDir: string): IconIndex {
  try {
    const raw = readFileSync(indexPath(iconsDir), "utf8");
    const parsed = JSON.parse(raw) as Partial<IconIndex>;
    if (parsed.version !== ICON_INDEX_VERSION || !parsed.entries) {
      return { version: ICON_INDEX_VERSION, entries: {} };
    }
    return { version: ICON_INDEX_VERSION, entries: parsed.entries };
  } catch {
    return { version: ICON_INDEX_VERSION, entries: {} };
  }
}

function writeIconIndex(iconsDir: string, index: IconIndex): void {
  writeFileSync(indexPath(iconsDir), JSON.stringify(index), "utf8");
}

function iconFileName(agentId: string, url: string): string {
  // Agent ids are constrained by `agentInstanceIdSchema` to
  // `[a-z0-9][a-z0-9_\-:.]*`, so colon is the only filesystem-unsafe char.
  const safeId = agentId.replaceAll(":", "_");
  const ext = pickExtension(url);
  return `${safeId}${ext}`;
}

function pickExtension(url: string): string {
  try {
    const ext = extname(new URL(url).pathname).toLowerCase();
    return ext === ".png" ? ".png" : ".svg";
  } catch {
    return ".svg";
  }
}

export function isRemoteIconUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * Cache a remote ACP registry icon to disk and return a `lightcode-local://`
 * URL pointing at the cached file. Reuses an existing cache entry when the
 * source URL is unchanged and the file is still on disk; mismatched or missing
 * entries trigger a fresh download.
 *
 * Returns the original URL unchanged when it is already a local URL or when
 * the download fails — callers (install / backfill) keep whatever URL they
 * had, so offline scenarios degrade to the previous behavior rather than
 * losing the icon entirely.
 */
export async function cacheAcpRegistryIcon(input: {
  iconUrl: string;
  agentId: string;
  iconsDir: string;
}): Promise<string> {
  if (!isRemoteIconUrl(input.iconUrl)) return input.iconUrl;
  const index = readIconIndex(input.iconsDir);
  const fileName = iconFileName(input.agentId, input.iconUrl);
  const filePath = join(input.iconsDir, fileName);
  if (index.entries[input.agentId] === input.iconUrl && existsSync(filePath)) {
    return toLocalFileUrl(filePath);
  }
  try {
    mkdirSync(input.iconsDir, { recursive: true });
    await downloadToFile(input.iconUrl, filePath);
  } catch (error) {
    console.warn(
      `[acp-registry] icon cache failed for ${input.agentId}:`,
      error instanceof Error ? error.message : String(error),
    );
    return input.iconUrl;
  }
  index.entries[input.agentId] = input.iconUrl;
  writeIconIndex(input.iconsDir, index);
  return toLocalFileUrl(filePath);
}
