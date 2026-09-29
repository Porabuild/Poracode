import { msg } from "@lingui/core/macro";
import { i18n } from "@/renderer/i18n/i18n";
import { hasDirtyEditorBuffers } from "@/renderer/state/fileEditorSelectors";
import { useFileEditorStore, type FileEditorRootContext } from "@/renderer/state/fileEditorStore";

export function isFileEditorContextActive(context: FileEditorRootContext): boolean {
  const current = useFileEditorStore.getState().rootContext;
  return (
    current?.projectId === context.projectId &&
    current?.worktreePath === context.worktreePath &&
    current?.remoteServerId === context.remoteServerId
  );
}

/** All user-driven context switches must protect unsaved buffers before resetting the editor. */
export function activateFileEditorContext(context: FileEditorRootContext): boolean {
  if (isFileEditorContextActive(context)) return true;
  if (hasDirtyEditorBuffers() && !window.confirm(i18n._(msg`Discard unsaved editor changes?`))) {
    return false;
  }
  useFileEditorStore.getState().setRootContext(context);
  return true;
}
