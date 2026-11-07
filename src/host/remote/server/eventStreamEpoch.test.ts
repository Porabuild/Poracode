import { describe, expect, it } from "vitest";
import type { RemoteServerContext } from "./context";
import {
  eventStreamEpochOf,
  MAX_TRACKED_LEGACY_RESUME_SESSIONS,
  verifyResumeCursor,
} from "./eventStreamEpoch";

function newContext(): RemoteServerContext {
  return {} as RemoteServerContext;
}

describe("event-stream epoch state", () => {
  it("mints one stable epoch per server context", () => {
    const first = newContext();
    const second = newContext();
    expect(eventStreamEpochOf(first)).toBe(eventStreamEpochOf(first));
    expect(eventStreamEpochOf(first)).not.toBe(eventStreamEpochOf(second));
  });

  it("verifies a declared positive cursor only with this instance's epoch", () => {
    const ctx = newContext();
    const epoch = eventStreamEpochOf(ctx);
    expect(verifyResumeCursor(ctx, "s", 5, { lastSeenEpoch: epoch })).toBe(true);
    expect(verifyResumeCursor(ctx, "s", 5, { lastSeenEpoch: "other" })).toBe(false);
    expect(verifyResumeCursor(ctx, "s", 5, { lastSeenEpoch: null })).toBe(false);
    expect(verifyResumeCursor(ctx, "s", 0, { lastSeenEpoch: null })).toBe(true);
    expect(verifyResumeCursor(ctx, "s", null, { lastSeenEpoch: null })).toBe(true);
  });

  it("forces one resync per undeclared session, which a declared connection never satisfies", () => {
    const ctx = newContext();
    // A declared connection of the same session leaves the legacy memory alone,
    // so an older realm sharing the session still gets its one resync.
    verifyResumeCursor(ctx, "s", 7, { lastSeenEpoch: eventStreamEpochOf(ctx) });
    expect(verifyResumeCursor(ctx, "s", 7, null)).toBe(false);
    expect(verifyResumeCursor(ctx, "s", 7, null)).toBe(true);
    // Joins without a cursor or from 0 never resync but do record the session.
    expect(verifyResumeCursor(ctx, "t", null, null)).toBe(true);
    expect(verifyResumeCursor(ctx, "t", 3, null)).toBe(true);
    expect(verifyResumeCursor(ctx, "u", 0, null)).toBe(true);
    expect(verifyResumeCursor(ctx, "u", 3, null)).toBe(true);
  });

  it("bounds the legacy session memory, evicting the least recently connected", () => {
    const ctx = newContext();
    verifyResumeCursor(ctx, "oldest", null, null);
    verifyResumeCursor(ctx, "kept", null, null);
    for (let index = 0; index < MAX_TRACKED_LEGACY_RESUME_SESSIONS - 2; index += 1) {
      verifyResumeCursor(ctx, `filler-${index}`, null, null);
    }
    // Reconnecting refreshes recency; the next new session evicts "oldest".
    verifyResumeCursor(ctx, "kept", null, null);
    verifyResumeCursor(ctx, "newest", null, null);
    expect(verifyResumeCursor(ctx, "kept", 9, null)).toBe(true);
    expect(verifyResumeCursor(ctx, "oldest", 9, null)).toBe(false);
  });
});
