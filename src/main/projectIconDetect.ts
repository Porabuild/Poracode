import { existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { ProjectLocation } from "@/shared/contracts";
import { getProjectFsPath } from "@/shared/wsl";

/**
 * Well-known icon files probed for `icon: "auto"`, in priority order. Covers
 * the favicon/app-icon locations web and desktop projects already carry:
 * project root, `public/`, framework app directories (Next.js App Router,
 * `src/`), asset folders, `static/` (SvelteKit, Docusaurus), packaged desktop
 * resources, and JetBrains' project glyph.
 *
 * Vector before raster before `.ico` within each location: the winner is drawn
 * at 14-16px in list rows, where a scaled 16x16 `.ico` reads worst.
 */
const CANDIDATE_PATHS = [
  "favicon.svg",
  "favicon.png",
  "favicon.ico",
  "icon.svg",
  "icon.png",
  "logo.svg",
  "logo.png",
  "public/favicon.svg",
  "public/favicon.png",
  "public/favicon.ico",
  "public/icon.svg",
  "public/icon.png",
  "public/logo.svg",
  "public/logo.png",
  "app/icon.svg",
  "app/icon.png",
  "app/favicon.png",
  "app/favicon.ico",
  "src/app/icon.svg",
  "src/app/icon.png",
  "src/app/favicon.ico",
  "src/favicon.svg",
  "src/favicon.png",
  "src/favicon.ico",
  "assets/icon.svg",
  "assets/icon.png",
  "assets/logo.svg",
  "assets/logo.png",
  "static/favicon.svg",
  "static/favicon.png",
  "static/favicon.ico",
  "resources/icon.svg",
  "resources/icon.png",
  ".idea/icon.svg",
  ".idea/icon.png",
] as const;

/** Max bytes for a detected icon; larger files are skipped. */
const MAX_ICON_BYTES = 2 * 1024 * 1024;

/** Cap on what the picker offers, so a monorepo cannot flood the popover. */
const MAX_LISTED_ICONS = 12;

/**
 * Every usable icon image inside a project folder, in priority order and
 * relative to the project root (forward slashes). The picker offers these for
 * selection; `icon: "auto"` renders the first one.
 */
export function listProjectIconFiles(location: ProjectLocation): string[] {
  let rootPath: string;
  try {
    rootPath = getProjectFsPath(location);
  } catch {
    return [];
  }
  if (!rootPath) return [];
  const found: string[] = [];
  for (const candidatePath of CANDIDATE_PATHS) {
    const candidate = join(rootPath, ...candidatePath.split("/"));
    try {
      if (!existsSync(candidate)) continue;
      const stats = statSync(candidate);
      if (!stats.isFile() || stats.size === 0 || stats.size > MAX_ICON_BYTES) continue;
    } catch {
      continue;
    }
    const relativePath = relative(rootPath, candidate);
    if (!relativePath || relativePath.startsWith("..")) continue;
    found.push(relativePath.split(sep).join("/"));
    if (found.length >= MAX_LISTED_ICONS) break;
  }
  return found;
}

/**
 * Best icon image inside a project folder, relative to the project root
 * (forward slashes), or null when nothing matches — the caller then falls back
 * to the location-kind glyph.
 */
export function detectProjectIconFile(location: ProjectLocation): string | null {
  return listProjectIconFiles(location)[0] ?? null;
}
