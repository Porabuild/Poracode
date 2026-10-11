import { expect, it } from "vitest";
import { reconcileTerminalRange } from "./terminalRange";

function output(data: string, fromCursor: number, generation = "pty-a") {
  return {
    version: 1 as const,
    watchId: "watch-a",
    generation,
    fromCursor,
    toCursor: fromCursor + data.length,
  };
}

it("appends contiguous live output after the authoritative snapshot", () => {
  expect(
    reconcileTerminalRange({ generation: "pty-a", cursor: 7 }, "next", output("next", 7)),
  ).toEqual({ kind: "append", data: "next", toCursor: 11 });
});

it("trims output already included by a snapshot even across Unicode text", () => {
  // The snapshot contains A + the emoji (three UTF-16 units). Only B is new.
  const data = "A😀B";
  expect(
    reconcileTerminalRange({ generation: "pty-a", cursor: 13 }, data, output(data, 10)),
  ).toEqual({ kind: "append", data: "B", toCursor: 14 });
});

it("drops a frame fully covered by the snapshot instead of duplicating text", () => {
  expect(
    reconcileTerminalRange({ generation: "pty-a", cursor: 14 }, "old", output("old", 10)),
  ).toEqual({ kind: "duplicate" });
});

it("requires a new snapshot after a gap instead of joining unrelated ranges", () => {
  expect(
    reconcileTerminalRange({ generation: "pty-a", cursor: 7 }, "later", output("later", 9)),
  ).toEqual({ kind: "resync", reason: "gap" });
});

it("never appends another process generation to the current transcript", () => {
  expect(
    reconcileTerminalRange({ generation: "pty-a", cursor: 7 }, "new", output("new", 7, "pty-b")),
  ).toEqual({ kind: "resync", reason: "generation" });
});

it("treats a null snapshot generation as replace-only", () => {
  expect(reconcileTerminalRange({ generation: null, cursor: 7 }, "new", output("new", 7))).toEqual({
    kind: "resync",
    reason: "generation",
  });
});
