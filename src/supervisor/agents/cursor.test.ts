import { describe, expect, it } from "vitest";
import {
  detectCursorInvalidSessionRef,
  detectCursorTerminalStatus,
  parseCursorSessionIds,
} from "./cursor";

describe("parseCursorSessionIds", () => {
  it("extracts thread ids from cursor-agent ls output", () => {
    const output = [
      "Threads",
      "1. chat_019d6099-45a3-7962-a595-2d7f59276118 Fix flaky tests",
      "2. 019d60aa-1234-5678-9abc-def012345678 Implement Cursor CLI support",
    ].join("\n");

    expect(parseCursorSessionIds(output)).toEqual([
      "chat_019d6099-45a3-7962-a595-2d7f59276118",
      "019d60aa-1234-5678-9abc-def012345678",
    ]);
  });

  it("ignores date and time columns", () => {
    const output =
      "2026-04-05  12:04  chat_019d6099-45a3-7962-a595-2d7f59276118  Resume thread";
    expect(parseCursorSessionIds(output)).toEqual(["chat_019d6099-45a3-7962-a595-2d7f59276118"]);
  });
});

describe("detectCursorTerminalStatus", () => {
  it("detects approval prompts", () => {
    expect(detectCursorTerminalStatus("Allow cursor-agent to run git status? [y/n]")).toEqual({
      status: "needs_approval",
      attention: "needs_approval",
      corroborated: true,
    });
  });

  it("detects selection prompts", () => {
    expect(
      detectCursorTerminalStatus("Pick a thread\nEnter to select · ↑/↓ to navigate · Esc to cancel"),
    ).toEqual({
      status: "needs_reply",
      attention: "needs_reply",
      corroborated: true,
    });
  });

  it("detects working state", () => {
    expect(
      detectCursorTerminalStatus("Thinking about the next edit...\nEsc to interrupt"),
    ).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("detects idle state from the composer prompt", () => {
    expect(detectCursorTerminalStatus("> Type a message")).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
  });
});

describe("detectCursorInvalidSessionRef", () => {
  it("detects stale resume ids", () => {
    expect(
      detectCursorInvalidSessionRef(
        "Could not find conversation chat_019d6099-45a3-7962-a595-2d7f59276118 to resume.",
      ),
    ).toBe(true);
  });

  it("ignores unrelated output", () => {
    expect(detectCursorInvalidSessionRef("Ready for your next request.")).toBe(false);
  });
});
