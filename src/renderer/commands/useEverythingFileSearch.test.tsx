import "fake-indexeddb/auto";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, SearchProjectTreeResult } from "@/shared/contracts";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useEverythingFileSearch } from "./useEverythingFileSearch";

const search = vi.hoisted(() => vi.fn<() => Promise<SearchProjectTreeResult>>());
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ searchProjectTree: search, platform: "darwin" }),
  isRemoteSession: () => false,
}));

const project: Project = {
  id: "project",
  name: "Project",
  location: { kind: "windows", path: "C:/project" },
  createdAt: "2026-07-15T00:00:00.000Z",
};
const input = {
  project,
  query: "first",
  enabled: true,
  worktreePath: undefined as string | undefined,
  worktreeBranch: undefined as string | undefined,
};
function files(name: string): SearchProjectTreeResult {
  return { entries: [{ name, path: name, type: "file" }] };
}
function deferred() {
  let resolve!: (value: SearchProjectTreeResult) => void;
  const promise = new Promise<SearchProjectTreeResult>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function debounce() {
  await act(() => vi.advanceTimersByTimeAsync(120));
}

beforeEach(() => {
  vi.useFakeTimers();
  search.mockReset();
  useSharedSettings.setState({ searchUseIgnoreFiles: true, searchExclude: {} });
});
afterEach(() => vi.useRealTimers());

describe("unified file search", () => {
  it("debounces typing and drops obsolete in-flight results", async () => {
    const first = deferred();
    const second = deferred();
    search.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook((props) => useEverythingFileSearch(props), {
      initialProps: input,
    });
    await debounce();
    rerender({ ...input, query: "second" });
    expect(result.current.entries).toEqual([]);
    expect(result.current.loading).toBe(true);
    await debounce();
    await act(async () => {
      second.resolve(files("second.ts"));
    });
    expect(result.current.entries[0]?.name).toBe("second.ts");
    await act(async () => {
      first.resolve(files("first.ts"));
    });
    expect(result.current.entries[0]?.name).toBe("second.ts");
    rerender({ ...input, query: "third" });
    rerender({ ...input, query: "fourth", enabled: false });
    await debounce();
    expect(search).toHaveBeenCalledTimes(2);
    expect(result.current.entries).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("clears files immediately when query, worktree, or search configuration changes", async () => {
    search.mockResolvedValue(files("first.ts"));
    const { result, rerender } = renderHook((props) => useEverythingFileSearch(props), {
      initialProps: input,
    });
    await debounce();
    expect(result.current.entries).toHaveLength(1);
    rerender({ ...input, worktreePath: "C:/worktree", worktreeBranch: "feature" });
    expect(result.current.entries).toEqual([]);
    await debounce();
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({
        projectLocation: { kind: "windows", path: "C:/worktree" },
        entryType: "file",
      }),
    );
    act(() =>
      useSharedSettings.setState({
        searchUseIgnoreFiles: false,
        searchExclude: { "**/generated": true },
      }),
    );
    expect(result.current.entries).toEqual([]);
    await debounce();
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({
        searchConfig: expect.objectContaining({
          useIgnoreFiles: false,
          excludePatterns: expect.arrayContaining(["**/generated"]),
        }),
      }),
    );
    rerender({ ...input, query: "" });
    expect(result.current.entries).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("retries failures and filters directory results from a pre-upgrade host", async () => {
    search.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({
      entries: [{ name: "src", path: "src", type: "directory" }, ...files("src.ts").entries],
    });
    const { result } = renderHook(() => useEverythingFileSearch(input));
    await debounce();
    expect(result.current.failed).toBe(true);
    act(() => result.current.retry());
    expect(result.current.failed).toBe(false);
    expect(result.current.loading).toBe(true);
    await debounce();
    expect(result.current.entries).toEqual(files("src.ts").entries);
    expect(result.current.failed).toBe(false);
  });

  it("does not refetch when only a project title or thread update changes", async () => {
    search.mockResolvedValue(files("first.ts"));
    const { rerender } = renderHook((props) => useEverythingFileSearch(props), {
      initialProps: input,
    });
    await debounce();
    rerender({ ...input, project: { ...project, name: "Renamed" } });
    await debounce();
    expect(search).toHaveBeenCalledOnce();
  });
});
