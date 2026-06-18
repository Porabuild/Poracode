import { Component, useState, type ErrorInfo, type ReactNode } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { Button } from "./components/common";
import { captureRendererException } from "./diagnostics/sentry";
import { i18n } from "./i18n/i18n";

export type RendererCrashKind = "bootstrap" | "react" | "uncaught" | "unhandled-rejection";

export type RendererCrashReport = {
  kind: RendererCrashKind;
  timestamp: string;
  message: string;
  url: string;
  userAgent: string;
  errorName?: string;
  stack?: string;
  componentStack?: string;
  source?: string;
  appVersion?: string;
  electronVersion?: string;
  platform?: string;
  isDev?: boolean;
};

type RendererCrashInput = {
  kind: RendererCrashKind;
  error: unknown;
  componentStack?: string;
  source?: string;
};

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (value === null) return "null";
  if (typeof value === "undefined") return "undefined";

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function normalizeError(error: unknown): {
  name?: string;
  message: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return {
      ...(error.name ? { name: error.name } : {}),
      message: error.message || String(error),
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }

  return {
    message: stringifyUnknown(error),
  };
}

function readBridgeDiagnostics(): {
  appVersion?: string;
  electronVersion?: string;
  platform?: string;
  isDev?: boolean;
} {
  if (typeof window === "undefined" || !("lightcode" in window)) {
    return {};
  }

  const bridge = window.lightcode;
  return {
    ...(bridge.appVersion ? { appVersion: bridge.appVersion } : {}),
    ...(bridge.electronVersion ? { electronVersion: bridge.electronVersion } : {}),
    ...(bridge.platform ? { platform: bridge.platform } : {}),
    isDev: bridge.isDev,
  };
}

export function createRendererCrashReport(input: RendererCrashInput): RendererCrashReport {
  const normalized = normalizeError(input.error);
  return {
    kind: input.kind,
    timestamp: new Date().toISOString(),
    message: normalized.message,
    url: typeof window === "undefined" ? "" : window.location.href,
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
    ...readBridgeDiagnostics(),
    ...(normalized.name ? { errorName: normalized.name } : {}),
    ...(normalized.stack ? { stack: normalized.stack } : {}),
    ...(input.componentStack?.trim() ? { componentStack: input.componentStack.trim() } : {}),
    ...(input.source ? { source: input.source } : {}),
  };
}

export function formatRendererCrashReport(report: RendererCrashReport): string {
  const lines = [
    "Lightcode renderer crash",
    `Kind: ${report.kind}`,
    `Time: ${report.timestamp}`,
    `URL: ${report.url}`,
    report.appVersion ? `App version: ${report.appVersion}` : null,
    report.electronVersion ? `Electron: ${report.electronVersion}` : null,
    report.platform ? `Platform: ${report.platform}` : null,
    typeof report.isDev === "boolean" ? `Dev build: ${report.isDev ? "yes" : "no"}` : null,
    `User agent: ${report.userAgent}`,
    report.errorName ? `Error: ${report.errorName}` : null,
    `Message: ${report.message}`,
    report.source ? `Source: ${report.source}` : null,
    report.stack ? `\nStack:\n${report.stack}` : null,
    report.componentStack ? `\nComponent stack:\n${report.componentStack}` : null,
  ];

  return lines.filter((line): line is string => line !== null).join("\n");
}

function crashTitle(kind: RendererCrashKind): MessageDescriptor {
  switch (kind) {
    case "bootstrap":
      return msg`Renderer failed during startup`;
    case "react":
      return msg`Renderer hit a React error`;
    case "unhandled-rejection":
      return msg`Renderer hit an unhandled promise rejection`;
    case "uncaught":
      return msg`Renderer hit an uncaught error`;
  }
}

type RendererCrashScreenProps = {
  report: RendererCrashReport;
};

export function RendererCrashScreen(props: RendererCrashScreenProps) {
  const { report } = props;
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const diagnostics = formatRendererCrashReport(report);

  async function copyDiagnostics() {
    try {
      await navigator.clipboard.writeText(diagnostics);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <div className="flex min-h-0 w-full flex-col gap-4 px-8 pt-14 pb-8">
        <header className="flex shrink-0 items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-danger">{i18n._(msg`Renderer crashed`)}</p>
            <h1 className="mt-2 text-xl font-semibold">{i18n._(crashTitle(report.kind))}</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted">
              {i18n._(
                msg`The normal app shell could not render. The diagnostics below are shown before reload so the failure can be investigated.`,
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="secondary" onPress={() => window.location.reload()}>
              <RefreshCw className="size-3.5" />
              {i18n._(msg`Reload`)}
            </Button>
            <Button size="sm" variant="secondary" onPress={() => void copyDiagnostics()}>
              <Copy className="size-3.5" />
              {copyState === "copied"
                ? i18n._(msg`Copied`)
                : copyState === "failed"
                  ? i18n._(msg`Copy failed`)
                  : i18n._(msg`Copy diagnostics`)}
            </Button>
          </div>
        </header>
        <section className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-default-50 p-4">
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-foreground">
            {diagnostics}
          </pre>
        </section>
      </div>
    </main>
  );
}

type RendererErrorBoundaryProps = {
  children: ReactNode;
};

type RendererErrorBoundaryState = {
  report: RendererCrashReport | null;
};

export class RendererErrorBoundary extends Component<
  RendererErrorBoundaryProps,
  RendererErrorBoundaryState
> {
  override state: RendererErrorBoundaryState = {
    report: null,
  };

  static getDerivedStateFromError(error: unknown): RendererErrorBoundaryState {
    return {
      report: createRendererCrashReport({
        kind: "react",
        error,
      }),
    };
  }

  override componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    captureRendererException(error, { featureArea: "react" });
    this.setState({
      report: createRendererCrashReport({
        kind: "react",
        error,
        ...(errorInfo.componentStack ? { componentStack: errorInfo.componentStack } : {}),
      }),
    });
  }

  override render() {
    if (this.state.report) {
      return <RendererCrashScreen report={this.state.report} />;
    }

    return this.props.children;
  }
}
