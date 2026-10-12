import { toast } from "@heroui/react";
import { overlaySidebarColumnClass } from "@/renderer/components/layout/sidebarChrome";
import {
  useFileEditorStore,
  type FileEditorOverlayMode,
  type FileEditorRootContext,
} from "@/renderer/state/fileEditorStore";
import { showFilesPanel } from "@/renderer/actions/panelActions";
import { ProjectTreeView } from "@/renderer/views/FileEditorOverlay/parts/ProjectTreeView/ProjectTreeView";

export function ProjectFilesPanel(props: {
  rootContext: FileEditorRootContext;
  compact?: boolean;
  compactActionsVisible?: boolean;
}) {
  const overlayMode = useFileEditorStore((state) => state.overlayMode);
  const pinTab = useFileEditorStore((state) => state.pinTab);

  // The fullscreen editor owns the tree while it covers this panel. Keeping
  // both mounted duplicates loads and lets a retained panel show another root.
  if (overlayMode === "fullscreen") return null;

  function handleSelectFile(path: string) {
    const nextMode: FileEditorOverlayMode = props.compact ? "fullscreen" : "modal";
    showFilesPanel(props.rootContext.projectId, props.rootContext.worktreePath);
    void useFileEditorStore
      .getState()
      .openFile(path, nextMode, true)
      .catch((error) => toast.danger(error instanceof Error ? error.message : String(error)));
  }

  return (
    <div
      className={`${overlaySidebarColumnClass} ${props.compact ? "m-mobile-workspace-files" : ""}`}
    >
      <ProjectTreeView
        rootContext={props.rootContext}
        onSelectFile={handleSelectFile}
        onPinFile={pinTab}
        {...(props.compact ? { compact: true } : {})}
        {...(props.compactActionsVisible ? { compactActionsVisible: true } : {})}
      />
    </div>
  );
}
