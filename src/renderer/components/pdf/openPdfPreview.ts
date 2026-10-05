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
  const hostPath = resolveHostFilePath(absolutePath, projectLocation);
  void readBridge()
    .browserCreateTab({ url: toFileUrl(hostPath), activate: true, reveal: true })
    .catch(() => {});
}
