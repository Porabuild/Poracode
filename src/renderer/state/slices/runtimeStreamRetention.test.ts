// @vitest-environment node

import { describe, expect, it } from "vitest";
import { HEAD_CHARS, TAIL_CHARS, elisionNotice } from "@/shared/runtimeStreamRetentionPolicy";
import { joinWithElision } from "@/host/db/runtimeStreamCap";
import {
  HYDRATED_STREAM_HEAD_CHARS,
  appendRuntimeStream,
  hydrateRuntimeStream,
  replaceRuntimeStream,
  type RetainedRuntimeStream,
} from "./runtimeStreamRetention";

const LIVE_SOURCE_BUDGET = HEAD_CHARS + TAIL_CHARS;

function sourceParts(stream: RetainedRuntimeStream): { head: string; tail: string } {
  const retention = stream.retention;
  if (!retention || retention.elidedChars === 0) return { head: "", tail: stream.text };
  return {
    head: stream.text.slice(0, retention.headChars),
    tail: stream.text.slice(retention.tailStart),
  };
}

function expectBound(stream: RetainedRuntimeStream, headLimit = HEAD_CHARS): void {
  expect(stream.text.length).toBeLessThanOrEqual(headLimit + TAIL_CHARS + 128);
  expect(Object.values(stream.retention ?? {}).every((value) => typeof value === "number")).toBe(
    true,
  );
  const { head, tail } =
    (stream.retention?.elidedChars ?? 0) > 0 ? sourceParts(stream) : { head: "", tail: "" };
  expect(head.length).toBeLessThanOrEqual(headLimit);
  expect(tail.length).toBeLessThanOrEqual(TAIL_CHARS);
}

describe("runtime stream retention", () => {
  it("preserves all under-budget source text, including literal notices and lone surrogates", () => {
    const examples = ["", "small\r\ntext", `before\n${elisionNotice(123)}\nafter`, "\ud83d"];
    for (const text of examples) {
      const replaced = replaceRuntimeStream(text);
      expect(replaced.text).toBe(text);
      expect(replaced.retention?.replacementRevision).toBe(1);
      expect(replaced.retention?.elidedChars).toBe(0);
      expect(hydrateRuntimeStream(text).text).toBe(text);
    }
    const text = "x".repeat(LIVE_SOURCE_BUDGET);
    expect(replaceRuntimeStream(text).text).toBe(text);
    expect(hydrateRuntimeStream(text).text).toBe(text);
    expect(appendRuntimeStream(text.slice(0, -1), "x")).toEqual({ text });
  });

  it("caps one enormous replacement with the first head and latest tail", () => {
    const head = "H".repeat(HEAD_CHARS);
    const tail = "T".repeat(TAIL_CHARS);
    const stream = replaceRuntimeStream(`${head}${"m".repeat(LIVE_SOURCE_BUDGET * 2)}${tail}`);
    expectBound(stream);
    expect(sourceParts(stream)).toEqual({ head, tail });
    expect(stream.retention?.elidedChars).toBe(LIVE_SOURCE_BUDGET * 2);
    expect(stream.text).toBe(`${head}\n${elisionNotice(LIVE_SOURCE_BUDGET * 2)}\n${tail}`);
  });

  it("keeps repeated enormous appends bounded and accounts for every removed source unit", () => {
    let stream = replaceRuntimeStream("START\n");
    let sourceChars = stream.text.length;
    const body = "x".repeat(LIVE_SOURCE_BUDGET * 2);
    for (let index = 0; index < 8; index += 1) {
      const delta = `${body}\nLATEST-${index}`;
      sourceChars += delta.length;
      stream = appendRuntimeStream(stream.text, delta, stream.retention);
      expectBound(stream);
      expect(stream.text.startsWith("START\n")).toBe(true);
      expect(stream.text.endsWith(`LATEST-${index}`)).toBe(true);
      const parts = sourceParts(stream);
      expect(parts.tail).toBe(delta.slice(-TAIL_CHARS));
      expect(stream.retention?.elidedChars).toBe(
        sourceChars - parts.head.length - parts.tail.length,
      );
      expect(stream.text.match(/\[\.\.\. poracode elided /g)).toHaveLength(1);
    }
  });

  it("continues many small deltas after capping without accumulating notice characters", () => {
    const initial = "h".repeat(HEAD_CHARS) + "a".repeat(TAIL_CHARS + 7);
    let stream = replaceRuntimeStream(initial);
    let sourceChars = initial.length;
    for (let index = 0; index < 32; index += 1) {
      const delta = String(index % 10);
      sourceChars += delta.length;
      stream = appendRuntimeStream(stream.text, delta, stream.retention);
      expectBound(stream);
      expect(stream.retention?.elidedChars).toBe(sourceChars - LIVE_SOURCE_BUDGET);
    }
    expect(stream.text.endsWith("01234567890123456789012345678901")).toBe(true);
  });

  it("never trims partial lines silently around the local gap", () => {
    const head = `first\n${"h".repeat(HEAD_CHARS - 6)}`;
    const tail = `partial\n${"t".repeat(TAIL_CHARS - 8)}`;
    const stream = replaceRuntimeStream(`${head}lost${tail}`);
    expect(sourceParts(stream)).toEqual({ head, tail });
    expect(stream.retention?.elidedChars).toBe(4);
    expect(stream.text).toBe(`${head}\n${elisionNotice(4)}\n${tail}`);
  });

  it("treats notice-looking raw text as source content without parsing its count", () => {
    const literal = `${elisionNotice(9_999_999)}\n`;
    const head = literal + "h".repeat(HEAD_CHARS - literal.length);
    const stream = replaceRuntimeStream(`${head}${"m".repeat(25)}${"t".repeat(TAIL_CHARS)}`);
    expect(stream.text.startsWith(literal)).toBe(true);
    expect(stream.retention?.elidedChars).toBe(25);
    expect(stream.text.match(/\[\.\.\. poracode elided /g)).toHaveLength(2);
  });

  it("excludes both halves of a surrogate pair at the retained head boundary", () => {
    const source = `${"h".repeat(HEAD_CHARS - 1)}😀${"t".repeat(TAIL_CHARS + 25)}`;
    const stream = replaceRuntimeStream(source);
    const { head, tail } = sourceParts(stream);
    expect(head).toBe("h".repeat(HEAD_CHARS - 1));
    expect(tail).toBe("t".repeat(TAIL_CHARS));
    expect(stream.retention?.elidedChars).toBe(source.length - head.length - tail.length);
    expect(stream.text.isWellFormed()).toBe(true);
    expectBound(stream);
  });

  it("excludes both halves of a surrogate pair at the retained tail boundary", () => {
    const source = `${"h".repeat(HEAD_CHARS)}${"m".repeat(19)}😀${"t".repeat(TAIL_CHARS - 1)}`;
    const stream = replaceRuntimeStream(source);
    expect(sourceParts(stream).tail).toBe("t".repeat(TAIL_CHARS - 1));
    expect(stream.retention?.elidedChars).toBe(21);
    expect(stream.text.isWellFormed()).toBe(true);
    expectBound(stream);
  });

  it("recognizes a surrogate pair split between uncapped append inputs", () => {
    const first = `${"h".repeat(HEAD_CHARS - 1)}\ud83d`;
    const delta = `\ude00${"t".repeat(TAIL_CHARS + 3)}`;
    const stream = appendRuntimeStream(first, delta);
    const replaced = replaceRuntimeStream(first + delta);
    expect(stream.text).toBe(replaced.text);
    expect(stream.retention?.elidedChars).toBe(replaced.retention?.elidedChars);
    expect(stream.text.isWellFormed()).toBe(true);
  });

  it("keeps a split surrogate at the live end and drops both halves when it reaches the gap", () => {
    const first = `${"h".repeat(HEAD_CHARS)}${"m".repeat(TAIL_CHARS + 3)}\ud83d`;
    const stream = replaceRuntimeStream(first);
    expect(stream.text.endsWith("\ud83d")).toBe(true);
    const joined = appendRuntimeStream(stream.text, "\ude00", stream.retention);
    expect(joined.text.endsWith("😀")).toBe(true);
    expect(joined.text.isWellFormed()).toBe(true);

    const delta = `\ude00${"t".repeat(TAIL_CHARS - 1)}`;
    const trimmed = appendRuntimeStream(stream.text, delta, stream.retention);
    expect(sourceParts(trimmed).tail).toBe("t".repeat(TAIL_CHARS - 1));
    expect(trimmed.retention?.elidedChars).toBe(
      first.length + delta.length - LIVE_SOURCE_BUDGET + 1,
    );
    expect(trimmed.text.isWellFormed()).toBe(true);
  });

  it("keeps empty appends and already-retained hydration idempotent", () => {
    const stream = replaceRuntimeStream("x".repeat(LIVE_SOURCE_BUDGET + 1));
    const empty = appendRuntimeStream(stream.text, "", stream.retention);
    expect(empty.text).toBe(stream.text);
    expect(empty.retention).toBe(stream.retention);
    const hydrated = hydrateRuntimeStream(stream.text, stream.retention);
    expect(hydrated.text).toBe(stream.text);
    expect(hydrated.retention).toBe(stream.retention);
    expect(appendRuntimeStream("", "")).toEqual({ text: "" });
  });

  it("resets prior gaps and hydration allowance on replacement, including empty replacement", () => {
    const hydrated = hydrateRuntimeStream("h".repeat(LIVE_SOURCE_BUDGET + 128));
    const capped = appendRuntimeStream(hydrated.text, "new", hydrated.retention);
    expect(capped.retention?.elidedChars).toBeGreaterThan(0);
    const empty = replaceRuntimeStream("", capped.retention);
    expect(empty.text).toBe("");
    expect(empty.retention).toEqual({
      headLimit: HEAD_CHARS,
      headChars: 0,
      tailStart: 0,
      elidedChars: 0,
      replacementRevision: 1,
    });
    const short = replaceRuntimeStream("replacement", empty.retention);
    expect(short.text).toBe("replacement");
    expect(short.retention?.replacementRevision).toBe(2);
    const replaced = replaceRuntimeStream("r".repeat(LIVE_SOURCE_BUDGET + 10), short.retention);
    expect(replaced.retention?.headLimit).toBe(HEAD_CHARS);
    expect(replaced.retention?.elidedChars).toBe(10);
    const next = appendRuntimeStream(replaced.text, "after", replaced.retention);
    expect(next.retention?.elidedChars).toBe(15);
    expect(next.text.endsWith("after")).toBe(true);
    expect(next.retention?.replacementRevision).toBe(3);
  });

  it("preserves the replacement epoch through identical replaces, appends, first cap and hydration", () => {
    let stream = replaceRuntimeStream("same prefix");
    stream = replaceRuntimeStream(stream.text, stream.retention);
    expect(stream.retention?.replacementRevision).toBe(2);
    stream = appendRuntimeStream(stream.text, "x".repeat(LIVE_SOURCE_BUDGET), stream.retention);
    expect(stream.retention?.replacementRevision).toBe(2);
    expectBound(stream);
    stream = appendRuntimeStream(stream.text, "later", stream.retention);
    expect(stream.retention?.replacementRevision).toBe(2);
    expect(hydrateRuntimeStream(stream.text, stream.retention).retention).toBe(stream.retention);

    const legacy = hydrateRuntimeStream("old history");
    expect(legacy.retention?.replacementRevision ?? 0).toBe(0);
    expect(
      replaceRuntimeStream("old history", legacy.retention).retention?.replacementRevision,
    ).toBe(1);
  });

  it("preserves a host notice verbatim and reports subsequent loss in a separate local gap", () => {
    // The host may retain one extra head unit to avoid splitting a surrogate.
    const hostHead = `${"h".repeat(HEAD_CHARS - 1)}😀`;
    const hostCount = 987_654;
    const seed = joinWithElision(hostHead, "t".repeat(TAIL_CHARS), hostCount);
    const hydrated = hydrateRuntimeStream(seed);
    expect(hydrated.text).toBe(seed);
    expect(hydrated.retention?.headLimit).toBe(HYDRATED_STREAM_HEAD_CHARS);
    const delta = `${"n".repeat(TAIL_CHARS)}LATEST`;
    const appended = appendRuntimeStream(hydrated.text, delta, hydrated.retention);
    expectBound(appended, HYDRATED_STREAM_HEAD_CHARS);
    expect(appended.text.startsWith(seed.slice(0, HYDRATED_STREAM_HEAD_CHARS))).toBe(true);
    expect(appended.text).toContain(elisionNotice(hostCount));
    expect(appended.text.match(/\[\.\.\. poracode elided /g)).toHaveLength(2);
    expect(appended.retention?.elidedChars).toBe(
      seed.length + delta.length - HYDRATED_STREAM_HEAD_CHARS - TAIL_CHARS,
    );
    expect(appended.text.endsWith("LATEST")).toBe(true);
    expect(appended.text.isWellFormed()).toBe(true);

    const resumed = hydrateRuntimeStream(appended.text, appended.retention);
    const continued = appendRuntimeStream(resumed.text, "!", resumed.retention);
    expect(continued.text).toContain(elisionNotice(hostCount));
    expect(continued.retention?.elidedChars).toBe(appended.retention!.elidedChars + 1);
    expect(continued.text.match(/\[\.\.\. poracode elided /g)).toHaveLength(2);
  });

  it("protects a host notice after line-aligned short heads without interpreting literal notices", () => {
    const hostHead = `first\n${"partial".repeat(Math.floor((HEAD_CHARS - 6) / 7))}`;
    const seed = joinWithElision(hostHead, `partial\n${"t".repeat(TAIL_CHARS - 8)}`, 42);
    expect(seed.startsWith(`first\n${elisionNotice(42)}\n`)).toBe(true);
    const hydrated = hydrateRuntimeStream(seed);
    const appended = appendRuntimeStream(
      hydrated.text,
      "x".repeat(TAIL_CHARS + 1),
      hydrated.retention,
    );
    expect(appended.text.startsWith(`first\n${elisionNotice(42)}\n`)).toBe(true);
    expectBound(appended, HYDRATED_STREAM_HEAD_CHARS);
  });

  it("bounds an oversized legacy hydrated value without requiring a host marker", () => {
    const source = `BEGIN${"x".repeat(LIVE_SOURCE_BUDGET * 3)}END`;
    const hydrated = hydrateRuntimeStream(source);
    expectBound(hydrated, HYDRATED_STREAM_HEAD_CHARS);
    expect(hydrated.text.startsWith("BEGIN")).toBe(true);
    expect(hydrated.text.endsWith("END")).toBe(true);
    expect(hydrated.retention?.elidedChars).toBe(
      source.length - HYDRATED_STREAM_HEAD_CHARS - TAIL_CHARS,
    );
  });
});
