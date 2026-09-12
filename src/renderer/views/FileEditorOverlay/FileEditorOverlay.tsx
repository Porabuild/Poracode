import { useState } from "react";
import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft } from "lucide-react";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { MobilePageBottomBar } from "@/renderer/components/layout/MobilePageBottomActions";
import { PageLayout } from "@/renderer/components/layout/PageLayout";
import {
  overlaySidebarColumnClass,
  sidebarFooterNavClass,
} from "@/renderer/components/layout/sidebarChrome";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { ProjectTreeView } from "@/renderer/views/FileEditorOverlay/parts/ProjectTreeView/ProjectTreeView";
import { getBasename } from "@/shared/pathUtils";
import { FileEditorPane } from "./parts/FileEditorPane/FileEditorPane";
import { SidebarButton } from "@/renderer/components/common";

export function FileEditorOverlay(props: { onClose: () => void }) {
  const { t } = useLingui();
  const compactLayout = useCompactLayout();
  const rootContext = useFileEditorStore((state) => state.rootContext);
  const buffers = useFileEditorStore((state) => state.buffers);
  const activePath = useFileEditorStore((state) => state.activePath);
  const openFile = useFileEditorStore((state) => state.openFile);
  const pinTab = useFileEditorStore((state) => state.pinTab);
  const [compactPage, setCompactPage] = useState<"tree" | "editor">(activePath ? "editor" : "tree");

  if (!rootContext) return null;

  const hasDirtyBuffers = Object.values(buffers).some(
    (buffer) => buffer.status === "ready" && buffer.isDirty,
  );
  const isRemoteRoot = rootContext.remoteServerId !== undefined;
  const showTree = !isRemoteRoot;

  function requestClose() {
    if (hasDirtyBuffers && !window.confirm(t`Discard unsaved editor changes?`)) {
      return;
    }
    props.onClose();
  }

  function compactBack() {
    if (compactPage === "editor" && showTree) {
      setCompactPage("tree");
      return;
    }
    requestClose();
  }

  function selectFile(path: string) {
    void openFile(path, "fullscreen", true).catch((error) =>
      toast.danger(error instanceof Error ? error.message : String(error)),
    );
    if (compactLayout) setCompactPage("editor");
  }

  const tree = (
    <div className={overlaySidebarColumnClass}>
      {showTree ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <ProjectTreeView rootContext={rootContext} onSelectFile={selectFile} onPinFile={pinTab} />
        </div>
      ) : null}
      {compactLayout ? null : (
        <div className={sidebarFooterNavClass}>
          <SidebarButton
            icon={<ArrowLeft className="size-4" />}
            label={t`Return to app`}
            onPress={requestClose}
          />
        </div>
      )}
    </div>
  );
  const editor = compactLayout ? (
    <div className="m-mobile-file-editor relative flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        <FileEditorPane showTabs={false} mobileControls />
      </div>
      <MobilePageBottomBar className="m-mobile-file-editor__actions mx-3">
        <span aria-hidden />
      </MobilePageBottomBar>
    </div>
  ) : (
    <FileEditorPane showTabs />
  );

  return (
    <PageLayout
      title={t`Editor`}
      compactTitle={compactPage === "editor" && activePath ? getBasename(activePath) : t`Editor`}
      compactBackLabel={compactPage === "tree" || !showTree ? t`Return to app` : t`Back`}
      onCompactBack={compactBack}
      mobileNavigation
      forceSidebarExpanded
      contentHeaderChildren={
        <div className="poracode-overlay-header__controls flex min-w-0 items-center">
          <span className="min-w-0 max-w-[min(200px,30vw)] truncate font-mono text-[13px] font-medium leading-none tracking-tight text-muted">
            {rootContext.rootLabel}
          </span>
        </div>
      }
      sidebar={compactLayout ? null : tree}
      content={compactLayout && compactPage === "tree" && showTree ? tree : editor}
    />
  );
}
