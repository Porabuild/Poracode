import { act, renderHook } from "@testing-library/react";
import { createElement, StrictMode, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ListProjectTreeResult } from "@/shared/contracts";
import { listProjectRoot, useProjectRootNames } from "./projectRootNamesStore";

const bridge = vi.hoisted(() => ({
  listProjectTree: vi.fn<() => Promise<ListProjectTreeResult>>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));
const result = (name: string): ListProjectTreeResult => ({
  directoryPath: "",
  entries: [{ name, path: name, type: "file" }],
});

describe("shared project root listings", () => {
  beforeEach(() => bridge.listProjectTree.mockReset());

  it("shares equivalent location objects and seeds names for later chat mounts", async () => {
    const pending = Promise.withResolvers<ListProjectTreeResult>();
    bridge.listProjectTree.mockReturnValue(pending.promise);
    const location = { kind: "posix" as const, path: "/deduplicated", remoteServerId: "host-a" };
    const first = listProjectRoot(location, () => true);
    const second = listProjectRoot(
      {
        remoteServerId: "host-a",
        path: "/deduplicated",
        kind: "posix",
      },
      () => true,
    );
    expect(first).toBe(second);
    pending.resolve(result("root.txt"));
    await first;
    const names = renderHook(() => useProjectRootNames(location));
    expect([...names.result.current]).toEqual(["root.txt"]);
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(1);
  });

  it("keeps equal paths on different hosts separate", async () => {
    const pending = Promise.withResolvers<ListProjectTreeResult>();
    bridge.listProjectTree.mockReturnValue(pending.promise);
    const first = listProjectRoot(
      { kind: "posix", path: "/hosts", remoteServerId: "host-a" },
      () => true,
    );
    const second = listProjectRoot(
      { kind: "posix", path: "/hosts", remoteServerId: "host-b" },
      () => true,
    );
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(2);
    pending.resolve(result("host.txt"));
    await Promise.all([first, second]);
  });

  it.each([0, 1])(
    "keeps a shared request while either root owner remains (departed=%s)",
    async (departed) => {
      const location = { kind: "posix" as const, path: `/independent-owners-${departed}` };
      const pending = Promise.withResolvers<ListProjectTreeResult>();
      bridge.listProjectTree.mockReturnValue(pending.promise);
      const active = [true, true];
      const first = listProjectRoot(location, () => active[0]!);
      const second = listProjectRoot(location, () => active[1]!);
      active[departed] = false;
      const third = listProjectRoot(location, () => true);
      expect(first).toBe(second);
      expect(third).toBe(first);
      pending.resolve(result("shared.txt"));
      await third;
      const names = renderHook(() => useProjectRootNames(location));
      expect([...names.result.current]).toEqual(["shared.txt"]);
      expect(bridge.listProjectTree).toHaveBeenCalledTimes(1);
    },
  );

  it("allows retry after failure", async () => {
    const location = { kind: "posix" as const, path: "/retry-root" };
    bridge.listProjectTree
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(result("retried.txt"));
    await expect(listProjectRoot(location, () => true)).rejects.toThrow("offline");
    await expect(listProjectRoot(location, () => true)).resolves.toEqual(result("retried.txt"));
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(2);
  });

  it("does not reuse a departed root request or let it overwrite newer names", async () => {
    const location = { kind: "posix" as const, path: "/departed-root" };
    const pending = Promise.withResolvers<ListProjectTreeResult>();
    bridge.listProjectTree
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(result("current.txt"));
    let ownsRoot = true;
    const old = listProjectRoot(location, () => ownsRoot);
    ownsRoot = false;
    await listProjectRoot(location, () => true);
    const names = renderHook(() => useProjectRootNames(location));
    expect([...names.result.current]).toEqual(["current.txt"]);
    await act(async () => {
      pending.resolve(result("departed.txt"));
      await old;
    });
    expect([...names.result.current]).toEqual(["current.txt"]);
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(2);
  });

  it("shares a names-only request through StrictMode effect replay", async () => {
    const location = { kind: "posix" as const, path: "/names-strict-mode" };
    const pending = Promise.withResolvers<ListProjectTreeResult>();
    bridge.listProjectTree.mockReturnValue(pending.promise);
    const names = renderHook(() => useProjectRootNames(location), {
      wrapper: ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children),
    });
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(result("shared.txt")));
    expect([...names.result.current]).toEqual(["shared.txt"]);
  });

  it.each([0, 1])(
    "keeps a names-only request for the remaining mounted consumer (unmounted=%s)",
    async (unmounted) => {
      const location = { kind: "posix" as const, path: `/names-concurrent-${unmounted}` };
      const pending = Promise.withResolvers<ListProjectTreeResult>();
      bridge.listProjectTree.mockReturnValue(pending.promise);
      const names = [
        renderHook(() => useProjectRootNames(location)),
        renderHook(() => useProjectRootNames(location)),
      ];
      names[unmounted]!.unmount();
      await act(async () => pending.resolve(result("shared.txt")));
      expect([...names[1 - unmounted]!.result.current]).toEqual(["shared.txt"]);
      expect(bridge.listProjectTree).toHaveBeenCalledTimes(1);
    },
  );

  it("does not cache a names-only reply after unmount", async () => {
    const location = { kind: "posix" as const, path: "/names-unmounted-cache" };
    const old = Promise.withResolvers<ListProjectTreeResult>();
    bridge.listProjectTree
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(result("current.txt"));
    const first = renderHook(() => useProjectRootNames(location));
    first.unmount();
    await act(async () => old.resolve(result("departed.txt")));
    const current = renderHook(() => useProjectRootNames(location));
    await act(async () => {});
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(2);
    expect([...current.result.current]).toEqual(["current.txt"]);
  });

  it("keeps validation unavailable on a synchronous bridge failure and allows retry", async () => {
    const location = { kind: "posix" as const, path: "/names-unavailable" };
    bridge.listProjectTree
      .mockImplementationOnce(() => {
        throw new Error("bridge unavailable");
      })
      .mockResolvedValueOnce(result("retried.txt"));
    const names = renderHook(({ target }) => useProjectRootNames(target), {
      initialProps: { target: location },
    });
    await act(async () => {});
    expect([...names.result.current]).toEqual([]);
    names.rerender({ target: { ...location } });
    await act(async () => {});
    expect([...names.result.current]).toEqual(["retried.txt"]);
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(2);
  });
});
