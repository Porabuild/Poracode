import { describe, expect, it } from "vitest";
import { stripInternalHistoryMarkers } from "./terminalHistory";

describe("stripInternalHistoryMarkers", () => {
  it("removes persisted supervisor lifecycle markers from terminal history", () => {
    const history = [
      "[lightcode] 2026-03-21T21:46:17.655Z session start",
      "codex output",
      "[lightcode] 2026-03-21T21:48:00.123Z relaunch",
      "more output",
      "",
    ].join("\n");

    expect(stripInternalHistoryMarkers(history)).toBe(
      ["codex output", "more output", ""].join("\n"),
    );
  });

  it("preserves regular terminal output", () => {
    const history = ["PS C:\\repo> echo hello", "hello", ""].join("\r\n");

    expect(stripInternalHistoryMarkers(history)).toBe(history);
  });
});
