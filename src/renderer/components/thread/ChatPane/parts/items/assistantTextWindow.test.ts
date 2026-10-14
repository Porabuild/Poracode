// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendRuntimeStream,
  replaceRuntimeStream,
} from "@/renderer/state/slices/runtimeStreamRetention";
import { HEAD_CHARS, TAIL_CHARS, elisionNotice } from "@/shared/runtimeStreamRetentionPolicy";
import { earlierAssistantTextPage, latestAssistantTextWindow } from "./assistantTextWindow";
import { PLAIN_TEXT_WINDOW_CHARS } from "./longPlainText";

afterEach(() => vi.restoreAllMocks());

describe("assistant source windows", () => {
  it("maps exact head, notice and tail boundaries without repeating a notice page", () => {
    const stream = replaceRuntimeStream(
      `${"h".repeat(HEAD_CHARS)}${"m".repeat(100)}${"t".repeat(TAIL_CHARS)}`,
    );
    const retention = stream.retention!;
    const origin = retention.headChars + retention.elidedChars;
    expect(latestAssistantTextWindow(stream.text, retention).end).toBe(
      HEAD_CHARS + 100 + TAIL_CHARS,
    );
    const head = earlierAssistantTextPage(stream.text, retention.headChars, retention);
    expect(head.text).toBe("h".repeat(PLAIN_TEXT_WINDOW_CHARS));
    for (const end of [retention.headChars + 1, origin - 1, origin]) {
      const gap = earlierAssistantTextPage(stream.text, end, retention);
      expect(gap.text.endsWith(`${elisionNotice(100)}\n`)).toBe(true);
      expect(gap.text).not.toContain("tt");
      expect(gap.start).toBeLessThan(retention.headChars);
      const beforeGap = earlierAssistantTextPage(stream.text, gap.start, retention);
      expect(beforeGap.end).toBe(gap.start);
      expect(beforeGap.text).toBe("h".repeat(PLAIN_TEXT_WINDOW_CHARS));
    }
    // A visible page beginning within the notice collapses to the end of the
    // head in source space, so the next Earlier skips the already-seen notice.
    const overlapsNotice = earlierAssistantTextPage(
      stream.text,
      origin + PLAIN_TEXT_WINDOW_CHARS - 1,
      retention,
    );
    expect(overlapsNotice.start).toBe(retention.headChars);
    expect(earlierAssistantTextPage(stream.text, overlapsNotice.start, retention).text).toBe(
      head.text,
    );
  });

  it("detaches only the bounded selection through numeric UTF-16 units, preserving pairs and lone units", () => {
    const width = PLAIN_TEXT_WINDOW_CHARS;
    const selected = `🙂${"b".repeat(width - 2)}\ud83d`;
    const source = `${"h".repeat(HEAD_CHARS)}${"m".repeat(100)}${"t".repeat(TAIL_CHARS - selected.length - width)}${selected}${"z".repeat(width)}`;
    const stream = replaceRuntimeStream(source);
    const latest = latestAssistantTextWindow(stream.text, stream.retention);
    const copy = vi.spyOn(String, "fromCharCode");
    const page = earlierAssistantTextPage(stream.text, latest.start, stream.retention);
    expect(page.text).toBe(selected);
    expect(page.text.length).toBe(width + 1);
    expect(copy).toHaveBeenCalledTimes(1);
    const units = copy.mock.calls[0]!;
    expect(units).toHaveLength(width + 1);
    expect(units.every((unit) => typeof unit === "number")).toBe(true);
    expect(Object.values(page.source).every((value) => typeof value === "number")).toBe(true);
    expect(Object.values(page).filter((value) => typeof value === "string")).toEqual([selected]);
  });

  it("keeps consecutive Unicode pages intact when the retained tail origin moves", () => {
    const source = `${"h".repeat(HEAD_CHARS)}${"m".repeat(1_000)}${"🙂界".repeat(Math.ceil(TAIL_CHARS / 3))}`;
    let stream = replaceRuntimeStream(source);
    const latest = latestAssistantTextWindow(stream.text, stream.retention);
    const page = earlierAssistantTextPage(stream.text, latest.start, stream.retention);
    stream = appendRuntimeStream(stream.text, "新🙂", stream.retention);
    const earlier = earlierAssistantTextPage(stream.text, page.start, stream.retention);
    expect(page.text.isWellFormed()).toBe(true);
    expect(earlier.text.isWellFormed()).toBe(true);
    expect(earlier.text.length).toBeLessThanOrEqual(PLAIN_TEXT_WINDOW_CHARS + 1);
    expect(earlier.end).toBe(page.start);
    expect(earlier.text).toBe(source.slice(earlier.start, earlier.end));
  });
});
