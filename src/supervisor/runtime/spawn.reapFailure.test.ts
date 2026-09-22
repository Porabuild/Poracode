import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn<(...args: unknown[]) => unknown>(),
}));

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return { ...actual, spawn: spawnMock };
});

import { spawnAndAwaitExit } from "./spawn";

/** A child whose `exit` event never fires and whose SIGKILL is ignored. */
class UnreapableChild extends EventEmitter {
  /** Out-of-range pid so the best-effort `process.kill` cannot reach a real process. */
  readonly pid = 2_147_483_647;
  readonly kill = vi.fn<() => boolean>(() => true);
  readonly stderr = Object.assign(new EventEmitter(), { resume: () => undefined });
  readonly stdin = undefined;
  readonly stdout = undefined;
}

describe("spawnAndAwaitExit reap failure", () => {
  it("rejects with a truthful error when SIGKILL cannot be confirmed", async () => {
    const child = new UnreapableChild();
    spawnMock.mockReturnValue(child);

    const pending = spawnAndAwaitExit("wedged-extractor", [], {
      timeoutMs: 20,
      label: "wedged extraction",
      terminateGraceMs: 20,
      reapTimeoutMs: 40,
    });

    await expect(pending).rejects.toThrow(
      /wedged extraction timed out after 20ms and could not be confirmed exited after SIGKILL/,
    );
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });
});
