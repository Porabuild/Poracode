import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ComputerUseActivityTracker,
  type ComputerUseActivityState,
} from "./ComputerUseActivityTracker";

describe("ComputerUseActivityTracker", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("uses a badge for background sessions and actions", () => {
    let state: ComputerUseActivityState | undefined;
    const tracker = new ComputerUseActivityTracker({
      releaseDelayMs: 100,
      onChange: (next) => {
        state = next;
      },
    });

    tracker.setActivity({ kind: "session", threadId: "one", active: true });
    expect(state).toMatchObject({ level: "badge", escapeEnabled: false });
    tracker.setActivity({
      kind: "action",
      threadId: "one",
      toolName: "click",
      delivery: "background",
      active: true,
    });
    expect(state).toMatchObject({ level: "badge" });
    expect(state?.badgeTarget).toBeUndefined();
    tracker.setActivity({
      kind: "action",
      threadId: "one",
      toolName: "click",
      delivery: "background",
      target: "Notepad",
      active: false,
    });
    vi.advanceTimersByTime(100);
    expect(state?.level).toBe("badge");
    tracker.setActivity({ kind: "session", threadId: "one", active: false });
    expect(state?.level).toBe("hidden");
  });

  it("does not retain a target when a background action is refused", () => {
    let state: ComputerUseActivityState | undefined;
    const tracker = new ComputerUseActivityTracker({
      releaseDelayMs: 100,
      onChange: (next) => {
        state = next;
      },
    });

    tracker.setActivity({ kind: "session", threadId: "one", active: true });
    tracker.setActivity({
      kind: "action",
      threadId: "one",
      toolName: "click",
      delivery: "background",
      active: true,
    });
    tracker.setActivity({
      kind: "action",
      threadId: "one",
      toolName: "click",
      delivery: "background",
      active: false,
    });
    vi.advanceTimersByTime(100);

    expect(state).toMatchObject({ level: "badge" });
    expect(state?.badgeTarget).toBeUndefined();
  });

  it("clears the last target when a session ends", () => {
    let state: ComputerUseActivityState | undefined;
    const tracker = new ComputerUseActivityTracker({
      releaseDelayMs: 100,
      onChange: (next) => {
        state = next;
      },
    });

    tracker.setActivity({ kind: "session", threadId: "one", active: true });
    tracker.setActivity({
      kind: "action",
      threadId: "one",
      toolName: "click",
      delivery: "background",
      active: true,
    });
    tracker.setActivity({
      kind: "action",
      threadId: "one",
      toolName: "click",
      delivery: "background",
      target: "Notepad",
      active: false,
    });
    expect(state?.badgeTarget).toBe("Notepad");

    tracker.setActivity({ kind: "session", threadId: "one", active: false });
    expect(state).toMatchObject({ level: "hidden" });
    expect(state?.badgeTarget).toBeUndefined();

    tracker.setActivity({ kind: "session", threadId: "one", active: true });
    expect(state).toMatchObject({ level: "badge" });
    expect(state?.badgeTarget).toBeUndefined();
  });

  it("promotes foreground calls above background activity through their grace period", () => {
    const states: ComputerUseActivityState[] = [];
    const tracker = new ComputerUseActivityTracker({
      releaseDelayMs: 100,
      onChange: (state) => states.push(state),
    });
    tracker.setActivity({ kind: "session", threadId: "one", active: true });
    tracker.setActivity({
      kind: "action",
      threadId: "one",
      toolName: "click",
      delivery: "foreground",
      active: true,
    });
    expect(states.at(-1)).toMatchObject({ level: "takeover", escapeEnabled: true });
    tracker.setActivity({
      kind: "action",
      threadId: "one",
      toolName: "click",
      delivery: "foreground",
      active: false,
    });
    vi.advanceTimersByTime(99);
    expect(states.at(-1)?.level).toBe("takeover");
    vi.advanceTimersByTime(1);
    expect(states.at(-1)?.level).toBe("badge");
    expect(states.at(-1)?.badgeTarget).toBeUndefined();
  });

  it("suppresses Escape only while a foreground key chord is active", () => {
    const states: ComputerUseActivityState[] = [];
    const tracker = new ComputerUseActivityTracker({
      releaseDelayMs: 100,
      onChange: (state) => states.push(state),
    });

    tracker.setActivity({
      kind: "action",
      threadId: "one",
      toolName: "press_key",
      delivery: "foreground",
      active: true,
    });
    expect(states.at(-1)?.escapeEnabled).toBe(false);
    tracker.setActivity({
      kind: "action",
      threadId: "one",
      toolName: "press_key",
      delivery: "foreground",
      active: false,
    });
    expect(states.at(-1)?.escapeEnabled).toBe(true);
  });
});
