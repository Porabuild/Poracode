import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { applyElectronIpcBackpressure } from "./electronIpcBackpressure";

describe("applyElectronIpcBackpressure", () => {
  it("does not pause supervisor output when Electron IPC saturates or drains", () => {
    const setSupervisorOutputBackpressured = vi.fn<(paused: boolean) => void>();

    applyElectronIpcBackpressure({
      paused: true,
      setSupervisorOutputBackpressured,
    });
    applyElectronIpcBackpressure({
      paused: false,
      setSupervisorOutputBackpressured,
    });

    expect(setSupervisorOutputBackpressured).not.toHaveBeenCalled();
  });

  it("is the handler the backend-host process attaches to Electron IPC backpressure", () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "index.ts"), "utf8");
    expect(source).toContain("applyElectronIpcBackpressure");
    expect(source).not.toContain("setOutputBackpressured(paused)");
  });
});
