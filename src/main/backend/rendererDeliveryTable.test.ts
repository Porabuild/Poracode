import { describe, expect, it } from "vitest";
import { buildRendererDeliveryTable, resolveDeliveryTargetWindow } from "./rendererDeliveryTable";

function interests(threads: string[]) {
  return {
    terminalThreadIds: [...threads],
    runtimeThreadIds: [...threads],
    allRuntimeEvents: false,
  };
}

function fakeWindow(
  id: number,
  destroyed = false,
): {
  webContents: { id: number };
  isDestroyed(): boolean;
} {
  return { webContents: { id }, isDestroyed: () => destroyed };
}

describe("buildRendererDeliveryTable", () => {
  it("keys the table on minted grants and declares the shell-remainder role", () => {
    const grants = new Map([
      [3, { windowId: 3, generation: 1, binding: "b-3" }],
      [5, { windowId: 5, generation: 2, binding: "b-5" }],
    ]);
    const interestsByWindow = new Map([
      [3, interests(["t-3"])],
      [4, interests(["t-4"])],
    ]);

    const table = buildRendererDeliveryTable(grants, interestsByWindow, 5);

    // Every entry carries its minted grant (identity is allocated before the
    // interests publish), plus the window's declared shell role.
    expect(table).toContainEqual({
      windowId: 3,
      grant: { windowId: 3, generation: 1, binding: "b-3" },
      interests: interests(["t-3"]),
      receivesShellRemainder: false,
    });
    // The shell-remainder recipient (main's window) is declared explicitly.
    expect(table).toContainEqual({
      windowId: 5,
      grant: { windowId: 5, generation: 2, binding: "b-5" },
      interests: { terminalThreadIds: [], runtimeThreadIds: [], allRuntimeEvents: false },
      receivesShellRemainder: true,
    });
    // No grant, no entry: an interests-only window has no supported producer.
    expect(table.some((entry) => entry.windowId === 4)).toBe(false);
  });

  it("declares no shell recipient while main's window is absent", () => {
    const grants = new Map([[3, { windowId: 3, generation: 1, binding: "b-3" }]]);
    const table = buildRendererDeliveryTable(grants, new Map(), null);
    expect(table).toEqual([
      {
        windowId: 3,
        grant: { windowId: 3, generation: 1, binding: "b-3" },
        interests: { terminalThreadIds: [], runtimeThreadIds: [], allRuntimeEvents: false },
        receivesShellRemainder: false,
      },
    ]);
  });
});

describe("resolveDeliveryTargetWindow", () => {
  const windows = [fakeWindow(1), fakeWindow(2), fakeWindow(3, true)];

  it("resolves only the exact live webContents id", () => {
    expect(
      resolveDeliveryTargetWindow({ windowId: 2, generation: 1 }, windows)?.webContents.id,
    ).toBe(2);
    expect(
      resolveDeliveryTargetWindow({ windowId: 1, generation: 1 }, windows)?.webContents.id,
    ).toBe(1);
  });

  it("never leaks a targeted copy to a sibling and drops destroyed targets", () => {
    expect(resolveDeliveryTargetWindow({ windowId: 9, generation: 1 }, windows)).toBeNull();
    // Window 3 is destroyed: the copy is dropped, not redirected.
    expect(resolveDeliveryTargetWindow({ windowId: 3, generation: 1 }, windows)).toBeNull();
    expect(resolveDeliveryTargetWindow({ windowId: 3, generation: 1 }, [null])).toBeNull();
  });
});
