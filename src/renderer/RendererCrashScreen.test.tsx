import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRendererCrashReport,
  formatRendererCrashReport,
  RendererErrorBoundary,
} from "./RendererCrashScreen";

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
  });
});
