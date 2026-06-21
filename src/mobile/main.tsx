import { createRoot, type Root } from "react-dom/client";
import "@/renderer/styles.css";
import "./styles.css";
import {
  createRendererCrashReport,
  RendererCrashScreen,
  RendererErrorBoundary,
  type RendererCrashKind,
  type RendererCrashReport,
} from "@/renderer/RendererCrashScreen";
import { isIgnorableRejection, isIgnorableWindowError } from "@/renderer/rendererGlobalErrors";

// The PWA had no error boundary: any throw during boot or first render left the
// dark body with an empty #root — a silent black screen, with no way to tell
// what failed (notably when launched from the iOS home screen / standalone,
// which renders differently from a Safari tab). Mirror the desktop renderer's
// crash handling so a failure shows a readable, copyable diagnostic instead.

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found.");
}

let reactRoot: Root | null = null;
let renderingCrashScreen = false;
// Global window handlers only swap in the crash screen *before* the app has
// rendered (the black-screen case). Once it is up, a stray async rejection must
// not replace a working app — render-phase errors are still caught by the
// boundary and createRoot below.
let appRendered = false;

function renderCrashScreen(report: RendererCrashReport): void {
  if (renderingCrashScreen) return;
  renderingCrashScreen = true;
  console.error(`[lightcode][mobile:${report.kind}]`, report);
  try {
    reactRoot?.render(<RendererCrashScreen report={report} />);
  } finally {
    renderingCrashScreen = false;
  }
}

function buildSource(event: ErrorEvent): string | undefined {
  if (!event.filename) return undefined;
  const suffix =
    event.lineno > 0 ? `:${event.lineno}${event.colno > 0 ? `:${event.colno}` : ""}` : "";
  return `${event.filename}${suffix}`;
}

function showCrash(kind: RendererCrashKind, error: unknown, source?: string): void {
  renderCrashScreen(createRendererCrashReport({ kind, error, ...(source ? { source } : {}) }));
}

window.addEventListener("error", (event) => {
  if (!(event instanceof ErrorEvent)) return;
  if (isIgnorableWindowError(event)) {
    event.preventDefault();
    return;
  }
  if (appRendered) {
    console.error("[lightcode][mobile:uncaught]", event.error ?? event.message);
    return;
  }
  showCrash("uncaught", event.error ?? event.message, buildSource(event));
});

window.addEventListener("unhandledrejection", (event) => {
  if (isIgnorableRejection(event.reason)) {
    event.preventDefault();
    return;
  }
  if (appRendered) {
    console.error("[lightcode][mobile:unhandled-rejection]", event.reason);
    return;
  }
  showCrash("unhandled-rejection", event.reason);
});

reactRoot = createRoot(root, {
  onUncaughtError(error, errorInfo) {
    renderCrashScreen(
      createRendererCrashReport({
        kind: "react",
        error,
        ...(errorInfo.componentStack?.trim()
          ? { componentStack: errorInfo.componentStack.trim() }
          : {}),
      }),
    );
  },
});

void import("./bootstrapApp")
  .then(({ MobileApp, registerServiceWorker }) => {
    reactRoot?.render(
      <RendererErrorBoundary>
        <MobileApp />
      </RendererErrorBoundary>,
    );
    appRendered = true;
    registerServiceWorker();
  })
  .catch((error: unknown) => {
    showCrash("bootstrap", error);
  });
