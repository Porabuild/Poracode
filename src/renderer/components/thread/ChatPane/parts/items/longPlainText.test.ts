import { describe, expect, it } from "vitest";
import { inspectPlainStream, plainTextWindow } from "./longPlainText";

describe("long plain stream inspection", () => {
  it("switches at the window threshold and checks only appended content", () => {
    const short = "a".repeat(8_100);
    const before = inspectPlainStream(short, null, true);
    expect(before.plain).toBe(false);

    const full = `${short}${"b".repeat(200)}`;
    const ready = inspectPlainStream(full, before, true);
    expect(ready.plain).toBe(true);
    expect(inspectPlainStream(`${full} more plain text`, ready, true).plain).toBe(true);
    expect(inspectPlainStream(`${full} *formatted*`, ready, true).plain).toBe(false);
  });

  it("rechecks replacements and completed content", () => {
    const plain = "a".repeat(9_000);
    const previous = inspectPlainStream(plain, null, true);
    expect(inspectPlainStream(`${"a".repeat(8_999)}*`, previous, true).plain).toBe(false);
    expect(
      inspectPlainStream(`${"a".repeat(4_500)}*${"a".repeat(4_500)}`, previous, false).plain,
    ).toBe(false);

    const nearBoundary = inspectPlainStream("a".repeat(32_760), null, true);
    const changedMiddle = `${"a".repeat(12_000)}*${"a".repeat(20_769)}`;
    expect(inspectPlainStream(changedMiddle, nearBoundary, true).plain).toBe(false);
  });

  it("keeps astral characters whole at a page boundary", () => {
    const source = `🙂${"a".repeat(8_191)}`;
    const window = plainTextWindow(source, source.length);
    expect(window.start).toBe(0);
    expect(window.text).toBe(source);
  });
});
