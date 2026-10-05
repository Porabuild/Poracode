import { describe, expect, it, vi } from "vitest";
import { SubagentTranscript } from "./SubagentTranscript";

// Released eager bookkeeping is the parity oracle, deliberately independent
// of the indexed/lazy representation under test.
class ReleasedTranscript {
  output = "";
  cursorOutput = "";
  cursorOutputEdits: SubagentTranscript["cursorOutputEdits"] = [];
  segments: Array<{
    itemId: string;
    text: string;
    override?: string;
    cursorRanges: Array<{ start: number; end: number }>;
  }> = [];

  append(itemId: string, delta: string) {
    const start = this.cursorOutput.length;
    this.output += delta;
    this.cursorOutput += delta;
    const segment = this.segments.find((entry) => entry.itemId === itemId);
    if (segment) {
      segment.text += delta;
      if (segment.override !== undefined) segment.override += delta;
      const last = segment.cursorRanges.at(-1);
      if (last?.end === start) last.end += delta.length;
      else segment.cursorRanges.push({ start, end: start + delta.length });
    } else {
      this.segments.push({
        itemId,
        text: delta,
        cursorRanges: [{ start, end: start + delta.length }],
      });
    }
  }

  replace(itemId: string, text: string, attemptIndex: number) {
    const segment = this.segments.find((entry) => entry.itemId === itemId);
    if (segment) {
      segment.override = text;
      const key = `${attemptIndex}:${itemId}`;
      this.cursorOutputEdits = this.cursorOutputEdits.filter((edit) => edit.key !== key);
      this.cursorOutputEdits.push(
        ...segment.cursorRanges.map((range) => ({ key, ...range, replacement: text })),
      );
    } else {
      this.segments.push({ itemId, text: "", override: text, cursorRanges: [] });
    }
    this.output = this.displayMessages().join("");
  }

  displayMessages() {
    return this.segments.map((segment) => segment.override ?? segment.text);
  }

  resetAttempt() {
    this.output = "";
    this.segments = [];
  }
}

function inspect(transcript: SubagentTranscript) {
  return transcript as unknown as {
    segments: Array<{ text: string; cursorRanges: unknown[] }>;
    segmentsByItem: Map<string, unknown>;
    projectionSnapshots: Map<unknown, string>;
    editsByItem: Map<string, unknown>;
  };
}

describe("SubagentTranscript", () => {
  it("preserves arrival order after a deferred rewrite and item order on the next rewrite", () => {
    const transcript = new SubagentTranscript();
    transcript.append("first", "a");
    transcript.append("second", "b");
    transcript.append("first", "c");
    expect(transcript.output).toBe("abc");
    transcript.replace("second", "B", 0);
    transcript.append("first", "d");
    transcript.append("third", "e");
    transcript.append("third", "f");
    transcript.append("second", "g");
    expect(transcript.output).toBe("acBdefg");
    expect(transcript.output).toBe("acBdefg");
    expect(transcript.displayMessages()).toEqual(["acd", "Bg", "ef"]);
    transcript.replace("third", "E", 0);
    expect(transcript.output).toBe("acdBgE");
  });

  it("keeps authoritative-only messages out of the raw cursor and appends after suppression", () => {
    const transcript = new SubagentTranscript();
    transcript.replace("before-delta", "payload", 0);
    transcript.replace("suppressed", "", 0);
    transcript.append("before-delta", " tail");
    transcript.append("suppressed", "visible");
    expect(transcript.output).toBe("payload tailvisible");
    expect(transcript.cursorOutput).toBe(" tailvisible");
    expect(transcript.cursorOutputEdits).toEqual([]);
    transcript.replace("before-delta", "rewritten", 0);
    transcript.replace("suppressed", "", 0);
    expect(transcript.output).toBe("rewritten");
    expect(transcript.cursorOutputEdits).toEqual([
      { key: "0:before-delta", start: 0, end: 5, replacement: "rewritten" },
      { key: "0:suppressed", start: 5, end: 12, replacement: "" },
    ]);
    expect(inspect(transcript).segments.map((segment) => segment.text)).toEqual(["rewritten", ""]);
  });

  it.each([1, 100, 1_000])(
    "matches released output, message boundaries and exact cursor edits for %i ids across fallbacks",
    (itemCount) => {
      const transcript = new SubagentTranscript();
      const released = new ReleasedTranscript();
      let seed = 23;
      const random = () => {
        seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
        return seed;
      };
      const parity = () => {
        expect(transcript.output).toBe(released.output);
        expect(transcript.cursorOutput).toBe(released.cursorOutput);
        expect(transcript.cursorOutputEdits).toEqual(released.cursorOutputEdits);
        expect(transcript.displayMessages()).toEqual(released.displayMessages());
      };
      for (let attempt = 0; attempt < 3; attempt += 1) {
        for (let index = 0; index < itemCount; index += 1) {
          const itemId = `item:${index}`;
          transcript.append(itemId, `${index}✅`);
          released.append(itemId, `${index}✅`);
        }
        for (let index = 0; index < 400; index += 1) {
          const id = random() % (itemCount + 2);
          const itemId =
            id === itemCount ? "__proto__" : id === itemCount + 1 ? "constructor" : `item:${id}`;
          const choice = random() % 7;
          const text = choice === 0 ? "" : `text-${index}🎉`;
          if (choice < 3) {
            transcript.replace(itemId, text, attempt);
            released.replace(itemId, text, attempt);
          } else {
            transcript.append(itemId, text);
            released.append(itemId, text);
          }
          // Leave both consecutive rewrites and interleaved appends unread.
          if (index % 19 === 0) parity();
        }
        parity();
        transcript.resetAttempt();
        released.resetAttempt();
        parity();
      }
    },
  );

  it.each([1, 100, 1_000])("uses one indexed segment lookup per write for %i ids", (itemCount) => {
    const transcript = new SubagentTranscript();
    const lookup = vi.spyOn(inspect(transcript).segmentsByItem, "get");
    for (let index = 0; index < itemCount; index += 1) transcript.append(`${index}`, "text");
    transcript.append(`${itemCount - 1}`, "again");
    transcript.replace(`${itemCount - 1}`, "final", 0);
    expect(lookup).toHaveBeenCalledTimes(itemCount + 2);
  });

  it("materializes repeated unread rewrites once, including subsequent interleaved deltas", () => {
    const transcript = new SubagentTranscript();
    for (let index = 0; index < 1_000; index += 1) transcript.append(`${index}`, "text");
    const join = vi.spyOn(Array.prototype, "join");
    let beforeRead: number;
    let afterRead: number;
    let afterRepeat: number;
    let output: string;
    try {
      for (let index = 0; index < 100; index += 1) transcript.replace(`${index}`, "final", 0);
      transcript.append("0", " revisited");
      transcript.append("new", " next");
      transcript.append("new", " tail");
      beforeRead = join.mock.calls.length;
      output = transcript.output;
      afterRead = join.mock.calls.length;
      void transcript.output;
      afterRepeat = join.mock.calls.length;
    } finally {
      join.mockRestore();
    }
    expect(beforeRead).toBe(0);
    expect(afterRead).toBe(1);
    expect(afterRepeat).toBe(1);
    expect(output).toBe("final".repeat(100) + "text".repeat(900) + " revisited next tail");
    expect(inspect(transcript).projectionSnapshots.size).toBe(0);
  });

  it("releases raw segments, indexes and ranges while preserving complete output and cursor corrections", () => {
    const transcript = new SubagentTranscript();
    transcript.append("a", "draft ".repeat(5_000));
    transcript.append("b", "other");
    transcript.append("a", "more draft");
    transcript.replace("a", "final", 0);
    transcript.replace("b", "", 0);
    transcript.append("a", " tail");
    const raw = transcript.cursorOutput;
    const edits = transcript.cursorOutputEdits;
    expect(inspect(transcript).segments).toHaveLength(2);
    expect(inspect(transcript).projectionSnapshots.size).toBe(1);
    transcript.releaseSegments(transcript.output);
    expect(inspect(transcript).segments).toHaveLength(0);
    expect(inspect(transcript).segmentsByItem.size).toBe(0);
    expect(inspect(transcript).projectionSnapshots.size).toBe(0);
    expect(inspect(transcript).editsByItem.size).toBe(0);
    expect(transcript.output).toBe("final tail");
    expect(transcript.cursorOutput).toBe(raw);
    expect(transcript.cursorOutputEdits).toEqual(edits);
    expect(transcript.cursorOutputEdits).toEqual(edits);
  });
});
