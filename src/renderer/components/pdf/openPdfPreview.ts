import { hasElectronHostBridge } from "@/renderer/clientRuntime";
import {
  isClientDraftAsset,
  readClientDraftAsset,
} from "@/renderer/state/composerDrafts/clientDraftDatabase";
import { readBridge } from "@/renderer/bridge";
import type { ProjectLocation } from "@/shared/contracts";
import { toFileUrl } from "@/shared/promptContent";
import { resolveHostFilePath } from "@/renderer/utils/resolveHostFilePath";

/**
 * Open a local PDF in the in-app browser (Chromium PDF viewer).
 * Uses `browserCreateTab({ reveal: true })` so presentation matches link opens
 * (right panel vs overlay; floats above the file editor when needed).
 */
export function openPdfPreview(absolutePath: string, projectLocation?: ProjectLocation): void {
  if (isClientDraftAsset(absolutePath)) {
    void readClientDraftAsset(absolutePath)
      .then(async ({ blob }) => {
        if (hasElectronHostBridge()) {
          await readBridge().browserPreviewClientPdf({
            data: new Uint8Array(await blob.arrayBuffer()),
          });
        } else {
          const url = URL.createObjectURL(blob);
          window.open(url, "_blank", "noopener");
          window.addEventListener("pagehide", () => URL.revokeObjectURL(url), { once: true });
        }
      })
      .catch((error: unknown) => console.error("[poracode] client PDF preview failed", error));
    return;
  }
  const hostPath = resolveHostFilePath(absolutePath, projectLocation);
  void readBridge()
    .browserCreateTab({ url: toFileUrl(hostPath), activate: true, reveal: true })
    .catch(() => {});
}
