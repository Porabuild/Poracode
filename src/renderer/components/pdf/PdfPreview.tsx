import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useLingui } from "@lingui/react/macro";
import { PdfViewer } from "./PdfViewer";
import {
  closePdfPreview,
  getPdfPreviewSnapshot,
  subscribePdfPreview,
  type PdfPreviewState,
} from "./pdfPreviewStore";

export function PdfPreviewHost() {
  const state = useSyncExternalStore(
    subscribePdfPreview,
    getPdfPreviewSnapshot,
    getPdfPreviewSnapshot,
  );
  useEffect(() => closePdfPreview, []);
  if (!state) return null;
  return <PdfPreviewView key={state.nonce} state={state} />;
}

function PdfPreviewView(props: { state: PdfPreviewState }) {
  const { t } = useLingui();
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closePdfPreview();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={t`Preview ${props.state.fileName}`}
    >
      <button
        type="button"
        className="absolute inset-0"
        aria-label={t`Close`}
        onClick={closePdfPreview}
      />
      <div className="relative h-[min(90vh,64rem)] w-[min(92vw,80rem)] overflow-hidden rounded-xl border border-white/15 bg-[var(--content-background)] shadow-2xl">
        <PdfViewer
          fileName={props.state.fileName}
          url={props.state.url}
          onClose={closePdfPreview}
        />
      </div>
    </div>,
    document.body,
  );
}
