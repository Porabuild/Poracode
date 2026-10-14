import { describe, expect, it, vi } from "vitest";
import { HostControlUnsupportedOperationError } from "@/backend/ownership/hostControlClient";
import type { HostOwnerRecord } from "@/backend/ownership/hostOwnerLease";
import type { HostRootPaths } from "@/backend/ownership/hostRootPaths";
import { requestOwnerShutdown, waitForOwnerStopped } from "./ownerShutdown";

const paths = { profileNamespace: "/p", dataRoot: "/p.host-v1" } as HostRootPaths;

describe("requestOwnerShutdown", () => {
  it("sends shutdown to the discovered owner and accepts a matching reply", async () => {
    const call = vi.fn<() => Promise<{ ownerGeneration: string }>>(async () => ({
      ownerGeneration: "gen-1",
    }));
    await expect(
      requestOwnerShutdown(paths, "gen-1", { call, discoveryGeneration: () => "gen-1" }),
    ).resolves.toBe("accepted");
    expect(call).toHaveBeenCalledExactlyOnceWith(paths, "shutdown", { timeoutMs: 5_000 });
  });

  it("maps the authenticated unsupported response to unsupported", async () => {
    const call = vi.fn<() => Promise<{ ownerGeneration: string }>>(async () => {
      throw new HostControlUnsupportedOperationError(400);
    });
    await expect(
      requestOwnerShutdown(paths, "gen-1", { call, discoveryGeneration: () => "gen-1" }),
    ).resolves.toBe("unsupported");
  });

  it("propagates other failures and never sends to a different generation", async () => {
    const failing = vi.fn<() => Promise<{ ownerGeneration: string }>>(async () => {
      throw new Error("Current host control could not be reached.");
    });
    await expect(
      requestOwnerShutdown(paths, "gen-1", { call: failing, discoveryGeneration: () => "gen-1" }),
    ).rejects.toThrow("could not be reached");
    const call = vi.fn<() => Promise<{ ownerGeneration: string }>>();
    await expect(
      requestOwnerShutdown(paths, "gen-1", { call, discoveryGeneration: () => "gen-2" }),
    ).rejects.toThrow("generation changed");
    expect(call).not.toHaveBeenCalled();
    await expect(
      requestOwnerShutdown(paths, "gen-1", {
        call: async () => ({ ownerGeneration: "gen-2" }),
        discoveryGeneration: () => "gen-1",
      }),
    ).rejects.toThrow("different owner generation");
  });
});

describe("waitForOwnerStopped", () => {
  const record = (overrides: Partial<HostOwnerRecord>): HostOwnerRecord => ({
    formatVersion: 1,
    profileNamespace: "/p",
    dataRoot: "/p.host-v1",
    generation: "gen-1",
    pid: 1,
    kind: "headless",
    phase: "ready",
    startedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });

  it("resolves once the owner record reports stopped", async () => {
    const phases: HostOwnerRecord[] = [record({}), record({}), record({ phase: "stopped" })];
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => undefined);
    await expect(
      waitForOwnerStopped(paths, "gen-1", {
        timeoutMs: 1_000,
        sleep,
        now: () => 0,
        readRecord: () => phases.shift() ?? null,
      }),
    ).resolves.toBe(true);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("treats a missing or replaced record as stopped", async () => {
    await expect(
      waitForOwnerStopped(paths, "gen-1", { timeoutMs: 1, readRecord: () => null }),
    ).resolves.toBe(true);
    await expect(
      waitForOwnerStopped(paths, "gen-1", {
        timeoutMs: 1,
        readRecord: () => record({ generation: "gen-2" }),
      }),
    ).resolves.toBe(true);
  });

  it("gives up at the deadline while the owner is still running", async () => {
    let now = 0;
    await expect(
      waitForOwnerStopped(paths, "gen-1", {
        timeoutMs: 500,
        now: () => now,
        sleep: async (ms) => {
          now += ms;
        },
        readRecord: () => record({}),
      }),
    ).resolves.toBe(false);
  });
});
