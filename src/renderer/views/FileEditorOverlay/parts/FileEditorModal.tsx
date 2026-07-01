import { Button, Modal, toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Maximize2, X } from "lucide-react";
import { overlaySidebarColumnClass } from "@/renderer/components/layout/sidebarChrome";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { FileEditorPane } from "./FileEditorPane/FileEditorPane";
import { ProjectTreeView } from "./ProjectTreeView/ProjectTreeView";

export function FileEditorModal() {
  const { t } = useLingui();
  const rootContext = useFileEditorStore((state) => state.rootContext);
  const overlayMode = useFileEditorStore((state) => state.overlayMode);
  const activePath = useFileEditorStore((state) => state.activePath);
  const buffers = useFileEditorStore((state) => state.buffers);
  const setOverlayMode = useFileEditorStore((state) => state.setOverlayMode);
  const openFile = useFileEditorStore((state) => state.openFile);
  const pinTab = useFileEditorStore((state) => state.pinTab);

  const isOpen = rootContext !== null && overlayMode === "modal";
  const hasDirtyBuffers = Object.values(buffers).some(
    (buffer) => buffer.status === "ready" && buffer.isDirty,
  );
  const isRemoteRoot = rootContext?.remoteServerId !== undefined;

  function requestClose() {
    if (hasDirtyBuffers && !window.confirm(t`Discard unsaved editor changes?`)) {
      return;
    }
    setOverlayMode(null);
  }

  if (!rootContext) return null;

  return (
    <Modal>
      <Modal.Backdrop
        isOpen={isOpen}
        isDismissable
        onOpenChange={(nextOpen) => {
          if (!nextOpen) requestClose();
        }}
      >
        <Modal.Container
          placement="center"
          scroll="inside"
          size="cover"
          className="items-center px-6 py-6"
        >
          <Modal.Dialog className="h-[min(82vh,860px)] w-[min(1180px,94vw)] overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[var(--content-background)]">
            <Modal.Header className="border-b border-[color:var(--border)]">
              <div className="min-w-0 flex-1">
                <Modal.Heading>{rootContext.rootLabel}</Modal.Heading>
                <p className="truncate text-xs text-muted">
                  {activePath ?? t`Select a file from the tree`}
                </p>
              </div>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                onPress={() => setOverlayMode("fullscreen")}
              >
                <Maximize2 className="size-4" />
              </Button>
              <Button isIconOnly size="sm" variant="ghost" onPress={requestClose}>
                <X className="size-4" />
              </Button>
            </Modal.Header>
            <Modal.Body className="min-h-0 p-0">
              <div
                className={`grid h-full min-h-0 ${
                  isRemoteRoot ? "grid-cols-[minmax(0,1fr)]" : "grid-cols-[320px_minmax(0,1fr)]"
                }`}
              >
                {isRemoteRoot ? null : (
                  <div className="min-h-0 border-r border-[color:var(--border)]">
                    <div className={overlaySidebarColumnClass}>
                      <ProjectTreeView
                        rootContext={rootContext}
                        onSelectFile={(path) => {
                          void openFile(path, "modal", true).catch((error) =>
                            toast.danger(error instanceof Error ? error.message : String(error)),
                          );
                        }}
                        onPinFile={pinTab}
                      />
                    </div>
                  </div>
                )}
                <FileEditorPane
                  showTabs={false}
                  onOpenFullscreen={() => setOverlayMode("fullscreen")}
                />
              </div>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
