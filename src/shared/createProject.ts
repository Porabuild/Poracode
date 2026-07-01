import type { ProjectLocation } from "./contracts";
import { parseWslUncPath, toWslUncPath } from "./wsl";

/**
 * Where a new project should be created. `native` resolves to the host's own
 * filesystem (windows or posix depending on platform); `wsl` targets a named
 * WSL distribution.
 */
export type RuntimeChoice = { kind: "native" } | { kind: "wsl"; distro: string };

/** Concrete `ProjectLocation` kind, once a platform is known. */
export type ScratchKind = ProjectLocation["kind"];

/** Characters that are illegal in a folder name on at least one supported OS. */
const ILLEGAL_NAME_CHARS = /[/\\:*?"<>|]/;

/**
 * Derive a `ProjectLocation` from an absolute path. A WSL UNC path always wins
 * (the path is authoritative); otherwise the host platform decides between a
 * windows and a posix location.
 */
export function deriveLocationFromPath(path: string, platform: NodeJS.Platform): ProjectLocation {
  const parsed = parseWslUncPath(path);
  if (parsed) {
    return { kind: "wsl", distro: parsed.distro, linuxPath: parsed.linuxPath, uncPath: path };
  }
  if (platform === "win32") {
    return { kind: "windows", path };
  }
  return { kind: "posix", path };
}

/**
 * Validate a folder name for "start from scratch". Returns an error message to
 * show inline, or `null` when the name is acceptable.
 */
export function validateProjectName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Enter a project name.";
  if (trimmed === "." || trimmed === "..") return "That name isn't allowed.";
  if (ILLEGAL_NAME_CHARS.test(trimmed)) return "A name can't contain / \\ : * ? \" < > or |.";
  if (trimmed.length > 255) return "That name is too long.";
  return null;
}

function separatorForKind(kind: ScratchKind): "\\" | "/" {
  return kind === "posix" ? "/" : "\\";
}

/**
 * Join a parent directory and a new folder name using the separator for the
 * given kind. Mirrors what the main process does on disk; used for the modal's
 * live path preview.
 */
export function buildScratchTargetPath(parent: string, name: string, kind: ScratchKind): string {
  const sep = separatorForKind(kind);
  const trimmedParent = parent.replace(/[\\/]+$/, "");
  return `${trimmedParent}${sep}${name}`;
}

/** Return the parent directory of an absolute path for the given kind. */
export function parentDirOf(path: string, kind: ScratchKind): string {
  const sep = separatorForKind(kind);
  const trimmed = path.replace(/[\\/]+$/, "");
  const idx = trimmed.lastIndexOf(sep);
  if (idx < 0) return trimmed;
  if (kind === "posix") {
    // A single leading "/" means the parent is the filesystem root.
    return idx === 0 ? "/" : trimmed.slice(0, idx);
  }
  const parent = trimmed.slice(0, idx);
  // A bare drive ("C:") means the parent is the drive root ("C:\").
  return /^[A-Za-z]:$/.test(parent) ? `${parent}\\` : parent;
}

/**
 * Split a path into its leading portion and its last segment (with the leading
 * separator) for middle-ellipsis display: render `head` truncating with `…` and
 * `tail` pinned, so a long path collapses in the middle while the leaf stays
 * visible. Accepts either separator since this is display-only.
 */
export function splitPathLeaf(path: string): { head: string; tail: string } {
  const match = /^(.*)([\\/][^\\/]*)$/.exec(path);
  return match ? { head: match[1]!, tail: match[2]! } : { head: "", tail: path };
}

/** Stable settings key under which a runtime's last-used directory is stored. */
export function runtimeKeyForChoice(choice: RuntimeChoice): string {
  return choice.kind === "wsl" ? choice.distro : "native";
}

/** Stable settings key for an already-derived location. */
export function runtimeKeyForLocation(location: ProjectLocation): string {
  return location.kind === "wsl" ? location.distro : "native";
}

/** Resolve a runtime choice to a concrete location kind for the host platform. */
export function scratchKindForChoice(
  choice: RuntimeChoice,
  platform: NodeJS.Platform,
): ScratchKind {
  if (choice.kind === "wsl") return "wsl";
  return platform === "win32" ? "windows" : "posix";
}

/**
 * Validate that the chosen parent folder matches the selected runtime for
 * "start from scratch". Returns an error message or `null`.
 */
export function validateScratchParent(parent: string, choice: RuntimeChoice): string | null {
  if (!parent.trim()) return "Choose a parent folder.";
  const isWslPath = parseWslUncPath(parent) !== null;
  if (choice.kind === "wsl" && !isWslPath) {
    return `Choose a folder inside ${choice.distro} (a \\\\wsl.localhost path).`;
  }
  if (choice.kind === "native" && isWslPath) {
    return "That folder is inside WSL. Switch the runtime to that distro, or pick a native folder.";
  }
  return null;
}

/** Default browse directory for a WSL distro: its `/home` over the UNC bridge. */
export function wslHomeDir(distro: string): string {
  return toWslUncPath(distro, "home");
}

/** Default clone folder name from an "owner/name" repo id (the bare repo name). */
export function cloneFolderNameFromRepo(nameWithOwner: string): string {
  const leaf = nameWithOwner.split("/").pop() ?? nameWithOwner;
  return leaf.replace(/\.git$/i, "");
}

/**
 * Default clone folder name from a git URL: the last path segment with any
 * trailing `.git` and slashes removed. Handles both https
 * (`https://host/owner/repo.git`) and scp-style (`git@host:owner/repo.git`).
 */
export function cloneFolderNameFromUrl(url: string): string {
  const trimmed = (url.trim().split(/[?#]/)[0] ?? "").replace(/\.git$/i, "").replace(/[/\\]+$/, "");
  if (!trimmed) return "";
  const match = /[^/:\\]+$/.exec(trimmed);
  return match ? match[0] : "";
}
