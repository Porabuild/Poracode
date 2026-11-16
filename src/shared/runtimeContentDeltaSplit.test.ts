import { describe, expect, it } from "vitest";
import type { RuntimeEvent } from "./contracts";
import { splitContentDelta } from "./runtimeContentDeltaSplit";
import { estimateRuntimeEventBytes } from "./runtimeEventSize";

function delta(text: string, replace?: boolean): RuntimeEvent {
  return {
    type: "content.delta",
    threadId: "thread-1",
    itemId: "item-1",
    stream: "assistant_text",
    delta: text,
    ...(replace === undefined ? {} : { replace }),
  } as RuntimeEvent;
}

function texts(events: readonly RuntimeEvent[]): string[] {
  return events.map((event) => (event.type === "content.delta" ? event.delta : ""));
}

describe("splitContentDelta", () => {
  it("returns events that fit, and non-delta events, unchanged", () => {
    const small = delta("hello");
    const other = { type: "context.updated", threadId: "thread-1" } as unknown as RuntimeEvent;
    expect(splitContentDelta(small, 1_000)).toEqual([small]);
    expect(splitContentDelta(other, 10)).toEqual([other]);
  });

  it("splits a snapshot losslessly: first keeps replace, the rest append", () => {
    const text = '界🙂\\"\nplain ascii '.repeat(40_000);
    const budget = 64 * 1024;
    const fragments = splitContentDelta(delta(text, true), budget);

    expect(fragments.length).toBeGreaterThan(5);
    expect(texts(fragments).join("")).toBe(text);
    expect(fragments[0]).toMatchObject({ replace: true });
    expect(fragments.slice(1).filter((fragment) => "replace" in fragment)).toEqual([]);
    expect(fragments.filter((fragment) => estimateRuntimeEventBytes(fragment) > budget)).toEqual(
      [],
    );
    expect(
      fragments.filter(
        (fragment) =>
          fragment.type !== "content.delta" ||
          fragment.threadId !== "thread-1" ||
          fragment.itemId !== "item-1" ||
          fragment.stream !== "assistant_text",
      ),
    ).toEqual([]);
    const endsInHighSurrogate = texts(fragments).filter((piece) => {
      const last = piece.charCodeAt(piece.length - 1);
      return last >= 0xd800 && last <= 0xdbff;
    });
    expect(endsInHighSurrogate).toEqual([]);
  });

  it("keeps append semantics for every fragment of an append delta", () => {
    const fragments = splitContentDelta(delta("x".repeat(300_000)), 32 * 1024);
    expect(fragments.length).toBeGreaterThan(5);
    expect(fragments.every((fragment) => !("replace" in fragment))).toBe(true);
    expect(texts(fragments).join("")).toBe("x".repeat(300_000));
  });

  it("keeps the event whole when the budget cannot cover its envelope", () => {
    const event = delta("x".repeat(5_000));
    expect(splitContentDelta(event, 150)).toEqual([event]);
  });
});
