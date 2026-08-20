import type { Project } from "./contracts";

/**
 * Parsed form of {@link Project.icon}. `"auto"` detects an image from the
 * project's files at display time; `lucide` renders a bundled glyph; `file`
 * serves an image stored relative to the project folder.
 */
export type ProjectIconSpec =
  | { kind: "auto" }
  | { kind: "lucide"; name: string; color?: string }
  | { kind: "file"; path: string };

export const PROJECT_ICON_AUTO = "auto";
export const PROJECT_ICON_LUCIDE_PREFIX = "lucide:";
export const PROJECT_ICON_FILE_PREFIX = "file:";

/**
 * Shape of a glyph name and of a colour id. Both are catalog tokens, so the
 * strict form doubles as validation for values arriving from a paired client.
 */
const PROJECT_ICON_TOKEN = /^[a-z0-9-]+$/;

export function parseProjectIcon(icon: string | undefined): ProjectIconSpec | undefined {
  if (!icon) return undefined;
  if (icon === PROJECT_ICON_AUTO) return { kind: "auto" };
  if (icon.startsWith(PROJECT_ICON_LUCIDE_PREFIX)) {
    // `lucide:<name>`, optionally tinted as `lucide:<name>:<colour>`.
    const [name, color, ...rest] = icon.slice(PROJECT_ICON_LUCIDE_PREFIX.length).split(":");
    if (rest.length > 0) return undefined;
    if (!name || !PROJECT_ICON_TOKEN.test(name)) return undefined;
    if (color === undefined) return { kind: "lucide", name };
    return PROJECT_ICON_TOKEN.test(color) ? { kind: "lucide", name, color } : undefined;
  }
  if (icon.startsWith(PROJECT_ICON_FILE_PREFIX)) {
    const path = icon.slice(PROJECT_ICON_FILE_PREFIX.length);
    if (!path || path.includes("\0")) return undefined;
    // Must stay project-relative: no absolute roots (posix, drive letter, UNC)
    // and no traversal. Stored paths are canonical forward-slash; backslashes
    // only appear in crafted values, so reject them outright.
    if (path.startsWith("/") || /^[A-Za-z]:/.test(path) || path.includes("\\")) return undefined;
    if (path.split("/").some((segment) => segment === ".." || segment === "")) return undefined;
    return { kind: "file", path };
  }
  return undefined;
}

export function formatLucideProjectIcon(name: string, color?: string): string {
  const suffix = color ? `:${color}` : "";
  return `${PROJECT_ICON_LUCIDE_PREFIX}${name}${suffix}`;
}

export function formatFileProjectIcon(relativePath: string): string {
  return `${PROJECT_ICON_FILE_PREFIX}${relativePath}`;
}

/**
 * Whether file-based icons (auto-detection, custom files) can resolve for this
 * project on the current machine. Mirrored projects live on another host, so
 * only bundled lucide glyphs render for them; glyph editing stays available.
 */
export function projectSupportsFileIcons(
  project: Pick<Project, "remoteServerId" | "location">,
): boolean {
  return !project.remoteServerId && !project.location.remoteServerId;
}

/**
 * Join a project root and a canonical forward-slash relative icon path.
 * Returns null when the relative path could escape the root — a second guard
 * behind {@link parseProjectIcon}, since stored values can also arrive from
 * remote peers. `toLocalFileUrl` normalizes separators for the protocol URL.
 */
export function resolveProjectIconPath(rootPath: string, relativePath: string): string | null {
  const segments = relativePath.split("/");
  if (segments.length === 0 || segments.some((segment) => segment === "" || segment === "..")) {
    return null;
  }
  return `${rootPath}/${segments.join("/")}`;
}
