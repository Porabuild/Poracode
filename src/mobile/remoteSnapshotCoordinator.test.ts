import { describe, expect, it, vi } from "vitest";
import { RemoteSnapshotCoordinator } from "./remoteSnapshotCoordinator";

describe("RemoteSnapshotCoordinator", () => {
  it("rejects superseded refresh requests for the active desktop", () => {
    const coordinator = new RemoteSnapshotCoordinator();
    const first = coordinator.nextRequest("desktop-1");
    const second = coordinator.nextRequest("desktop-1");

    expect(coordinator.isLatest("desktop-1", first, "desktop-1")).toBe(false);
    expect(coordinator.isLatest("desktop-1", second, "desktop-1")).toBe(true);
    expect(coordinator.isLatest("desktop-1", second, "desktop-2")).toBe(false);
  });

  it("tracks shell persistence separately from durable replay coverage", async () => {
    const coordinator = new RemoteSnapshotCoordinator();
    const saveShell = vi.fn<() => Promise<void>>(async () => undefined);
    const markConnected = vi.fn<() => Promise<void>>(async () => undefined);
    const persist = (replaySeq: number | null) =>
      coordinator.persistSnapshot({
        desktopId: "desktop-1",
        shellSeq: 7,
        replaySeq,
        isCurrent: () => true,
        saveShell,
        markConnected,
      });

    await expect(persist(null)).resolves.toBe(true);
    await expect(persist(7)).resolves.toBe(true);
    await expect(persist(7)).resolves.toBe(false);
    expect(saveShell).toHaveBeenCalledTimes(1);
    expect(markConnected).toHaveBeenCalledTimes(2);
  });

  it("starts a new persistence epoch when the server sequence resets", async () => {
    const coordinator = new RemoteSnapshotCoordinator();
    const saveShell = vi.fn<() => Promise<void>>(async () => undefined);
    const markConnected = vi.fn<() => Promise<void>>(async () => undefined);
    const persist = (seq: number) =>
      coordinator.persistSnapshot({
        desktopId: "desktop-1",
        shellSeq: seq,
        replaySeq: seq,
        isCurrent: () => true,
        saveShell,
        markConnected,
      });

    await persist(42);
    coordinator.advanceLiveSeq("desktop-1", 0, true);
    await expect(persist(0)).resolves.toBe(true);
    expect(saveShell).toHaveBeenCalledTimes(2);
    expect(markConnected).toHaveBeenCalledTimes(2);
  });

  it("serializes persistence for one desktop", async () => {
    const coordinator = new RemoteSnapshotCoordinator();
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstPending = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = coordinator.persistSnapshot({
      desktopId: "desktop-1",
      shellSeq: 1,
      replaySeq: 1,
      isCurrent: () => true,
      saveShell: async () => {
        order.push("first-start");
        await firstPending;
        order.push("first-end");
      },
      markConnected: async () => undefined,
    });
    const secondSave = vi.fn<() => Promise<void>>(async () => {
      order.push("second");
    });
    const second = coordinator.persistSnapshot({
      desktopId: "desktop-1",
      shellSeq: 2,
      replaySeq: 2,
      isCurrent: () => true,
      saveShell: secondSave,
      markConnected: async () => undefined,
    });

    await Promise.resolve();
    expect(secondSave).not.toHaveBeenCalled();
    releaseFirst();
    await Promise.all([first, second]);

    expect(order).toEqual(["first-start", "first-end", "second"]);
  });

  it("rechecks persistence after a queued write completes", async () => {
    const coordinator = new RemoteSnapshotCoordinator();
    let releaseFirst!: () => void;
    const firstPending = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstSave = vi.fn<() => Promise<void>>(async () => firstPending);
    const secondSave = vi.fn<() => Promise<void>>(async () => undefined);
    const markConnected = vi.fn<() => Promise<void>>(async () => undefined);

    const first = coordinator.persistSnapshot({
      desktopId: "desktop-1",
      shellSeq: 7,
      replaySeq: 7,
      isCurrent: () => true,
      saveShell: firstSave,
      markConnected,
    });
    await Promise.resolve();
    const second = coordinator.persistSnapshot({
      desktopId: "desktop-1",
      shellSeq: 7,
      replaySeq: 7,
      isCurrent: () => true,
      saveShell: secondSave,
      markConnected,
    });

    releaseFirst();
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(false);
    expect(firstSave).toHaveBeenCalledTimes(1);
    expect(secondSave).not.toHaveBeenCalled();
    expect(markConnected).toHaveBeenCalledTimes(1);
  });
});
