import { afterEach, describe, expect, it } from "vitest";
import {
  __resetPendingRemoteThreadOpensForTest,
  pendingRemoteThreadOpen,
  trackPendingRemoteThreadOpen,
} from "./pendingRemoteThreadOpens";

function deferred() {
  let resolve!: (value: boolean) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<boolean>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("pending remote thread opens", () => {
  afterEach(() => __resetPendingRemoteThreadOpensForTest());

  it("exposes an open until it settles", async () => {
    const open = deferred();
    expect(trackPendingRemoteThreadOpen("view-1", open.promise)).toBe(open.promise);
    expect(pendingRemoteThreadOpen("view-1")).toBe(open.promise);
    expect(pendingRemoteThreadOpen("view-2")).toBeUndefined();

    open.resolve(true);
    await open.promise;
    await Promise.resolve();
    expect(pendingRemoteThreadOpen("view-1")).toBeUndefined();
  });

  it("keeps the newer open when an older one for the same thread settles", async () => {
    const older = deferred();
    const newer = deferred();
    expect(trackPendingRemoteThreadOpen("view-1", older.promise)).toBe(older.promise);
    expect(trackPendingRemoteThreadOpen("view-1", newer.promise)).toBe(newer.promise);

    older.reject(new Error("superseded"));
    await older.promise.catch(() => undefined);
    await Promise.resolve();
    expect(pendingRemoteThreadOpen("view-1")).toBe(newer.promise);
  });
});
