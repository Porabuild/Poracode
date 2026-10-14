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

  it("extends only a live owning ticket, retains the stream signal and aborts naturally at the renewed bounded expiry", () => {
    vi.useFakeTimers();
    const store = new PlaybackGrants<string>();
    const retired = vi.fn<() => void>();
    const limit = Date.now() + 200_000;
    const source = store.issue("file", "owner", limit, retired);
    const held = store.read(source.ticket);
    vi.advanceTimersByTime(90_000);
    expect(() => store.renew(source.ticket, "other", limit)).toThrow("expired");
    expect(store.renew(source.ticket, "owner", limit)).toEqual({
      ticket: source.ticket,
      expiresAt: new Date(limit).toISOString(),
    });
    expect(store.read(source.ticket).signal).toBe(held.signal);
    vi.advanceTimersByTime(30_001); // Original expiry must not abort a renewed active transfer.
    expect(held.signal.aborted).toBe(false);
    expect(retired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(79_999);
    expect(held.signal.aborted).toBe(true);
    expect(retired).toHaveBeenCalledOnce();
    expect(() => store.renew(source.ticket, "owner", Date.now() + 120_000)).toThrow("expired");
    const released = store.issue("other", "owner", Date.now() + 120_000);
    store.release(released.ticket, "owner");
    expect(() => store.renew(released.ticket, "owner", Date.now() + 120_000)).toThrow("expired");
    const revoked = store.issue("other", "owner", Date.now() + 120_000);
    store.revokeSession("owner");
    expect(() => store.renew(revoked.ticket, "owner", Date.now() + 120_000)).toThrow("expired");
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
