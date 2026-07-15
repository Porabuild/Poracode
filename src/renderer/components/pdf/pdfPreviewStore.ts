export interface PdfPreviewState {
  url: string;
  fileName: string;
  nonce: number;
}

let previewState: PdfPreviewState | null = null;
let previewNonce = 0;
const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) listener();
}

export function subscribePdfPreview(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPdfPreviewSnapshot(): PdfPreviewState | null {
  return previewState;
}

export function openPdfPreview(url: string, fileName: string): void {
  previewState = { url, fileName, nonce: ++previewNonce };
  emitChange();
}

export function closePdfPreview(): void {
  if (!previewState) return;
  previewState = null;
  emitChange();
}
