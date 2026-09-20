import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  exec: vi.fn<() => void>(),
}));
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFileSync: state.exec,
}));
vi.mock("@/backend/ownership/hostOwnerLease", () => ({ readHostOwnerRecord: () => null }));
import { restartServerPrefix } from "./serverUpgradeRestart";

beforeEach(() => state.exec.mockClear());

describe("upgrade service selection", () => {
  it("does not touch the global service for an unrelated custom prefix", async () => {
    await restartServerPrefix("/nonexistent-poracode-custom-prefix");
    expect(state.exec).not.toHaveBeenCalled();
  });

  it("restarts the shipped service only for its installed prefix", async () => {
    await restartServerPrefix("/opt/poracode");
    expect(state.exec).toHaveBeenCalledWith("systemctl", ["restart", "poracode-server"], {
      stdio: "pipe",
    });
  });
});
