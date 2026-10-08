import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaybackGrants, PLAYBACK_GRANT_TTL_MS } from "./playbackGrants";

afterEach(() => vi.useRealTimers());
describe("playback grants", () => {
  it("supports repeat requests until release, expiry or session revocation, with no bearer retention", () => {
    vi.useFakeTimers();
    const store = new PlaybackGrants<{ file: string }>();
    const first = store.issue({ file: "one" }, "session-one", Date.now() + 3600_000);
    const other = store.issue({ file: "two" }, "session-two", Date.now() + 3600_000);
    expect(first.ticket).toMatch(/^pc_media_[\w-]{43}$/u);
    const held = store.read(first.ticket);
    expect(store.read(first.ticket).value).toEqual({ file: "one" });
    store.release(first.ticket, "session-two");
    expect(held.signal.aborted).toBe(false);
    store.revokeSession("session-one");
    expect(held.signal.aborted).toBe(true);
    expect(() => store.read(first.ticket)).toThrow("expired");
    const secondHeld = store.read(other.ticket);
    vi.advanceTimersByTime(PLAYBACK_GRANT_TTL_MS);
    expect(secondHeld.signal.aborted).toBe(true);
    expect(() => store.read(other.ticket)).toThrow("expired");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("caps a grant at its session expiry and refuses per-session overflow without evicting live playback", () => {
    vi.useFakeTimers();
    const store = new PlaybackGrants<string>();
    const short = store.issue("one", "short", Date.now() + 2000);
    const held = store.read(short.ticket);
    vi.advanceTimersByTime(2000);
    expect(held.signal.aborted).toBe(true);
    for (let index = 0; index < 32; index++)
      store.issue("file", "same-session", Date.now() + 3600_000);
    expect(() => store.issue("overflow", "same-session", Date.now() + 3600_000)).toThrow(
      "Too many",
    );
    store.clear();
    expect(vi.getTimerCount()).toBe(0);
  });
});
