import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Project, ProjectLocation } from "@/shared/contracts";
import {
  parseProjectIcon,
  projectSupportsFileIcons,
  resolveProjectIconPath,
} from "@/shared/projectIcon";
import { resolveLocalImageDisplayUrl } from "@/shared/localImageDisplay";
import { toLocalFileUrl } from "@/shared/promptContent";
import { getProjectFsPath } from "@/shared/wsl";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { findProjectIcon } from "@/renderer/utils/projectIcons";
import { resolveProjectIconColor } from "@/renderer/utils/projectIconColors";

type ProjectIconSource = Pick<Project, "id" | "icon" | "location" | "remoteServerId">;

// ── `auto` resolution cache ─────────────────────────────────────────
// Detection reads the project's folder on disk, so it runs in the main
// process; results are cached per project + folder and shared by every row
// that renders the same project.

const autoIconResults = new Map<string, string | null>();
const autoIconInFlight = new Set<string>();
const autoIconListeners = new Set<() => void>();

function subscribeAutoIcons(listener: () => void): () => void {
  autoIconListeners.add(listener);
  return () => {
    autoIconListeners.delete(listener);
  };
}

function notifyAutoIcons(): void {
  for (const listener of autoIconListeners) listener();
}

/**
 * Keyed by project + folder so relocating a project re-runs detection.
 * Undefined whenever the probe cannot run at all: mirrored projects live on
 * another machine, and the PWA bridge rejects `detectProjectIcon` outright, so
 * those surfaces stay on the fallback glyph instead of retrying per row.
 */
function autoIconKey(project: ProjectIconSource): string | undefined {
  if (!projectSupportsFileIcons(project) || isRemoteSession()) return undefined;
  const rootPath = getProjectFsPath(project.location);
  return rootPath ? `${project.id}|${rootPath}` : undefined;
}

/** Probe the folder once per key; both a hit and a failure are cached. */
function startAutoIconDetection(key: string, location: ProjectLocation): void {
  if (autoIconResults.has(key) || autoIconInFlight.has(key)) return;
  autoIconInFlight.add(key);
  readBridge()
    .detectProjectIcon({ projectLocation: location })
    .then((path) => {
      autoIconResults.set(key, path);
    })
    .catch(() => {
      autoIconResults.set(key, null);
    })
    .finally(() => {
      autoIconInFlight.delete(key);
      notifyAutoIcons();
    });
}

function useAutoIconPath(project: ProjectIconSource | undefined): string | null | undefined {
  const key = project ? autoIconKey(project) : undefined;
  const location = project?.location;
  useEffect(() => {
    if (!key || !location) return;
    startAutoIconDetection(key, location);
  }, [key, location]);
  return useSyncExternalStore(subscribeAutoIcons, () =>
    key ? (autoIconResults.get(key) ?? undefined) : undefined,
  );
}

/**
 * Renderable URL for an image stored relative to the project folder, or null
 * when the path escapes the root. Exported for the picker, which previews the
 * icon files discovered inside the project.
 */
export function projectIconImageUrl(
  project: ProjectIconSource,
  relativePath: string,
): string | null {
  const rootPath = getProjectFsPath(project.location);
  if (!rootPath) return null;
  const absolutePath = resolveProjectIconPath(rootPath, relativePath);
  if (!absolutePath) return null;
  return resolveLocalImageDisplayUrl(toLocalFileUrl(absolutePath));
}

/**
 * Resolve a project's custom icon to a renderable node, or null when the
 * project has none (or it is still resolving) and the caller should fall back
 * to its default glyph. Hook-based so list rows can resolve many projects.
 */
export function useProjectIconNode(
  project: ProjectIconSource,
  className?: string,
): ReactNode | null {
  const spec = parseProjectIcon(project.icon);
  const wantsAuto = spec?.kind === "auto";
  const autoPath = useAutoIconPath(wantsAuto ? project : undefined);
  // An image icon whose file was deleted (or fails to load) falls back to the
  // caller's default glyph instead of rendering a broken-image box.
  const [imageFailed, setImageFailed] = useState(false);
  const relativePath =
    !spec || spec.kind === "lucide"
      ? undefined
      : spec.kind === "file"
        ? spec.path
        : (autoPath ?? undefined);
  const imageUrl =
    spec && spec.kind !== "lucide" && projectSupportsFileIcons(project) && relativePath
      ? projectIconImageUrl(project, relativePath)
      : undefined;
  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);
  if (!spec) return null;
  if (spec.kind === "lucide") {
    const entry = findProjectIcon(spec.name);
    if (!entry) return null;
    // An inline colour beats the caller's `text-muted`, which is what a tinted
    // glyph is for; untinted glyphs keep inheriting the surrounding row colour.
    const color = resolveProjectIconColor(spec.color);
    return (
      <entry.Icon
        className={`${className ?? "size-4"} shrink-0`}
        aria-hidden="true"
        {...(color ? { style: { color } } : {})}
      />
    );
  }
  // File-based icons only resolve on the machine hosting the project.
  if (!projectSupportsFileIcons(project)) return null;
  if (!imageUrl || imageFailed) return null;
  return (
    <img
      src={imageUrl}
      alt=""
      draggable={false}
      onError={() => setImageFailed(true)}
      className={`${className ?? "size-4"} shrink-0 rounded-[3px] object-contain`}
    />
  );
}

/** Standalone form for surfaces that render exactly one project's icon. */
export function ProjectIcon(props: { project: ProjectIconSource; className?: string }) {
  return useProjectIconNode(props.project, props.className);
}
