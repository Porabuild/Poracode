import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Maximize2, X, ZoomIn, ZoomOut } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { loadPdfDocument } from "./pdfEngine";

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const SCALE_STEP = 0.25;

type DocumentState =
  | { status: "loading"; document: null }
  | { status: "ready"; document: PDFDocumentProxy }
  | { status: "error"; document: null };

function decodeBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function PdfViewer(props: {
  fileName: string;
  url?: string;
  dataBase64?: string;
  onClose?: () => void;
}) {
  const { t } = useLingui();
  const [documentState, setDocumentState] = useState<DocumentState>({
    status: "loading",
    document: null,
  });
  const [pageNumber, setPageNumber] = useState(1);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [pageWidth, setPageWidth] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [manualScale, setManualScale] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let loadedDocument: PDFDocumentProxy | null = null;
    const abortController = new AbortController();
    setDocumentState({ status: "loading", document: null });
    setPageNumber(1);
    setPage(null);
    setFitWidth(true);

    void (async () => {
      try {
        let bytes: Uint8Array;
        if (props.dataBase64 !== undefined) {
          bytes = decodeBase64(props.dataBase64);
        } else if (props.url !== undefined) {
          const response = await fetch(props.url, { signal: abortController.signal });
          if (!response.ok) throw new Error(`Failed to load PDF (${response.status})`);
          bytes = new Uint8Array(await response.arrayBuffer());
        } else {
          throw new Error("Missing PDF source");
        }
        if (cancelled) return;
        loadedDocument = await loadPdfDocument(bytes);
        if (cancelled) {
          void loadedDocument.destroy();
          return;
        }
        setDocumentState({ status: "ready", document: loadedDocument });
      } catch {
        if (!cancelled && !abortController.signal.aborted) {
          setDocumentState({ status: "error", document: null });
        }
      }
    })();

    return () => {
      cancelled = true;
      abortController.abort();
      if (loadedDocument) void loadedDocument.destroy();
    };
  }, [props.dataBase64, props.url]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const updateWidth = () => setContainerWidth(element.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (documentState.status !== "ready") return;
    let cancelled = false;
    let loadedPage: PDFPageProxy | null = null;
    setPage(null);
    void documentState.document.getPage(pageNumber).then((nextPage) => {
      if (cancelled) {
        nextPage.cleanup();
        return;
      }
      loadedPage = nextPage;
      const viewport = nextPage.getViewport({ scale: 1 });
      setPageWidth(viewport.width);
      setPage(nextPage);
    });
    return () => {
      cancelled = true;
      loadedPage?.cleanup();
    };
  }, [documentState, pageNumber]);

  const fittedScale =
    containerWidth > 0 && pageWidth > 0 ? clampScale((containerWidth - 48) / pageWidth) : 1;
  const scale = fitWidth ? fittedScale : manualScale;
  const numPages = documentState.status === "ready" ? documentState.document.numPages : 0;

  function changeScale(delta: number) {
    setManualScale(clampScale(scale + delta));
    setFitWidth(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--content-background)]">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-[color:var(--border)] px-2">
        <span className="min-w-0 flex-1 truncate px-1 text-xs font-medium text-foreground">
          {props.fileName}
        </span>
        <button
          type="button"
          className="flex size-7 items-center justify-center rounded text-muted transition-colors hover:bg-[var(--row-hover)] hover:text-foreground disabled:opacity-35"
          aria-label={t`Previous page`}
          disabled={pageNumber <= 1}
          onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <span className="min-w-14 text-center text-xs tabular-nums text-muted">
          {numPages > 0 ? `${pageNumber} / ${numPages}` : "—"}
        </span>
        <button
          type="button"
          className="flex size-7 items-center justify-center rounded text-muted transition-colors hover:bg-[var(--row-hover)] hover:text-foreground disabled:opacity-35"
          aria-label={t`Next page`}
          disabled={pageNumber >= numPages}
          onClick={() => setPageNumber((current) => Math.min(numPages, current + 1))}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
        <div className="mx-1 h-4 w-px bg-[var(--border)]" aria-hidden="true" />
        <button
          type="button"
          className="flex size-7 items-center justify-center rounded text-muted transition-colors hover:bg-[var(--row-hover)] hover:text-foreground disabled:opacity-35"
          aria-label={t`Zoom out`}
          disabled={scale <= MIN_SCALE}
          onClick={() => changeScale(-SCALE_STEP)}
        >
          <ZoomOut className="size-3.5" aria-hidden="true" />
        </button>
        <span className="min-w-10 text-center text-[11px] tabular-nums text-muted">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          className="flex size-7 items-center justify-center rounded text-muted transition-colors hover:bg-[var(--row-hover)] hover:text-foreground disabled:opacity-35"
          aria-label={t`Zoom in`}
          disabled={scale >= MAX_SCALE}
          onClick={() => changeScale(SCALE_STEP)}
        >
          <ZoomIn className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`flex size-7 items-center justify-center rounded transition-colors hover:bg-[var(--row-hover)] hover:text-foreground ${fitWidth ? "text-foreground" : "text-muted"}`}
          aria-label={t`Fit width`}
          onClick={() => setFitWidth(true)}
        >
          <Maximize2 className="size-3.5" aria-hidden="true" />
        </button>
        {props.onClose ? (
          <button
            type="button"
            className="ml-1 flex size-7 items-center justify-center rounded text-muted transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
            aria-label={t`Close`}
            onClick={props.onClose}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div ref={viewportRef} className="min-h-0 flex-1 overflow-auto bg-black/10 p-6">
        {documentState.status === "error" ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">
            {t`Could not open this PDF.`}
          </div>
        ) : documentState.status === "loading" || !page ? (
          <div
            className="flex h-full items-center justify-center"
            role="status"
            aria-label={t`Loading PDF…`}
          >
            <Loader2 className="size-5 animate-spin text-muted" aria-hidden="true" />
          </div>
        ) : (
          <PdfCanvasPage
            page={page}
            scale={scale}
            label={`${props.fileName} — ${pageNumber}`}
            errorLabel={t`Could not open this PDF.`}
          />
        )}
      </div>
    </div>
  );
}

function PdfCanvasPage(props: {
  page: PDFPageProxy;
  scale: number;
  label: string;
  errorLabel: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    const viewport = props.page.getViewport({ scale: props.scale });
    const renderViewport = props.page.getViewport({ scale: props.scale * pixelRatio });
    canvas.width = Math.floor(renderViewport.width);
    canvas.height = Math.floor(renderViewport.height);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    setError(false);
    const renderTask = props.page.render({ canvas, viewport: renderViewport });
    void renderTask.promise.catch((cause: unknown) => {
      if (!(cause instanceof Error && cause.name === "RenderingCancelledException")) {
        setError(true);
      }
    });
    return () => renderTask.cancel();
  }, [props.page, props.scale]);

  return (
    <div className="flex min-h-full min-w-full items-start justify-center">
      <div className="relative">
        <canvas
          ref={canvasRef}
          className={`bg-white shadow-xl ${error ? "opacity-0" : ""}`}
          role="img"
          aria-label={props.label}
        />
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted">
            {props.errorLabel}
          </div>
        ) : null}
      </div>
    </div>
  );
}
