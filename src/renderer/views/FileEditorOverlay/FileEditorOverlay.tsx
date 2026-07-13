import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft } from "lucide-react";
import { PageLayout } from "@/renderer/components/layout/PageLayout";
import {
  overlaySidebarColumnClass,
  sidebarFooterNavClass,
} from "@/renderer/components/layout/sidebarChrome";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { ProjectTreeView } from "@/renderer/views/FileEditorOverlay/parts/ProjectTreeView/ProjectTreeView";
import { FileEditorPane } from "./parts/FileEditorPane/FileEditorPane";
import { SidebarButton } from "@/renderer/components/common";

export function FileEditorOverlay(props: { onClose: () => void }) {
  const { t } = useLingui();
  const rootContext = useFileEditorStore((state) => state.rootContext);
  const buffers = useFileEditorStore((state) => state.buffers);
  const openFile = useFileEditorStore((state) => state.openFile);
  const pinTab = useFileEditorStore((state) => state.pinTab);

  if (!rootContext) return null;

  const hasDirtyBuffers = Object.values(buffers).some(
    (buffer) => buffer.status === "ready" && buffer.isDirty,
  );
  const isRemoteRoot = rootContext.remoteServerId !== undefined;

  function requestClose() {
    if (hasDirtyBuffers && !window.confirm(t`Discard unsaved editor changes?`)) {
      return;
    }
    props.onClose();
  }

  return (
    <PageLayout
      title={t`Editor`}
      forceSidebarExpanded
      contentHeaderChildren={
        <div className="poracode-overlay-header__controls flex min-w-0 items-center">
          <span className="min-w-0 max-w-[min(200px,30vw)] truncate font-mono text-[13px] font-medium leading-none tracking-tight text-muted">
            {rootContext.rootLabel}
          </span>
        </div>
      }
      sidebar={
        <div className={overlaySidebarColumnClass}>
          {isRemoteRoot ? null : (
            <div className="min-h-0 flex-1 overflow-hidden">
              <ProjectTreeView
                rootContext={rootContext}
                onSelectFile={(path) => {
                  void openFile(path, "fullscreen", true).catch((error) =>
                    toast.danger(error instanceof Error ? error.message : String(error)),
                  );
                }}
                onPinFile={pinTab}
              />
            </div>
          )}
          <div className={sidebarFooterNavClass}>
            <SidebarButton
              icon={<ArrowLeft className="size-4" />}
              label={t`Return to app`}
              onPress={requestClose}
            />
          </div>
        </div>
      }
      content={<FileEditorPane showTabs />}
    />
  );
}
