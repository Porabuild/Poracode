import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ForgePrViewedFilesResult } from "@/shared/contracts";

const bridge = vi.hoisted(() => ({
  forgeGetPrViewedFiles: vi.fn<(...args: unknown[]) => Promise<ForgePrViewedFilesResult>>(),
  forgeSetPrFileViewed: vi.fn<(...args: unknown[]) => Promise<ForgePrViewedFilesResult>>(),
}));
const danger = vi.hoisted(() => vi.fn<(message: string) => void>());
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));
vi.mock("@heroui/react", () => ({ toast: { danger } }));
import { useSyncedPrViewedFiles } from "./useSyncedPrViewedFiles";

const input = {
  projectLocation: { kind: "posix" as const, path: "/repo" },
  forgeAccount: { forge: "gitlab" as const, host: "https://git.example", login: "alice" },
  forgeRepository: "team/app",
  prNumber: 7,
};
const marked: ForgePrViewedFilesResult = {
  storage: "host",
  files: [{ path: "file.ts", fingerprint: "one" }],
};
const empty: ForgePrViewedFilesResult = { storage: "host", files: [] };

describe("synced review viewed marks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.forgeGetPrViewedFiles.mockResolvedValue(empty);
    bridge.forgeSetPrFileViewed.mockResolvedValue(marked);
    localStorage.clear();
  });

  it("uses server state and exposes patch changes without optimistic success", async () => {
    const hook = renderHook(() => useSyncedPrViewedFiles("A", input));
    expect(hook.result.current.loading).toBe(true);
    await act(() => hook.result.current.refresh());
    let complete!: (value: ForgePrViewedFilesResult) => void;
    bridge.forgeSetPrFileViewed.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    act(() => hook.result.current.mark("file.ts", "one"));
    expect(hook.result.current.state("file.ts", "one")).toBe("unread");
    expect(hook.result.current.loading).toBe(true);
    await act(async () => {
      complete(marked);
    });
    expect(hook.result.current.state("file.ts", "one")).toBe("viewed");
    expect(hook.result.current.state("file.ts", "two")).toBe("changed");
    expect(bridge.forgeSetPrFileViewed).toHaveBeenCalledWith({
      ...input,
      path: "file.ts",
      fingerprint: "one",
    });
    expect(localStorage.length).toBe(0);
  });

  it("does not let a held old read overwrite a replacement review", async () => {
    let complete!: (value: ForgePrViewedFilesResult) => void;
    bridge.forgeGetPrViewedFiles
      .mockReturnValueOnce(
        new Promise((resolve) => {
          complete = resolve;
        }),
      )
      .mockResolvedValue(empty);
    const hook = renderHook(
      ({ scope }) => useSyncedPrViewedFiles(scope, { ...input, prNumber: scope === "A" ? 7 : 8 }),
      { initialProps: { scope: "A" } },
    );
    act(() => {
      void hook.result.current.refresh();
    });
    await waitFor(() => expect(bridge.forgeGetPrViewedFiles).toHaveBeenCalledTimes(1));
    hook.rerender({ scope: "B" });
    await act(() => hook.result.current.refresh());
    await act(async () => {
      complete(marked);
    });
    expect(hook.result.current.state("file.ts", "one")).toBe("unread");
    expect(hook.result.current.loading).toBe(false);
  });

  it("keeps an old write on its source without blocking the replacement review", async () => {
    let complete!: (value: ForgePrViewedFilesResult) => void;
    const hook = renderHook(
      ({ scope }) => useSyncedPrViewedFiles(scope, { ...input, prNumber: scope === "A" ? 7 : 8 }),
      { initialProps: { scope: "A" } },
    );
    await act(() => hook.result.current.refresh());
    bridge.forgeSetPrFileViewed.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    act(() => hook.result.current.mark("file.ts", "one"));
    await waitFor(() => expect(bridge.forgeSetPrFileViewed).toHaveBeenCalledTimes(1));
    hook.rerender({ scope: "B" });
    await act(() => hook.result.current.refresh());
    expect(hook.result.current.loading).toBe(false);
    await act(async () => {
      complete(marked);
    });
    expect(hook.result.current.state("file.ts", "one")).toBe("unread");
    expect(bridge.forgeSetPrFileViewed).toHaveBeenCalledWith(
      expect.objectContaining({ prNumber: 7 }),
    );
  });

  it("uses GitHub's viewed and dismissed states and refreshes them on focus", async () => {
    bridge.forgeGetPrViewedFiles.mockResolvedValue({
      storage: "forge",
      files: [{ path: "file.ts", fingerprint: "VIEWED" }],
    });
    const hook = renderHook(() => useSyncedPrViewedFiles("A", input));
    await act(() => hook.result.current.refresh());
    expect(hook.result.current.state("file.ts", "any patch")).toBe("viewed");
    bridge.forgeGetPrViewedFiles.mockResolvedValue({
      storage: "forge",
      files: [{ path: "file.ts", fingerprint: "DISMISSED" }],
    });
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(hook.result.current.state("file.ts", "any patch")).toBe("changed"));
  });

  it("keeps failed writes unread and reports their error once without another account call", async () => {
    const hook = renderHook(() => useSyncedPrViewedFiles("A", input));
    await act(() => hook.result.current.refresh());
    bridge.forgeSetPrFileViewed.mockRejectedValue(new Error("permission denied"));
    act(() => hook.result.current.mark("file.ts", "one"));
    await waitFor(() => expect(danger).toHaveBeenCalledTimes(1));
    expect(hook.result.current.state("file.ts", "one")).toBe("unread");
    expect(hook.result.current.loading).toBe(false);
    expect(bridge.forgeSetPrFileViewed).toHaveBeenCalledTimes(1);
  });
});
