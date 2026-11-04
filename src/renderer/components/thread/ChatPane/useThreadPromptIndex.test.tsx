import { act, renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as react from "react";
import * as compilerRuntime from "react/compiler-runtime";
import { transformSync } from "oxc-transform-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersistedPromptIndex } from "@/shared/ipc";
import * as promptIndexState from "@/renderer/state/threadPromptIndex";
import { useThreadPromptIndex } from "./useThreadPromptIndex";

const { readThreadPromptIndex, cache, stale } = vi.hoisted(() => ({
  cache: new Map<string, PersistedPromptIndex>(),
  stale: new Set<string>(),
  readThreadPromptIndex:
    vi.fn<(threadId: string, signal?: AbortSignal) => Promise<PersistedPromptIndex | null>>(),
}));
vi.mock("@/renderer/state/threadPromptIndex", () => ({
  threadPromptIndexOwner: () => "host",
  shouldRefreshThreadPromptIndex: (threadId: string) => stale.has(threadId),
  readCachedThreadPromptIndex: (threadId: string) => cache.get(threadId),
  readThreadPromptIndex: async (threadId: string, signal?: AbortSignal) => {
    const index = await readThreadPromptIndex(threadId, signal);
    if (index && !signal?.aborted) {
      cache.set(threadId, index);
      stale.delete(threadId);
    }
    return index;
  },
}));

const INDEX: PersistedPromptIndex = {
  prompts: [{ itemId: "prompt-1", position: 2, text: "Hello" }],
  truncated: false,
};

const settle = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe("useThreadPromptIndex", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    readThreadPromptIndex.mockReset();
    cache.clear();
    stale.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads nothing while the rail has no room", async () => {
    const { result } = renderHook(() => useThreadPromptIndex("thread-1", false));
    await settle(10_000);
    expect(readThreadPromptIndex).not.toHaveBeenCalled();
    expect(result.current).toBeUndefined();
  });

  it("does not read the index again when the rail hides and shows", async () => {
    readThreadPromptIndex.mockResolvedValue(INDEX);
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useThreadPromptIndex("thread-1", enabled),
      { initialProps: { enabled: true } },
    );
    await settle(0);
    rerender({ enabled: false });
    rerender({ enabled: true });
    await settle(0);

    expect(readThreadPromptIndex).toHaveBeenCalledOnce();
    expect(result.current).toEqual(INDEX);
  });

  it("returns the index once it is read", async () => {
    readThreadPromptIndex.mockResolvedValue(INDEX);
    const { result } = renderHook(() => useThreadPromptIndex("thread-1", true));
    await settle(0);
    expect(result.current).toEqual(INDEX);
    expect(readThreadPromptIndex).toHaveBeenCalledOnce();
  });

  it("retries a failed read so one transient error does not cost the visit its history", async () => {
    readThreadPromptIndex.mockResolvedValueOnce(null).mockResolvedValueOnce(INDEX);
    const { result } = renderHook(() => useThreadPromptIndex("thread-1", true));

    await settle(0);
    expect(result.current).toBeUndefined();
    await settle(1_500);
    expect(result.current).toEqual(INDEX);
    expect(readThreadPromptIndex).toHaveBeenCalledTimes(2);
  });

  it("stops after a bounded number of retries when the host has no index", async () => {
    readThreadPromptIndex.mockResolvedValue(null);
    const { result } = renderHook(() => useThreadPromptIndex("thread-1", true));

    await settle(60_000);
    expect(result.current).toBeNull();
    expect(readThreadPromptIndex).toHaveBeenCalledTimes(3);
  });

  it("abandons a pending retry when the thread changes", async () => {
    readThreadPromptIndex.mockResolvedValueOnce(null).mockResolvedValue(INDEX);
    const { result, rerender } = renderHook(
      ({ threadId }: { threadId: string }) => useThreadPromptIndex(threadId, true),
      { initialProps: { threadId: "thread-1" } },
    );
    await settle(0);
    rerender({ threadId: "thread-2" });
    await settle(0);

    expect(readThreadPromptIndex.mock.calls.map(([threadId]) => threadId)).toEqual([
      "thread-1",
      "thread-2",
    ]);
    expect(result.current).toEqual(INDEX);
  });
  it("returns the retained index on the first render after reopening", async () => {
    readThreadPromptIndex.mockResolvedValue(INDEX);
    const first = renderHook(() => useThreadPromptIndex("thread-1", true));
    await settle(0);
    first.unmount();
    const reopened = renderHook(() => useThreadPromptIndex("thread-1", true));
    expect(reopened.result.current).toBe(INDEX);
    await settle(0);
    expect(readThreadPromptIndex).toHaveBeenCalledOnce();
  });

  it("keeps the complete retained outline visible while recovery refreshes it", async () => {
    cache.set("thread-1", INDEX);
    stale.add("thread-1");
    const pending = Promise.withResolvers<PersistedPromptIndex>();
    readThreadPromptIndex.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useThreadPromptIndex("thread-1", true));
    expect(result.current).toBe(INDEX);
    await settle(0);
    expect(readThreadPromptIndex).toHaveBeenCalledOnce();
    expect(result.current).toBe(INDEX);
    const refreshed = {
      ...INDEX,
      prompts: [...INDEX.prompts, { itemId: "prompt-2", position: 4, text: "Next" }],
    };
    await act(async () => pending.resolve(refreshed));
    expect(result.current).toBe(refreshed);
  });

  it("does not retain an earlier successful index after a real history reset", async () => {
    readThreadPromptIndex.mockResolvedValueOnce(INDEX);
    const { result, rerender } = renderHook(() => useThreadPromptIndex("thread-1", true));
    await settle(0);
    expect(result.current).toBe(INDEX);
    cache.delete("thread-1");
    readThreadPromptIndex.mockReturnValue(new Promise(() => {}));
    rerender();
    expect(result.current).toBeUndefined();
  });

  it("keeps each thread's index when switching away and back", async () => {
    const second = { prompts: [{ itemId: "other", position: 0, text: "Other" }], truncated: false };
    readThreadPromptIndex.mockResolvedValueOnce(INDEX).mockResolvedValueOnce(second);
    const { result, rerender } = renderHook(
      ({ threadId }) => useThreadPromptIndex(threadId, true),
      { initialProps: { threadId: "thread-1" } },
    );
    await settle(0);
    rerender({ threadId: "thread-2" });
    await settle(0);
    expect(result.current).toBe(second);
    rerender({ threadId: "thread-1" });
    expect(result.current).toBe(INDEX);
    await settle(0);
    expect(readThreadPromptIndex).toHaveBeenCalledTimes(2);
  });
});

/**
 * The renderer build runs React Compiler over this hook (vitest does not), and
 * the hook reads imperative, mutable cache state that must be re-read on every
 * render. These tests run the hook through the same pinned compiler
 * (`oxc-transform-react`, the engine behind `react({ compiler: true })`).
 */
function compileHook(source: string): { hook: typeof useThreadPromptIndex; code: string } {
  const out = transformSync("useThreadPromptIndex.ts", source, { lang: "ts", reactCompiler: {} });
  expect(out.fatal).toBe(false);
  const deps: Record<string, unknown> = {
    react,
    "react/compiler-runtime": compilerRuntime,
    "@/renderer/state/threadPromptIndex": promptIndexState,
  };
  const body = out.code
    .replace(
      /import\s*\{([^}]*)\}\s*from\s*"([^"]+)";?/g,
      (_match, names: string, from: string) =>
        `const {${names.replace(/(\w+)\s+as\s+(\w+)/g, "$1: $2")}} = __deps[${JSON.stringify(from)}];`,
    )
    .replace("export function useThreadPromptIndex", "function useThreadPromptIndex");
  const hook = new Function(
    "__deps",
    `${body}
return useThreadPromptIndex;`,
  )(deps);
  return { hook, code: out.code };
}

describe("useThreadPromptIndex under React Compiler", () => {
  const hookSource = readFileSync(
    resolve("src/renderer/components/thread/ChatPane/useThreadPromptIndex.ts"),
    "utf8",
  );
  const { hook: compiled } = compileHook(hookSource);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    readThreadPromptIndex.mockReset();
    cache.clear();
    stale.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows an index that completes after the first render, without a retry", async () => {
    const pending = Promise.withResolvers<PersistedPromptIndex>();
    readThreadPromptIndex.mockReturnValue(pending.promise);
    const { result } = renderHook(() => compiled("thread-1", true));
    await settle(0);
    expect(result.current).toBeUndefined();

    await act(async () => pending.resolve(INDEX));
    expect(result.current).toBe(INDEX);
    await settle(10_000);
    expect(readThreadPromptIndex).toHaveBeenCalledOnce();
  });

  it("stops serving an outline the cache forgot while the same thread stays mounted", async () => {
    cache.set("thread-1", INDEX);
    const { result, rerender } = renderHook(() => compiled("thread-1", true));
    expect(result.current).toBe(INDEX);

    // A hard reset or rollback forgets the entry; a re-render must not resurrect it.
    cache.delete("thread-1");
    readThreadPromptIndex.mockReturnValue(new Promise(() => {}));
    rerender();
    expect(result.current).toBeUndefined();
  });

  it("refreshes a retained outline once the cache marks it stale for the mounted thread", async () => {
    cache.set("thread-1", INDEX);
    const refreshed = {
      ...INDEX,
      prompts: [...INDEX.prompts, { itemId: "prompt-2", position: 4, text: "Next" }],
    };
    readThreadPromptIndex.mockResolvedValue(refreshed);
    const { result, rerender } = renderHook(() => compiled("thread-1", true));
    await settle(0);
    expect(readThreadPromptIndex).not.toHaveBeenCalled();

    stale.add("thread-1");
    rerender();
    await settle(0);
    expect(readThreadPromptIndex).toHaveBeenCalledOnce();
    expect(result.current).toBe(refreshed);
  });
});
