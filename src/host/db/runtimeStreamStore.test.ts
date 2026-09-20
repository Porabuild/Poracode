import { existsSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { HEAD_CHARS, TAIL_CHARS } from "./runtimeStreamCap";
import {
  appendStreamDelta,
  assembleItemStreams,
  readStreamTails,
  streamHasContent,
} from "./runtimeStreamStore";

const serverNativeBinding = join(process.cwd(), "dist", "server-native", "better_sqlite3.node");
let nativeBinding: string | undefined;
let sqliteAvailable = true;
try {
  new Database(":memory:").close();
} catch {
  if (existsSync(serverNativeBinding)) nativeBinding = serverNativeBinding;
  else sqliteAvailable = false;
}

const THREAD = "t1";
const ITEM = "cmd-1";
const STREAM = "command_output";
const NL = String.fromCharCode(10);

describe.skipIf(!sqliteAvailable)("runtime stream chunk store", () => {
  let sqlite: InstanceType<typeof Database>;

  beforeEach(() => {
    sqlite = new Database(":memory:", { ...(nativeBinding ? { nativeBinding } : {}) });
    sqlite.exec(`
      CREATE TABLE thread_runtime_item_stream_chunks (
        thread_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        stream TEXT NOT NULL,
        seq INTEGER NOT NULL,
        chars INTEGER NOT NULL,
        text TEXT NOT NULL,
        PRIMARY KEY (thread_id, item_id, stream, seq)
      );
      CREATE TABLE thread_runtime_item_stream_state (
        thread_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        stream TEXT NOT NULL,
        next_seq INTEGER NOT NULL,
        tail_chars INTEGER NOT NULL,
        elided_chars INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (thread_id, item_id, stream)
      );
    `);
  });

  /** Drive a whole stream through the store the way the writer does. */
  function stream(deltas: readonly string[], itemId = ITEM, streamName = STREAM): string {
    let head = "";
    for (const delta of deltas) {
      const result = appendStreamDelta(sqlite, {
        threadId: THREAD,
        itemId,
        stream: streamName,
        delta,
        head,
      });
      if (result.head !== undefined) head = result.head;
    }
    return head;
  }

  function assemble(head: string, itemId = ITEM, streamName = STREAM): string {
    const tails = readStreamTails(sqlite, THREAD, [itemId]).get(itemId);
    return assembleItemStreams({ [streamName]: head }, tails)[streamName] ?? "";
  }

  function elidedChars(itemId = ITEM, streamName = STREAM): number {
    const row = sqlite
      .prepare(
        `SELECT elided_chars FROM thread_runtime_item_stream_state
         WHERE thread_id = ? AND item_id = ? AND stream = ?`,
      )
      .get(THREAD, itemId, streamName) as { elided_chars: number } | undefined;
    return row ? Number(row.elided_chars) : 0;
  }

  it("keeps short output entirely in the head, with no chunk rows", () => {
    const head = stream(["hello ", "world"]);

    expect(head).toBe("hello world");
    expect(readStreamTails(sqlite, THREAD, [ITEM]).size).toBe(0);
    expect(assemble(head)).toBe("hello world");
  });

  it("reassembles head and tail into the exact original text", () => {
    const parts = Array.from({ length: 40 }, (_, i) => `line ${i} `.repeat(1_000));
    const head = stream(parts);

    expect(head).toHaveLength(HEAD_CHARS);
    expect(elidedChars()).toBe(0);
    expect(assemble(head)).toBe(parts.join(""));
  });

  it("freezes the head once it is full", () => {
    const first = appendStreamDelta(sqlite, {
      threadId: THREAD,
      itemId: ITEM,
      stream: STREAM,
      delta: "z".repeat(HEAD_CHARS + 10),
      head: "",
    });
    expect(first.head).toHaveLength(HEAD_CHARS);

    const second = appendStreamDelta(sqlite, {
      threadId: THREAD,
      itemId: ITEM,
      stream: STREAM,
      delta: "more",
      head: first.head!,
    });
    // No head returned means no item-row rewrite from here on.
    expect(second.head).toBeUndefined();
  });

  it("freezes the head after an astral character crosses its final slot", () => {
    const first = appendStreamDelta(sqlite, {
      threadId: THREAD,
      itemId: ITEM,
      stream: STREAM,
      delta: `${"a".repeat(HEAD_CHARS - 1)}😀`,
      head: "",
    });
    const second = appendStreamDelta(sqlite, {
      threadId: THREAD,
      itemId: ITEM,
      stream: STREAM,
      delta: "more",
      head: first.head!,
    });

    expect(first.head).toHaveLength(HEAD_CHARS + 1);
    expect(second.head).toBeUndefined();
  });

  it("trims the oldest chunks and reports what was dropped", () => {
    const head = stream(["START", "q".repeat(TAIL_CHARS + HEAD_CHARS + 500_000), "END"]);

    const text = assemble(head);
    expect(text.startsWith("START")).toBe(true);
    expect(text.endsWith("END")).toBe(true);
    expect(text).toContain("poracode elided");
    expect(text.length).toBeLessThanOrEqual(HEAD_CHARS + TAIL_CHARS + 300_000);
    expect(elidedChars()).toBeGreaterThan(0);
  });

  it("puts the elision notice on its own line between whole lines", () => {
    const logLine = (i: number) =>
      `2026-08-27T07:00:00.000Z INFO build step ${String(i).padStart(6, "0")} ok`;
    const log = Array.from({ length: 200_000 }, (_, i) => logLine(i)).join(NL) + NL;
    const head = stream([log]);

    const text = assemble(head);
    const lines = text.split(NL);
    const noticeIndex = lines.findIndex((l) => l.includes("poracode elided"));

    expect(noticeIndex).toBeGreaterThan(0);
    // The notice occupies a whole line, and its neighbours are intact log lines.
    expect(lines[noticeIndex]!.startsWith("[... poracode elided")).toBe(true);
    expect(lines[noticeIndex]!.endsWith("...]")).toBe(true);
    expect(lines[noticeIndex - 1]).toMatch(/^2026-08-27T07:00:00\.000Z INFO build step \d{6} ok$/);
    expect(lines[noticeIndex + 1]).toMatch(/^2026-08-27T07:00:00\.000Z INFO build step \d{6} ok$/);
  });

  it("keeps single-line output readable when it has to be trimmed", () => {
    // No line breaks anywhere: alignment must not throw the content away.
    const head = stream(["A".repeat(HEAD_CHARS + TAIL_CHARS + 400_000) + "Z"]);

    const text = assemble(head);

    expect(text.startsWith("A")).toBe(true);
    expect(text.endsWith("Z")).toBe(true);
    expect(text).toContain("poracode elided");
  });

  it("keeps its bookkeeping consistent with the rows it retains", () => {
    stream(["p".repeat(HEAD_CHARS + TAIL_CHARS + 700_000)]);

    const state = sqlite
      .prepare(
        `SELECT next_seq, tail_chars, elided_chars FROM thread_runtime_item_stream_state
         WHERE thread_id = ? AND item_id = ? AND stream = ?`,
      )
      .get(THREAD, ITEM, STREAM) as {
      next_seq: number;
      tail_chars: number;
      elided_chars: number;
    };
    const actual = sqlite
      .prepare(
        `SELECT COUNT(*) AS rows, COALESCE(SUM(chars), 0) AS chars, COALESCE(SUM(LENGTH(text)), 0) AS textChars
         FROM thread_runtime_item_stream_chunks WHERE thread_id = ? AND item_id = ? AND stream = ?`,
      )
      .get(THREAD, ITEM, STREAM) as { rows: number; chars: number; textChars: number };

    expect(Number(actual.chars)).toBe(Number(actual.textChars));
    expect(state.tail_chars).toBe(Number(actual.chars));
    expect(state.elided_chars + state.tail_chars + HEAD_CHARS).toBe(
      HEAD_CHARS + TAIL_CHARS + 700_000,
    );
  });

  it("splits one oversized delta so the retention window still applies", () => {
    const head = stream(["x".repeat(HEAD_CHARS + TAIL_CHARS * 2)]);

    const rows = sqlite
      .prepare("SELECT chars FROM thread_runtime_item_stream_chunks")
      .all() as Array<{ chars: number }>;
    expect(rows.length).toBeGreaterThan(1);
    expect(Math.max(...rows.map((r) => Number(r.chars)))).toBeLessThanOrEqual(256_000);
    expect(assemble(head).length).toBeLessThanOrEqual(HEAD_CHARS + TAIL_CHARS + 300_000);
  });

  it("does not split surrogate pairs at head or chunk boundaries", () => {
    const source = `${"a".repeat(HEAD_CHARS - 1)}😀${"b".repeat(256_000 - 1)}😀tail`;
    const head = stream([source]);

    expect(assemble(head)).toBe(source);
    expect(assemble(head)).not.toContain("�");
  });

  it("keeps separate streams on the same item independent", () => {
    stream(["a".repeat(HEAD_CHARS + 1_000)], ITEM, "command_output");
    stream(["thinking"], ITEM, "reasoning_text");

    const tails = readStreamTails(sqlite, THREAD, [ITEM]).get(ITEM)!;
    expect(tails.text.command_output).toHaveLength(1_000);
    expect(tails.text.reasoning_text).toBeUndefined();
  });

  it("reports whether a stream holds content across head and chunks", () => {
    const blankHead = " ".repeat(HEAD_CHARS);
    appendStreamDelta(sqlite, {
      threadId: THREAD,
      itemId: ITEM,
      stream: STREAM,
      delta: blankHead + "   ",
      head: "",
    });
    expect(streamHasContent(sqlite, THREAD, ITEM, STREAM, blankHead)).toBe(false);

    appendStreamDelta(sqlite, {
      threadId: THREAD,
      itemId: ITEM,
      stream: STREAM,
      delta: "real output",
      head: blankHead,
    });
    expect(streamHasContent(sqlite, THREAD, ITEM, STREAM, blankHead)).toBe(true);
  });

  it("treats all JavaScript whitespace in chunks as blank", () => {
    const blankHead = " ".repeat(HEAD_CHARS);
    appendStreamDelta(sqlite, {
      threadId: THREAD,
      itemId: ITEM,
      stream: STREAM,
      delta: `${blankHead}\t\n\u00a0`,
      head: "",
    });

    expect(streamHasContent(sqlite, THREAD, ITEM, STREAM, blankHead)).toBe(false);
  });

  it("returns the head unchanged when there is nothing appended", () => {
    const head = { assistant_text: "done" };
    expect(assembleItemStreams(head, undefined)).toBe(head);
  });
});
