import type { Project, ProjectLocation } from "@/shared/contracts";
import { isHomeProjectId } from "@/shared/homeScope";
import { readBridge } from "@/renderer/bridge";
import { activateFileEditorContext } from "@/renderer/actions/fileEditorContext";
import { useFileEditorStore, type FileEditorRootContext } from "@/renderer/state/fileEditorStore";
import { useProjectTreeStore } from "@/renderer/state/projectTreeStore";
import { openFileInEditor } from "@/renderer/utils/gitHelpers";
import { resolveAbsolutePath } from "@/renderer/utils/resolveAbsolutePath";
import type { ChatPaneActions } from "./chatPaneActionsContext";
import { normalizeChatProjectPath } from "./chatPathUtils";

interface ChatPaneFileActionsOptions {
  project: Project;
  targetContext: FileEditorRootContext;
  worktreePath?: string | undefined;
  branch?: string | undefined;
  projectRootNames?: ReadonlySet<string> | undefined;
  onOpenProjectRelativePath?: ((path: string, lineNumber?: number) => void) | undefined;
  onRevealProjectFolderInTree?: ((path: string) => void) | undefined;
  canShowProjectEntryInExplorer?: boolean | undefined;
}

/** File opening is available in Home; project tree actions require a project. */
export function createChatPaneFileActions({
  project,
  targetContext,
  worktreePath,
  branch,
  projectRootNames,
  onOpenProjectRelativePath,
  onRevealProjectFolderInTree,
  canShowProjectEntryInExplorer,
}: ChatPaneFileActionsOptions): ChatPaneActions {
  const isHomeScope = isHomeProjectId(project.id);
  const openProjectRelativePath = async (path: string, lineNumber?: number) => {
    // Home has no project search index. Resolve relative references from its
    // cwd and keep all opens absolute so they use the external-file reader.
    const resolvedPath = isHomeScope
      ? resolveHomeFilePath(path, targetContext.projectLocation)
      : await resolveBareBasename(
          normalizeChatProjectPath(path, targetContext.projectLocation),
          targetContext.projectLocation,
          projectRootNames,
        );
    if (onOpenProjectRelativePath) {
      onOpenProjectRelativePath(resolvedPath, lineNumber);
      return;
    }
    await openFileInEditor(project, worktreePath, branch, resolvedPath, lineNumber);
  };

  if (isHomeScope) {
    // Remote absolute files need a host-aware caller; never interpret them as
    // local files on the client. Project remote behavior remains unchanged.
    return project.remoteServerId && !onOpenProjectRelativePath ? {} : { openProjectRelativePath };
  }

  return {
    openProjectRelativePath,
    projectLocation: targetContext.projectLocation,
    projectRootNames,
    revealProjectFolderInTree: (path) => {
      const normalized = normalizeChatProjectPath(path, targetContext.projectLocation);
      if (onRevealProjectFolderInTree) {
        onRevealProjectFolderInTree(normalized);
        return;
      }
      const fileEditor = useFileEditorStore.getState();
      if (!activateFileEditorContext(targetContext)) return;
      if (fileEditor.overlayMode !== "fullscreen") fileEditor.setOverlayMode("modal");
      useProjectTreeStore.getState().expandMany(collectPathAncestors(normalized));
    },
    ...(canShowProjectEntryInExplorer === false
      ? {}
      : {
          showProjectEntryInExplorer: (path: string) => {
            void readBridge().revealProjectEntry({
              projectLocation: targetContext.projectLocation,
              path: normalizeChatProjectPath(path, targetContext.projectLocation),
            });
          },
        }),
  };
}

/**
 * Absolute Home references already identify the file. Do not relativize them
 * against Home: that can change casing on case-sensitive filesystems. POSIX
 * filenames may also contain literal backslashes and trailing spaces.
 */
function resolveHomeFilePath(rawPath: string, location: ProjectLocation): string {
  let path = rawPath;
  if (/^file:\/\//i.test(path)) {
    const url = new URL(path);
    path = decodeURIComponent(url.pathname);
    if (url.hostname) path = `//${url.hostname}${path}`;
    else if (/^\/[A-Za-z]:[\\/]/.test(path)) path = path.slice(1);
  }

  // Forward separators let the editor recognize native Windows and UNC
  // absolute paths without changing the network host or any filename.
  if (/^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\")) {
    return path.replace(/\\/g, "/");
  }
  if (path.startsWith("/")) return location.kind === "windows" ? path.replace(/\\/g, "/") : path;
  return resolveAbsolutePath(location, path);
}

/** Include the root and each ancestor when revealing a project folder. */
function collectPathAncestors(path: string): string[] {
  const segments = path.split("/").filter(Boolean);
  const ancestors: string[] = [""];
  for (let i = 0; i < segments.length; i++) {
    ancestors.push(segments.slice(0, i + 1).join("/"));
  }
  return ancestors;
}

/** Resolve bare project basenames through the index; explicit paths skip it. */
async function resolveBareBasename(
  path: string,
  projectLocation: ProjectLocation,
  rootNames: ReadonlySet<string> | undefined,
): Promise<string> {
  const hasSeparator = path.includes("/") || path.includes("\\");
  const isAbsolute = path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);
  if (hasSeparator || isAbsolute || rootNames?.has(path)) return path;
  const result = await readBridge().searchProjectFiles({ projectLocation, query: path, limit: 5 });
  const exact = result.entries.find(
    (entry) => entry.type === "file" && entry.name.toLowerCase() === path.toLowerCase(),
  );
  if (exact) return exact.path;
  throw new Error(`File not found: ${path}`);
}
