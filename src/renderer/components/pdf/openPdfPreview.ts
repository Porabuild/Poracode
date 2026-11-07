import { hasElectronHostBridge } from "@/renderer/clientRuntime";
import { isClientDraftAsset } from "@/renderer/state/composerDrafts/clientDraftDatabase";
import {
  readDraftAsset,
  type DraftAssetReference,
} from "@/renderer/state/composerDrafts/readDraftAsset";
import { readBridge } from "@/renderer/bridge";
import type { ProjectLocation } from "@/shared/contracts";
import { fileNameFromPath, toFileUrl } from "@/shared/promptContent";
import { resolveHostFilePath } from "@/renderer/utils/resolveHostFilePath";

/**
 * Open a local PDF in the in-app browser (Chromium PDF viewer).
 * Uses `browserCreateTab({ reveal: true })` so presentation matches link opens
 * (right panel vs overlay; floats above the file editor when needed).
 */
export function openPdfPreview(
  file: string | DraftAssetReference,
  projectLocation?: ProjectLocation,
): void {
  const absolutePath = typeof file === "string" ? file : file.path;
  if (isClientDraftAsset(absolutePath)) {
    const desktop = hasElectronHostBridge();
    // Reserve the context during the click; byte recovery can outlast user activation.
    const preview = desktop ? undefined : window.open("about:blank", "_blank");
    if (!desktop && !preview) return;
    if (preview) preview.opener = null;
    const reference =
      typeof file === "string"
        ? { path: file, name: fileNameFromPath(file), mimeType: "application/pdf" }
        : file;
    void readDraftAsset(reference)
      .then(async ({ blob }) => {
        if (desktop) {
          await readBridge().browserPreviewClientPdf({
            data: new Uint8Array(await blob.arrayBuffer()),
          });
        } else if (preview) displayBrowserPdf(preview, blob);
      })
      .catch((error: unknown) => {
        preview?.close();
        console.error("[poracode] client PDF preview failed", error);
      });
    return;
  }
  const hostPath = resolveHostFilePath(absolutePath, projectLocation);
  void readBridge()
    .browserCreateTab({ url: toFileUrl(hostPath), activate: true, reveal: true })
    .catch(() => {});
}

function displayBrowserPdf(preview: Window, blob: Blob) {
  if (preview.closed) return;
  const url = URL.createObjectURL(blob);
  let timer: number | undefined;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    if (timer !== undefined) window.clearInterval(timer);
    window.removeEventListener("pagehide", release);
    URL.revokeObjectURL(url);
  };
  try {
    preview.location.replace(url);
    timer = window.setInterval(() => {
      if (preview.closed) release();
    }, 1000);
    window.addEventListener("pagehide", release, { once: true });
  } catch (error) {
    release();
    throw error;
  }
}
