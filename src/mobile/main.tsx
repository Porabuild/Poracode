import { createRoot, type Root } from "react-dom/client";
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/react";
import "./tailwind.css";
import {
  createRendererCrashReport,
  RendererCrashScreen,
  RendererErrorBoundary,
  type RendererCrashKind,
  type RendererCrashReport,
} from "@/renderer/RendererCrashScreen";
import { bootstrapAppLocaleFromCache } from "@/renderer/i18n/i18n";
import { isIgnorableRejection, isIgnorableWindowError } from "@/renderer/rendererGlobalErrors";
import { markMobilePlatformOnRoot } from "./mobilePlatform";
import { markTouchCapabilityOnRoot } from "./pointerModality";

function stripPairingDetails(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url);
  url.search = "";
  url.hash = "";
  return { ...event, url: url.toString() };
}

// The PWA had no error boundary: any throw during boot or first render left the
// dark body with an empty #root — a silent black screen, with no way to tell
// what failed (notably when launched from the iOS home screen / standalone,
// which renders differently from a Safari tab). Mirror the desktop renderer's
// crash handling so a failure shows a readable, copyable diagnostic instead.

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found.");
}

// Touch-only CSS workarounds (composer tap shield) key off this attribute.
markTouchCapabilityOnRoot();
// Platform-scoped CSS (iOS input-zoom fix, glass alpha) keys off this one.
markMobilePlatformOnRoot();

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
  console.error(`[poracode][mobile:${report.kind}]`, report);
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

// After a deployment the service worker may serve cached HTML that references
// asset hashes which no longer exist on the server. The server's SPA fallback
// returns index.html (text/html) for the missing .js chunk, and the browser
// rejects it as a module script. Detect this and recover by clearing all
// caches and reloading so the next navigation fetches fresh HTML.
const STALE_ASSET_RECOVERY_KEY = "poracode-stale-asset-recovery";

function isStaleAssetError(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  const message = error.message;
  return (
    message.includes("is not a valid JavaScript MIME type") ||
    message.includes("Failed to fetch dynamically imported module")
  );
}

async function recoverFromStaleAssets(): Promise<boolean> {
  const attempts = Number(sessionStorage.getItem(STALE_ASSET_RECOVERY_KEY) ?? "0");
  if (attempts >= 1) {
    sessionStorage.removeItem(STALE_ASSET_RECOVERY_KEY);
    return false;
  }
  sessionStorage.setItem(STALE_ASSET_RECOVERY_KEY, String(attempts + 1));
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    const registration = await navigator.serviceWorker?.getRegistration();
    await registration?.unregister();
  } catch {
    // Best effort — reload regardless.
  }
  window.location.reload();
  return true;
}

window.addEventListener("error", (event) => {
  if (!(event instanceof ErrorEvent)) return;
  if (isIgnorableWindowError(event)) {
    event.preventDefault();
    return;
  }
  if (appRendered) {
    console.error("[poracode][mobile:uncaught]", event.error ?? event.message);
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
    console.error("[poracode][mobile:unhandled-rejection]", event.reason);
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

// Load the mobile app chunk and the cached locale's catalog in parallel, then
// mount once the catalog is active. This mirrors the desktop renderer boot path
// and keeps translated PWA installs from flashing the source locale.
void Promise.all([import("./bootstrapApp"), bootstrapAppLocaleFromCache()])
  .then(([{ MobileApp, registerServiceWorker }]) => {
    sessionStorage.removeItem(STALE_ASSET_RECOVERY_KEY);
    reactRoot?.render(
      <RendererErrorBoundary>
        <MobileApp />
        {import.meta.env.VITE_VERCEL_ANALYTICS_ENABLED ? (
          <Analytics beforeSend={stripPairingDetails} />
        ) : null}
      </RendererErrorBoundary>,
    );
    appRendered = true;
    registerServiceWorker();
  })
  .catch((error: unknown) => {
    if (isStaleAssetError(error)) {
      void recoverFromStaleAssets().then((recovered) => {
        if (!recovered) showCrash("bootstrap", error);
      });
      return;
    }
    showCrash("bootstrap", error);
  });
