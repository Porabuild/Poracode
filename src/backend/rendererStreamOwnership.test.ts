import type {
  RendererStreamOwnershipGrant,
  RendererWindowDeliveryState,
} from "@/shared/backendHostProtocol";
import { describe, expect, it } from "vitest";
import {
  RendererStreamOwnership,
  type RendererStreamOwnershipClient,
} from "./RendererStreamOwnership";

const GRANT_A: RendererStreamOwnershipGrant = { windowId: 7, generation: 1, binding: "b-7" };
const GRANT_B: RendererStreamOwnershipGrant = { windowId: 8, generation: 2, binding: "b-8" };

function interests(threadIds: string[]): RendererWindowDeliveryState["interests"] {
  return {
    terminalThreadIds: [...threadIds],
    runtimeThreadIds: [...threadIds],
    allRuntimeEvents: false,
  };
}

function entry(
  windowId: number,
  grant: RendererStreamOwnershipGrant,
  threadIds: string[],
  receivesShellRemainder = false,
): RendererWindowDeliveryState {
  return {
    windowId,
    grant,
    interests: interests(threadIds),
    receivesShellRemainder,
  };
}

function makeClient(): RendererStreamOwnershipClient {
  return { ownedWindowIds: new Set() };
}

describe("RendererStreamOwnership per-window delivery table", () => {
  it("rejects a malformed table loudly instead of dropping a consumer", () => {
    const ownership = new RendererStreamOwnership();
    expect(() =>
      ownership.setWindows([
        entry(7, GRANT_A, ["t"]),
        // Malformed interests: the whole push is rejected, never partially.
        {
          windowId: 8,
          grant: GRANT_B,
          interests: { terminalThreadIds: [], runtimeThreadIds: [] } as never,
          receivesShellRemainder: false,
        },
      ]),
    ).toThrow(/malformed|Rejected/);
    // The whole push was rejected: the table was never armed.
    expect(ownership.isArmed()).toBe(false);
  });

  it("rejects a grant whose windowId disagrees with its entry key", () => {
    const ownership = new RendererStreamOwnership();
    expect(() => ownership.setWindows([entry(7, GRANT_B, [])])).toThrow(/Rejected/);
  });

  it("rejects a grant-less entry: every registered window carries a minted grant", () => {
    const ownership = new RendererStreamOwnership();
    expect(() =>
      ownership.setWindows([
        {
          windowId: 9,
          grant: null as never,
          interests: interests(["t-9"]),
          receivesShellRemainder: false,
        },
      ]),
    ).toThrow(/Rejected/);
    expect(ownership.isArmed()).toBe(false);
  });

  it("rejects an entry without the explicit shell-remainder role", () => {
    const ownership = new RendererStreamOwnership();
    expect(() =>
      ownership.setWindows([{ windowId: 7, grant: GRANT_A, interests: interests([]) } as never]),
    ).toThrow(/Rejected/);
  });

  it("accepts more than the legacy 64-window bound without silent truncation", () => {
    const ownership = new RendererStreamOwnership();
    const windows: RendererWindowDeliveryState[] = [];
    for (let id = 1; id <= 70; id += 1) {
      windows.push({
        windowId: id,
        grant: { windowId: id, generation: id, binding: `b-${id}` },
        interests: interests([]),
        receivesShellRemainder: false,
      });
    }
    ownership.setWindows(windows);
    expect(ownership.fallbackWindows()).toHaveLength(70);
  });

  it("binds an exact match and supersedes a second presenter of the same grant", () => {
    const ownership = new RendererStreamOwnership();
    ownership.setWindows([entry(7, GRANT_A, [])]);
    expect(ownership.match(7, 1, "b-7")).toEqual(GRANT_A);
    expect(ownership.match(7, 1, "forged")).toBeNull();
    expect(ownership.match(7, 99, "b-7")).toBeNull();

    const first = makeClient();
    ownership.attach(7, first);
    expect(ownership.fallbackWindows()).toEqual([]);

    const second = makeClient();
    ownership.attach(7, second);
    expect(ownership.fallbackWindows()).toEqual([]);
    expect(first.ownedWindowIds.has(7)).toBe(false);
    expect(second.ownedWindowIds.has(7)).toBe(true);
  });

  it("revokes a live owner when main re-mints the window and keeps its interests fresh", () => {
    const ownership = new RendererStreamOwnership();
    ownership.setWindows([entry(7, GRANT_A, ["t-old"])]);
    const client = makeClient();
    ownership.attach(7, client);
    expect(client.ownedWindowIds.has(7)).toBe(true);

    const reMinted: RendererStreamOwnershipGrant = {
      windowId: 7,
      generation: 2,
      binding: "b-7-next",
    };
    ownership.setWindows([entry(7, reMinted, ["t-new"])]);
    expect(client.ownedWindowIds.has(7)).toBe(false);
    expect(ownership.fallbackWindows()).toEqual([
      {
        windowId: 7,
        generation: 2,
        interests: interests(["t-new"]),
        receivesShellRemainder: false,
      },
    ]);
    // The old binding cannot re-own across the generation.
    expect(ownership.match(7, 1, "b-7")).toBeNull();
  });

  it("carries the shell-remainder role through to the fallback selection", () => {
    const ownership = new RendererStreamOwnership();
    ownership.setWindows([entry(7, GRANT_A, ["t-1"], true), entry(8, GRANT_B, ["t-2"])]);
    const fallback = ownership.fallbackWindows();
    expect(fallback).toContainEqual({
      windowId: 7,
      generation: 1,
      interests: interests(["t-1"]),
      receivesShellRemainder: true,
    });
    expect(fallback).toContainEqual({
      windowId: 8,
      generation: 2,
      interests: interests(["t-2"]),
      receivesShellRemainder: false,
    });
    // The role is delivery metadata, not identity: an unchanged grant adopts
    // a re-declared role in place, and a role-only change never revokes the owner.
    const client = makeClient();
    ownership.attach(7, client);
    ownership.setWindows([entry(7, GRANT_A, ["t-1"], false)]);
    expect(client.ownedWindowIds.has(7)).toBe(true);
    ownership.detachClient(client);
    expect(
      ownership.fallbackWindows().find((window) => window.windowId === 7)!.receivesShellRemainder,
    ).toBe(false);
  });

  it("keeps the owner attached when only interests change and updates them in place", () => {
    const ownership = new RendererStreamOwnership();
    ownership.setWindows([entry(7, GRANT_A, ["t-1"])]);
    const client = makeClient();
    ownership.attach(7, client);

    ownership.setWindows([entry(7, GRANT_A, ["t-2"])]);
    expect(client.ownedWindowIds.has(7)).toBe(true);
    expect(ownership.fallbackWindows()).toEqual([]);
  });

  it("drops a released window so its stale binding cannot re-own", () => {
    const ownership = new RendererStreamOwnership();
    ownership.setWindows([entry(7, GRANT_A, [])]);
    const client = makeClient();
    ownership.attach(7, client);

    ownership.setWindows([]);
    expect(client.ownedWindowIds.has(7)).toBe(false);
    // No registered desktop consumers at all: nothing needs the fallback.
    expect(ownership.fallbackWindows()).toEqual([]);
    expect(ownership.match(7, 1, "b-7")).toBeNull();
  });

  it("starts un-armed so a stale main keeps the legacy behavior surface", () => {
    const ownership = new RendererStreamOwnership();
    expect(ownership.isArmed()).toBe(false);
    expect(ownership.fallbackWindows()).toEqual([]);
    // Sockets may connect before any push; matching rejects them (no table).
    expect(ownership.match(7, 1, "b-7")).toBeNull();
  });
});
