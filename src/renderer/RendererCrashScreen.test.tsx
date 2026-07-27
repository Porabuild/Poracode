import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => {
  const scope = {
    setContext: vi.fn<(name: string, value: Record<string, unknown>) => void>(),
    setTags: vi.fn<(tags: Record<string, unknown>) => void>(),
  };
  return {
    captureException: vi.fn<(error: unknown) => void>(),
    isEnabled: vi.fn<() => boolean>(() => true),
    scope,
    withScope: vi.fn<(callback: (value: typeof scope) => void) => void>((callback) =>
      callback(scope),
    ),
  };
});

vi.mock("@sentry/electron/renderer", () => ({
  captureException: sentry.captureException,
  isEnabled: sentry.isEnabled,
  withScope: sentry.withScope,
}));

import {
  createRendererCrashReport,
  formatRendererCrashReport,
  RendererCrashScreen,
  RendererErrorBoundary,
} from "./RendererCrashScreen";
import { captureRendererException } from "./diagnostics/sentry";

beforeEach(() => {
  vi.clearAllMocks();
  sentry.isEnabled.mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, "poracode");
});

describe("RendererCrashScreen", () => {
  it("builds diagnostics with bridge and stack details", () => {
    const error = new Error("startup failed");
    Object.assign(window, {
      poracode: {
        appVersion: "0.1.7",
        electronVersion: "41.5.0",
        platform: "darwin",
        isDev: false,
      },
    });

    const report = createRendererCrashReport({
      kind: "bootstrap",
      error,
      source: "app.js:10:3",
    });
    const diagnostics = formatRendererCrashReport(report);

    expect(diagnostics).toContain("Kind: bootstrap");
    expect(diagnostics).toContain("App version: 0.1.7");
    expect(diagnostics).toContain("Electron: 41.5.0");
    expect(diagnostics).toContain("Platform: darwin");
    expect(diagnostics).toContain("Message: startup failed");
    expect(diagnostics).toContain("Source: app.js:10:3");
    expect(diagnostics).toContain("Stack:");
  });

  it("renders fallback UI when a React child throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    function BrokenChild(): ReactNode {
      throw new Error("render failed");
    }

    render(
      <RendererErrorBoundary>
        <BrokenChild />
      </RendererErrorBoundary>,
    );

    expect(screen.getByText("Renderer crashed")).toBeInTheDocument();
    expect(screen.getByText("Renderer hit a React error")).toBeInTheDocument();
    expect(screen.getByText(/Message: render failed/)).toBeInTheDocument();
    expect(sentry.captureException).toHaveBeenCalledOnce();
  });

  it("lets the desktop root capture a boundary failure exactly once with safe component context", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    function PrivateProjectPanel(): ReactNode {
      throw new Error("render failed");
    }

    render(
      <RendererErrorBoundary captureCaughtErrors={false}>
        <PrivateProjectPanel />
      </RendererErrorBoundary>,
      {
        onCaughtError(error, errorInfo) {
          captureRendererException(
            error,
            { featureArea: "react" },
            errorInfo.componentStack?.trim(),
          );
        },
      },
    );

    expect(sentry.captureException).toHaveBeenCalledOnce();
    expect(sentry.scope.setContext).toHaveBeenCalledOnce();
    const componentContext = sentry.scope.setContext.mock.calls[0];
    expect(componentContext?.[0]).toBe("poracode");
    expect(componentContext?.[1]).toEqual({
      react_components: expect.arrayContaining(["PrivateProjectPanel", "RendererErrorBoundary"]),
    });
    expect(JSON.stringify(componentContext)).not.toMatch(/[\\/](?:Users|home|private|tmp)[\\/]/i);
  });

  it("requests a tracked desktop renderer reload", () => {
    const reloadRenderer = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    Object.assign(window, {
      poracode: {
        appVersion: "1.5.4",
        electronVersion: "43.1.0",
        platform: "darwin",
        isDev: false,
        reloadRenderer,
      },
    });
    render(
      <RendererCrashScreen
        report={createRendererCrashReport({
          kind: "bootstrap",
          error: new Error("startup failed"),
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reload" }));

    expect(reloadRenderer).toHaveBeenCalledOnce();
  });
});
