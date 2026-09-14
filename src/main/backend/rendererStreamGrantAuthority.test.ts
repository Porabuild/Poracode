import { describe, expect, it, vi } from "vitest";
import {
  RendererStreamGrantAuthority,
  type RendererStreamGrantAuthorityOptions,
} from "./rendererStreamGrantAuthority";
import type { RendererEventSender } from "./rendererEventInterestRegistry";

function fakeSender(id: number): { sender: RendererEventSender; destroy(): void } {
  const listeners: Array<() => void> = [];
  return {
    sender: {
      id,
      once: (_channel, listener) => {
        listeners.push(listener);
        return listener;
      },
    },
    destroy: () => {
      for (const listener of listeners.splice(0)) listener();
    },
  };
}

function makeOptions(overrides?: Partial<RendererStreamGrantAuthorityOptions>) {
  const pushed: Array<readonly unknown[]> = [];
  const options: RendererStreamGrantAuthorityOptions = {
    pushDeliveryTable: async (windows) => {
      pushed.push(windows);
    },
    onError: vi.fn<(error: unknown) => void>(),
    shellRemainderWindowId: () => 3,
    interestsByWindow: () =>
      new Map([[3, { terminalThreadIds: ["t-3"], runtimeThreadIds: [], allRuntimeEvents: false }]]),
    ...overrides,
  };
  return { options, pushed };
}

describe("RendererStreamGrantAuthority", () => {
  it("mints one grant per window and reuses it across ensure calls", () => {
    const { options } = makeOptions();
    const authority = new RendererStreamGrantAuthority(options);

    const first = authority.ensureGrant(3);
    expect(first).toMatchObject({ windowId: 3, generation: 1 });
    expect(first.binding.length).toBeGreaterThan(0);
    expect(authority.ensureGrant(3)).toBe(first);
    // Generations strictly increase per mint, never per re-read.
    expect(authority.ensureGrant(5)).toMatchObject({ windowId: 5, generation: 2 });
    expect(authority.ensureGrant(3)).toMatchObject({ generation: 1 });
  });

  it("syncs the composed table: grants, interests, and the shell-remainder role", async () => {
    const { options, pushed } = makeOptions();
    const authority = new RendererStreamGrantAuthority(options);
    authority.ensureGrant(3);
    authority.ensureGrant(5);

    await authority.sync();

    expect(pushed).toHaveLength(1);
    const table = pushed[0]!;
    expect(table).toHaveLength(2);
    expect(table).toContainEqual({
      windowId: 3,
      grant: authority.ensureGrant(3),
      interests: { terminalThreadIds: ["t-3"], runtimeThreadIds: [], allRuntimeEvents: false },
      receivesShellRemainder: true,
    });
    expect(table).toContainEqual({
      windowId: 5,
      grant: authority.ensureGrant(5),
      interests: { terminalThreadIds: [], runtimeThreadIds: [], allRuntimeEvents: false },
      receivesShellRemainder: false,
    });
  });

  it("drops a released grant so its stale binding cannot re-own", async () => {
    const { options, pushed } = makeOptions();
    const authority = new RendererStreamGrantAuthority(options);
    const grant = authority.ensureGrant(3);

    authority.dropGrant(3);
    await authority.sync();
    expect(pushed.at(-1)).toEqual([]);

    // A re-mint after a drop allocates a NEW generation: stale sockets that
    // present the old binding are rejected backend-side.
    expect(authority.ensureGrant(3).generation).toBeGreaterThan(grant.generation);
    expect(authority.ensureGrant(3).binding).not.toBe(grant.binding);
  });

  it("releases a destroyed sender's grant and syncs once per sender", async () => {
    const { options, pushed } = makeOptions();
    const authority = new RendererStreamGrantAuthority(options);
    const sender = fakeSender(7);
    authority.ensureGrant(7);
    authority.observeRelease(sender.sender);
    authority.observeRelease(sender.sender);

    sender.destroy();
    await vi.waitFor(() => expect(pushed.length).toBeGreaterThan(0));
    await authority.sync();
    expect(pushed.at(-1)).toEqual([]);
    // The destroyed hook never re-fires: only one extra sync happened.
    expect(pushed).toHaveLength(2);
  });

  it("rejects stale targeted copies across a re-mint without over-rejecting", () => {
    const { options } = makeOptions();
    const authority = new RendererStreamGrantAuthority(options);
    const grant = authority.ensureGrant(3);
    expect(authority.isStaleDeliveryTarget({ windowId: 3, generation: grant.generation })).toBe(
      false,
    );

    // A re-mint (reload/navigation) strictly raises the generation: frames
    // planned for the previous epoch are provably stale and must be dropped
    // instead of applied to the window's current identity.
    authority.dropGrant(3);
    const reMinted = authority.ensureGrant(3);
    expect(reMinted.generation).toBeGreaterThan(grant.generation);
    expect(authority.isStaleDeliveryTarget({ windowId: 3, generation: grant.generation })).toBe(
      true,
    );
    expect(authority.isStaleDeliveryTarget({ windowId: 3, generation: reMinted.generation })).toBe(
      false,
    );

    // Not provably stale: an unknown window (grant dropped, copy in flight)
    // and a not-yet-presented NEWER generation both deliver, so dropping old
    // frames never creates a gap for an unchanged client.
    authority.dropGrant(3);
    expect(authority.isStaleDeliveryTarget({ windowId: 3, generation: 1 })).toBe(false);
    expect(authority.isStaleDeliveryTarget({ windowId: 99, generation: 1 })).toBe(false);
  });

  it("reports sync failures through onError instead of throwing into callers", async () => {
    const onError = vi.fn<(error: unknown) => void>();
    const { options } = makeOptions({
      pushDeliveryTable: async () => {
        throw new Error("host not running");
      },
      onError,
    });
    const authority = new RendererStreamGrantAuthority(options);
    authority.ensureGrant(3);

    await expect(authority.sync()).rejects.toThrow("host not running");
    // Callers that mirror main's wiring catch and report.
    await authority.sync().catch(onError);
    expect(onError).toHaveBeenCalledExactlyOnceWith(expect.any(Error));
  });
});
