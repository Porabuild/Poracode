import { describe, expect, test } from "bun:test";
import type { SessionMessageInfo } from "@opencode/client";
import { turnStartedAt } from "./transcript/items";
import { workingForClockReset, workingForClockTick, workingForElapsedSeconds } from "./workingFor";

const message = (id: string, type: string, created: number) =>
  ({ id, type, time: { created } }) as unknown as SessionMessageInfo;

describe("working-for clock", () => {
  test("a new turn before its assistant message anchors on the user message", () => {
    // Chronological: turn 1 closed by an idle marker, turn 2 is only its user
    // message so far — the live anchor must be that message, not turn 1's
    // last assistant.
    const messages = [
      message("u1", "user", 1_000),
      message("a1", "assistant", 2_000),
      message("i1", "idle", 3_000),
      message("u2", "user", 4_000),
    ];
    expect(turnStartedAt(messages, "a1")).toBe(1_000);
    expect(turnStartedAt(messages, "u2")).toBe(4_000);
    const clock = workingForClockReset(76_000, false);
    expect(workingForElapsedSeconds(clock, turnStartedAt(messages, "u2"))).toBe(72);
  });

  test("pauses bank into the clock and reset with the next run", () => {
    // Turn 1: a pending request freezes the clock for 10s.
    let clock = workingForClockReset(0, false);
    clock = workingForClockTick(clock, 10_000, true);
    clock = workingForClockTick(clock, 20_000, false);
    clock = workingForClockTick(clock, 30_000, false);
    expect(workingForElapsedSeconds(clock, 0)).toBe(20);

    // Turn 2 starts fresh: the old pause must not shrink its elapsed.
    clock = workingForClockReset(40_000, false);
    clock = workingForClockTick(clock, 50_000, false);
    expect(workingForElapsedSeconds(clock, 35_000)).toBe(15);
  });

  test("a request pending at run start freezes from the first tick", () => {
    const clock = workingForClockReset(10_000, true);
    expect(clock.pausedSince).toBe(10_000);
    const ticked = workingForClockTick(clock, 25_000, true);
    // The turn started with the run at 10s; the whole 10s→25s span is paused.
    expect(workingForElapsedSeconds(ticked, 10_000)).toBe(0);
  });
});
