import { createRoot, type Root } from "react-dom/client";
import "./tailwind.css";
import "./uiAnimationActivity";
import { readBridge } from "./bridge";
import { captureRendererException, initializeRendererSentry } from "./diagnostics/sentry";
import { getAppName } from "@/shared/appName";
import {
  createRendererCrashReport,
  RendererCrashScreen,
  RendererErrorBoundary,
  type RendererCrashKind,
  type RendererCrashReport,
} from "./RendererCrashScreen";
import { isIgnorableRejection, isIgnorableWindowError } from "./rendererGlobalErrors";
import { bootstrapAppThemeFromCache } from "./theme/applyAppTheme";
import { bootstrapAppLocaleFromCache } from "./i18n/i18n";

function logRendererBootstrap(message: string): void {
  if (import.meta.env.DEV) performance.mark(`lightcode:${message}`);
  console.log(`[renderer-bootstrap] page +${Math.round(performance.now())}ms ${message}`);
}

logRendererBootstrap("main module evaluated");

if (import.meta.env.DEV) {
  const warn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    const head = args[0];
    if (
      typeof head === "string" &&
      (((head.startsWith("<Focusable>") || head.startsWith("<Pressable>")) &&
        ((head.includes("interactive ARIA role") &&
          (head.includes('Got "none"') || head.includes('Got "presentation"'))) ||
          head.includes("child must be focusable"))) ||
        head.startsWith("A PressResponder was rendered without a pressable child."))
    ) {
      return;
    }
    warn(...args);
  };
}

document.title = getAppName(readBridge().channel, import.meta.env.DEV);
initializeRendererSentry();

document.documentElement.dataset.platform =
  typeof window !== "undefined" && "lightcode" in window ? readBridge().platform : "unknown";
document.documentElement.dataset.windowKind = readBridge().windowKind;

// The translucent ("liquid glass") sidebar is applied by provider.tsx only once
// the main content is ready — the window stays opaque (the index.html boot
// background) through loading so it doesn't show a bare translucent window.

// Apply the cached appearance + theme before first paint so a non-default theme
// doesn't flash the base palette on launch.
bootstrapAppThemeFromCache();

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found.");
}

let reactRoot: Root | null = null;

function installDevBridgeAfterPaint(): void {
  if (!import.meta.env.DEV) return;
  const install = () => {
    void import("./devBridge").then(({ installDevBridge }) => installDevBridge());
  };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(install, { timeout: 5_000 });
  } else {
    window.setTimeout(install, 0);
  }
}
let renderingCrashScreen = false;

function reportRootError(
  kind: "caught" | "uncaught" | "recoverable",
  error: unknown,
  errorInfo: { componentStack?: string | undefined },
) {
  const componentStack = errorInfo.componentStack?.trim();
  const prefix = `[lightcode][react:${kind}]`;

  if (kind === "recoverable") {
    console.warn(prefix, error, componentStack ?? "");
    captureRendererException(error, { featureArea: "react" });
    return;
  }

  console.error(prefix, error, componentStack ?? "");
  captureRendererException(error, { featureArea: "react" });
}

function renderCrashScreen(report: RendererCrashReport): void {
  if (renderingCrashScreen) return;
  renderingCrashScreen = true;
  console.error(`[lightcode][renderer:${report.kind}]`, report);
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

function showCrash(
  kind: RendererCrashKind,
  error: unknown,
  source?: string,
  options: { capture?: boolean } = {},
): void {
  renderCrashScreen(
    createRendererCrashReport({
      kind,
      error,
      ...(source ? { source } : {}),
    }),
  );
  if (options.capture ?? true) {
    captureRendererException(error, { featureArea: "renderer" });
  }
}

// Capture phase so this runs before other window `error` listeners (e.g. Vite's
// dev overlay): for the benign "ResizeObserver loop … undelivered notifications"
// warning we stopImmediatePropagation so it never reaches the dev overlay, which
// would otherwise flood with it during panel resizes. Already harmless in prod.
window.addEventListener(
  "error",
  (event) => {
    if (!(event instanceof ErrorEvent)) return;
    if (isIgnorableWindowError(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    // Sentry's Electron renderer integration already captures global errors; this only swaps UI.
    showCrash("uncaught", event.error ?? event.message, buildSource(event), { capture: false });
  },
  { capture: true },
);

window.addEventListener("unhandledrejection", (event) => {
  if (isIgnorableRejection(event.reason)) {
    event.preventDefault();
    return;
  }
  // Sentry's Electron renderer integration already captures global rejections; this only swaps UI.
  showCrash("unhandled-rejection", event.reason, undefined, { capture: false });
});

reactRoot = createRoot(root, {
  onCaughtError(error, errorInfo) {
    reportRootError("caught", error, errorInfo);
  },
  onUncaughtError(error, errorInfo) {
    reportRootError("uncaught", error, errorInfo);
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
  onRecoverableError(error, errorInfo) {
    reportRootError("recoverable", error, errorInfo);
  },
});

// Load the app, provider registrations, and cached locale in parallel. Provider
// registration used to sit behind the app chunk as an eager dependency, adding
// another transform waterfall before React could mount.
logRendererBootstrap("starting app, provider, and locale imports");
const appModulePromise = import("./app").then((module) => {
  logRendererBootstrap("app module resolved");
  return module;
});
const providerBootstrapPromise = import("./components/providers/bootstrap").then((module) => {
  logRendererBootstrap("provider bootstrap resolved");
  return module;
});
const localeBootstrapPromise = bootstrapAppLocaleFromCache().then(() => {
  logRendererBootstrap("locale bootstrap resolved");
});

void Promise.all([appModulePromise, providerBootstrapPromise, localeBootstrapPromise])
  .then(([{ App }]) => {
    logRendererBootstrap("rendering React app");
    reactRoot?.render(
      <RendererErrorBoundary>
        <App />
      </RendererErrorBoundary>,
    );
    requestAnimationFrame(() => {
      requestAnimationFrame(() => logRendererBootstrap("first React frame painted"));
    });
    installDevBridgeAfterPaint();
  })
  .catch((error: unknown) => {
    showCrash("bootstrap", error);
  });
