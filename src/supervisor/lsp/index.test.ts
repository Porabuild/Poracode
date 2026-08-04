import { describe, expect, it, vi } from "vitest";
import type { LspSessionStatus } from "@/shared/lsp";
import type { SupervisorEvent } from "@/shared/ipc";

const mocks = vi.hoisted(() => ({
  start: vi.fn<() => Promise<void>>(),
  dispose: vi.fn<() => void>(),
}));

vi.mock("./serverInstance", () => ({
  ServerInstance: class {
    private readonly onStatus: (status: LspSessionStatus, error?: string) => void;

    constructor(
      _sessionId: string,
      _config: unknown,
      _projectLocation: unknown,
      _onMessage: (message: unknown) => void,
      onStatus: (status: LspSessionStatus, error?: string) => void,
    ) {
      this.onStatus = onStatus;
    }

    async start(): Promise<void> {
      this.onStatus("error", "provider detail stays in the user-facing status");
      return mocks.start();
    }

    dispose(): void {
      mocks.dispose();
    }
  },
}));

import { LanguageServerManager } from "./index";

describe("LanguageServerManager", () => {
  it("preserves privacy-safe initialization rejection and visible error status", async () => {
    mocks.start.mockRejectedValueOnce(new Error("Language server failed to initialize."));
    const events: SupervisorEvent[] = [];
    const manager = new LanguageServerManager((event) => events.push(event));

    await expect(
      manager.start({
        sessionId: "lsp-1",
        languageId: "typescript",
        projectLocation: { kind: "posix", path: "/repo" },
      }),
    ).rejects.toThrow("Language server failed to initialize.");
    expect(events).toContainEqual({
      type: "lsp-status",
      sessionId: "lsp-1",
      languageId: "typescript",
      status: "error",
      error: "provider detail stays in the user-facing status",
    });
  });
});
