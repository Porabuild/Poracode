import { expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { threadReplayEventBytes } from "./threadHistoryReplayBytes";

it("bounds every UTF-16 code unit, including adjacent paired and unpaired surrogates", () => {
  const events: RuntimeEvent[] = [
    {
      type: "content.delta",
      threadId: "t",
      itemId: "i",
      stream: "assistant_text",
      delta: Array.from({ length: 65536 }, (_, code) => String.fromCharCode(code)).join(""),
    },
  ];
  expect(threadReplayEventBytes(events)).toBeGreaterThanOrEqual(
    Buffer.byteLength(JSON.stringify(events)),
  );
});

it("bounds JSON bytes for flat streams including escapes and Unicode without serializing them", () => {
  for (const text of ["ascii", "é界🙂", "\ud800", "\udc00", '\\"\n\t\u0000', "a".repeat(2048)]) {
    const events: RuntimeEvent[] = [
      {
        type: "content.delta",
        threadId: "t",
        itemId: "i",
        stream: "assistant_text",
        delta: text,
        replace: true,
      },
    ];
    const actual = Buffer.byteLength(JSON.stringify(events));
    const stringify = vi.spyOn(JSON, "stringify");
    try {
      const bytes = threadReplayEventBytes(events);
      expect(bytes).toBeGreaterThanOrEqual(actual);
      expect(stringify).not.toHaveBeenCalled();
    } finally {
      stringify.mockRestore();
    }
  }
});

it.each(["ascii", "é界🙂", "a".repeat(2048)])("measures unescaped text exactly (%#)", (text) => {
  const events: RuntimeEvent[] = [
    {
      type: "content.delta",
      threadId: "t",
      itemId: "i",
      stream: "assistant_text",
      delta: text,
    },
  ];
  expect(threadReplayEventBytes(events)).toBe(Buffer.byteLength(JSON.stringify(events)));
});

it("measures structured payloads and custom serialization exactly", () => {
  const events: RuntimeEvent[] = [
    {
      type: "item.started",
      threadId: "t",
      itemId: "i",
      itemType: "assistant_message",
      payload: { content: [{ kind: "text", text: "é\n🙂" }] },
    },
  ];
  expect(threadReplayEventBytes(events)).toBe(Buffer.byteLength(JSON.stringify(events)));
  const custom = Object.assign(events[0]!, { toJSON: () => ({ compact: true }) });
  expect(threadReplayEventBytes([custom])).toBe(Buffer.byteLength(JSON.stringify([custom])));
});
