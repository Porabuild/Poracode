import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import { useProviderUpdateQueue, type ProviderUpdateTarget } from "./useProviderUpdateQueue";

function target(kind: string): ProviderUpdateTarget {
  return { agent: { kind } as AgentStatus, targetVersion: "2.0.0" };
}

describe("useProviderUpdateQueue", () => {
  it("continues after a failure, refills free slots, and waits for all active jobs", async () => {
    const completions = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();
    const run = vi.fn<(target: ProviderUpdateTarget) => Promise<void>>(
      ({ agent }: ProviderUpdateTarget) =>
        new Promise<void>((resolve, reject) => {
          completions.set(agent.kind, { resolve, reject });
        }),
    );
    const onError = vi.fn<(error: unknown, target: ProviderUpdateTarget) => void>();
    const { result } = renderHook(() => useProviderUpdateQueue(run, onError));
    act(() =>
      result.current.updateAll([target("a"), target("b"), target("c"), target("d"), target("e")]),
    );
    expect(run).toHaveBeenCalledTimes(3);
    expect(result.current.pendingUpdates.get("d")?.phase).toBe("queued");

    const error = new Error("Installation failed");
    await act(async () => completions.get("b")?.reject(error));
    expect(onError).toHaveBeenCalledWith(error, target("b"));
    expect(run).toHaveBeenCalledTimes(4);
    expect(result.current.updateAllProgress).toEqual({ completed: 1, total: 5 });
    expect(result.current.pendingUpdates.has("b")).toBe(false);

    await act(async () => completions.get("d")?.resolve());
    expect(run).toHaveBeenCalledTimes(5);
    expect(result.current.updateAllProgress).toEqual({ completed: 2, total: 5 });
    expect(result.current.isUpdatingAll).toBe(true);

    await act(async () => {
      for (const kind of ["a", "c", "e"]) completions.get(kind)?.resolve();
    });
    await waitFor(() => expect(result.current.isUpdatingAll).toBe(false));
    expect(result.current.pendingUpdates.size).toBe(0);
    expect(result.current.updateAllProgress).toBeUndefined();
  });

  it("deduplicates rapid manual/bulk requests and blocks new manual jobs during a batch", async () => {
    const completions: Array<() => void> = [];
    const run = vi.fn<() => Promise<void>>(
      () => new Promise<void>((resolve) => completions.push(resolve)),
    );
    const { result } = renderHook(() =>
      useProviderUpdateQueue(run, vi.fn<(error: unknown, target: ProviderUpdateTarget) => void>()),
    );
    act(() => {
      result.current.updateKind(target("a"));
      result.current.updateKind(target("a"));
      result.current.updateAll([target("a"), target("b"), target("b")]);
      result.current.updateAll([target("c")]);
      result.current.updateKind(target("c"));
    });
    expect(run).toHaveBeenCalledTimes(2);
    expect(result.current.updateAllProgress).toEqual({ completed: 0, total: 1 });
    expect(result.current.pendingUpdates.size).toBe(2);
    await act(async () => completions.forEach((resolve) => resolve()));
    expect(result.current.pendingUpdates.size).toBe(0);
    expect(result.current.isUpdatingAll).toBe(false);
  });
});
