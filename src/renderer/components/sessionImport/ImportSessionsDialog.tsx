import { Modal } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Download } from "lucide-react";
import { useImportDialogStore } from "@/renderer/state/importDialogStore";
import { ImportSessionsPanel } from "./ImportSessionsPanel";

/**
 * The single import dialog, rendered once by the sidebar and opened from any
 * import button through {@link useImportDialogStore}. Wide, because the panel
 * carries four filters plus a list of file paths; a confirm-sized box would
 * wrap everything into a column.
 */
export function ImportSessionsDialog() {
  const { t } = useLingui();
  const { open, projectId, cwd, close } = useImportDialogStore();
  if (!open) return null;
  return (
    <Modal.Backdrop isOpen onOpenChange={(next) => !next && close()}>
      <Modal.Container size="lg" scroll="inside">
        <Modal.Dialog className="sm:max-w-[860px]">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Icon className="bg-default text-foreground">
              <Download className="size-5" />
            </Modal.Icon>
            <Modal.Heading>{t`Import session`}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="min-h-[420px] p-4">
            <ImportSessionsPanel
              // Keyed so reopening for another project reseeds the filters.
              key={`${projectId ?? ""}|${cwd ?? ""}`}
              {...(cwd ? { initialFolder: cwd } : {})}
              {...(projectId ? { initialProjectId: projectId } : {})}
            />
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
