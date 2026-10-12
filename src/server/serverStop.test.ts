import { describe, expect, it, vi } from "vitest";
import { stopRunningServer } from "./serverStop";
import { RunningOwnerUnreachableError, type RunningOwnerProbe } from "./serverUpgradeIdentity";

const probe = { generation: "gen-1", pid: 4242 } as RunningOwnerProbe;
const stoppedRecord = () => ({ generation: "gen-1", phase: "stopped" }) as never;
const runningRecord = () => ({ generation: "gen-1", phase: "ready" }) as never;

describe("stopRunningServer", () => {
  it("reports not-running when there is no live owner", async () => {
    const request = vi.fn<() => Promise<{ ownerGeneration: string }>>();
    await expect(
      stopRunningServer("/tmp/poracode-stop-none", {
        probe: async () => null,
        request: { call: request },
      }),
    ).resolves.toEqual({ outcome: "not-running" });
    expect(request).not.toHaveBeenCalled();
  });

  it("asks the authenticated owner to shut down and waits for the stopped record", async () => {
    const call = vi.fn<() => Promise<{ ownerGeneration: string }>>(async () => ({
      ownerGeneration: "gen-1",
    }));
    await expect(
      stopRunningServer("/tmp/poracode-stop-ok", {
        probe: async () => probe,
        request: { call, discoveryGeneration: () => "gen-1" },
        wait: { readRecord: stoppedRecord },
      }),
    ).resolves.toEqual({ outcome: "stopped", generation: "gen-1", pid: 4242 });
    expect(call).toHaveBeenCalledOnce();
  });

  it("fails on an owner that predates shutdown instead of signalling", async () => {
    const { HostControlUnsupportedOperationError } =
      await import("@/backend/ownership/hostControlClient");
    await expect(
      stopRunningServer("/tmp/poracode-stop-old", {
        probe: async () => probe,
        request: {
          call: async () => {
            throw new HostControlUnsupportedOperationError(400);
          },
          discoveryGeneration: () => "gen-1",
        },
      }),
    ).rejects.toThrow("predates the graceful shutdown");
  });

  it("wraps a request failure and times out with a bounded deadline", async () => {
    await expect(
      stopRunningServer("/tmp/poracode-stop-fail", {
        probe: async () => probe,
        request: {
          call: async () => {
            throw new Error("unreachable");
          },
          discoveryGeneration: () => "gen-1",
        },
      }),
    ).rejects.toBeInstanceOf(RunningOwnerUnreachableError);
    let now = 0;
    await expect(
      stopRunningServer("/tmp/poracode-stop-timeout", {
        timeoutMs: 300,
        probe: async () => probe,
        request: {
          call: async () => ({ ownerGeneration: "gen-1" }),
          discoveryGeneration: () => "gen-1",
        },
        wait: {
          readRecord: runningRecord,
          now: () => now,
          sleep: async (ms) => {
            now += ms;
          },
        },
      }),
    ).rejects.toThrow("did not report stopped within 300ms");
  });
});
