import { useEffect, useRef, useState } from "react";
import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { AbsoluteFileReadStatus, ProjectLocation } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { screenStateTransition } from "../navHelpers";

export interface OpenFileState {
  readonly path: string;
  readonly status: AbsoluteFileReadStatus;
  readonly modifiedAtMs: number;
  readonly content: string;
  readonly savedContent: string;
  readonly isLoading: boolean;
  readonly readOnly: boolean;
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

function toastError(error: unknown): void {
  toast.danger(error instanceof Error ? error.message : String(error));
}

function buildOpenFile(
  path: string,
  result: {
    readonly status: AbsoluteFileReadStatus;
    readonly modifiedAtMs?: number;
    readonly content?: string;
  },
  readOnly: boolean,
): OpenFileState {
  const content = result.status === "ready" ? (result.content ?? "") : "";
  return {
    path,
    status: result.status,
    modifiedAtMs: result.modifiedAtMs ?? 0,
    content,
    savedContent: content,
    isLoading: false,
    readOnly,
  };
}

export interface OpenFileApi {
  readonly openFile: OpenFileState | null;
  readonly isDirty: boolean;
  readonly saving: boolean;
  /** Returns false only when the discard prompt was declined (nothing opened);
   * true once the open was attempted (so callers can tell a cancel apart from a
   * completed open). */
  readonly openPath: (path: string) => Promise<boolean>;
  readonly saveOpenFile: () => Promise<void>;
  readonly closeEditor: () => void;
  readonly setOpenFileContent: (path: string, content: string) => void;
}

/**
 * The Files tab's open-file state machine: the file currently open in the
 * inline editor, its dirty/saved content, save-in-flight state, and the
 * route-provided initial file/folder target. `revealFolder` is the sibling
 * file-tree hook's function, threaded through so the initial-target effect
 * can still jump to a folder target without the hooks needing a fixed
 * construction order.
 */
export function useOpenFile(props: {
  readonly projectLocation: ProjectLocation;
  readonly rootKey: string;
  readonly initialFilePath?: string | undefined;
  readonly initialFolderPath?: string | undefined;
  readonly initialLineNumber?: number | undefined;
  readonly initialOpenKey?: string | undefined;
  readonly onImmersiveChange?: (immersive: boolean) => void;
  readonly revealFolder: (path: string) => Promise<void>;
}): OpenFileApi {
  const { t } = useLingui();
  const [openFile, setOpenFile] = useState<OpenFileState | null>(null);
  const [saving, setSaving] = useState(false);
  const appliedInitialTargetRef = useRef<string | null>(null);

  const isDirty =
    openFile?.status === "ready" &&
    !openFile.readOnly &&
    !openFile.isLoading &&
    openFile.content !== openFile.savedContent;

  function confirmDiscard(): boolean {
    if (!openFile || !isDirty) return true;
    const path = openFile.path;
    return window.confirm(t`Discard unsaved changes in ${path}?`);
  }

  function closeEditor() {
    if (!confirmDiscard()) return;
    screenStateTransition("pop", () => setOpenFile(null));
  }

  /** Returns false only when the discard prompt was declined (nothing opened);
   * true once the open was attempted (so callers can tell a cancel apart from a
   * completed open). */
  async function openPath(path: string): Promise<boolean> {
    if (!confirmDiscard()) return false;
    const absolute = isAbsolutePath(path);
    setOpenFile({
      path,
      status: "ready",
      modifiedAtMs: 0,
      content: "",
      savedContent: "",
      isLoading: true,
      readOnly: absolute,
    });
    try {
      if (absolute) {
        const result = await readBridge().readAbsoluteFile({
          projectLocation: props.projectLocation,
          absolutePath: path,
        });
        // Guard against an out-of-order read: only apply if this path is still
        // the one being opened (a newer openPath may have superseded it).
        setOpenFile((current) =>
          current?.path === path ? buildOpenFile(path, result, true) : current,
        );
        return true;
      }

      const result = await readBridge().readProjectFile({
        projectLocation: props.projectLocation,
        path,
      });
      setOpenFile((current) =>
        current?.path === path ? buildOpenFile(result.path, result, false) : current,
      );
    } catch (error) {
      setOpenFile((current) => (current?.path === path ? null : current));
      toast.danger(error instanceof Error ? error.message : t`Unable to open file`);
    }
    return true;
  }

  async function saveOpenFile() {
    if (!openFile || openFile.status !== "ready" || openFile.readOnly || !isDirty || saving) {
      return;
    }
    // Capture the exact content we write; keystrokes typed during the async
    // round-trip must stay dirty (and reach disk on the next save), not be
    // silently marked persisted.
    const writtenContent = openFile.content;
    setSaving(true);
    try {
      const result = await readBridge().writeProjectFile({
        projectLocation: props.projectLocation,
        path: openFile.path,
        content: writtenContent,
        baseModifiedAtMs: openFile.modifiedAtMs,
      });
      setOpenFile((current) =>
        current?.path === openFile.path
          ? {
              ...current,
              modifiedAtMs: result.modifiedAtMs,
              savedContent: writtenContent,
            }
          : current,
      );
    } catch (error) {
      toastError(error);
    } finally {
      setSaving(false);
    }
  }

  function setOpenFileContent(path: string, content: string) {
    setOpenFile((current) => (current?.path === path ? { ...current, content } : current));
  }

  useEffect(() => {
    setOpenFile(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rootKey captures the target project/worktree identity
  }, [props.rootKey]);

  useEffect(() => {
    const targetKey = props.initialFilePath
      ? `${props.rootKey}:file:${props.initialFilePath}:${props.initialLineNumber ?? ""}:${
          props.initialOpenKey ?? ""
        }`
      : props.initialFolderPath
        ? `${props.rootKey}:folder:${props.initialFolderPath}`
        : null;
    if (!targetKey || appliedInitialTargetRef.current === targetKey) return;
    // Mark consumed up-front so a re-render mid-open doesn't re-trigger, but
    // un-consume if the open was cancelled at the discard prompt, so the
    // requested file still opens after the user saves/discards.
    appliedInitialTargetRef.current = targetKey;
    if (props.initialFilePath) {
      void openPath(props.initialFilePath).then((opened) => {
        if (!opened && appliedInitialTargetRef.current === targetKey) {
          appliedInitialTargetRef.current = null;
        }
      });
    } else if (props.initialFolderPath) {
      void props.revealFolder(props.initialFolderPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open the route-provided path once per target key
  }, [
    props.rootKey,
    props.initialFilePath,
    props.initialFolderPath,
    props.initialLineNumber,
    props.initialOpenKey,
  ]);

  useEffect(() => {
    props.onImmersiveChange?.(openFile !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the open/closed transition matters
  }, [openFile?.path ?? null]);

  return {
    openFile,
    isDirty,
    saving,
    openPath,
    saveOpenFile,
    closeEditor,
    setOpenFileContent,
  };
}
