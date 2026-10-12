import { describe, expect, it } from "vitest";
import {
  ONE_SHOT_STDERR_PENDING_CHARS,
  ONE_SHOT_STDERR_TAIL_CHARS,
  OneShotStderrTail,
} from "./oneShotStderrTail";

describe("one-shot diagnostic retention", () => {
  it.each([
    ["small fragments", Array.from({ length: 3000 }, (_, i) => `${i}:诊断🙂\n`)],
    ["large single chunk", ["x".repeat(4 * 1024 * 1024) + " failure\n"]],
    ["surrogate slice boundary", ["\uD83D\uDE42" + "z".repeat(1999)]],
    ["trailing whitespace", ["before", "\n".repeat(2500)]],
    ["empty chunks", ["", "", "ok"]],
  ])("preserves the released terminal tail for %s", (_name, chunks) => {
    const tail = new OneShotStderrTail();
    for (const chunk of chunks) {
      tail.append(Buffer.from(chunk));
      expect(tail.retainedCodeUnits).toBeLessThanOrEqual(ONE_SHOT_STDERR_TAIL_CHARS);
      expect(tail.retainedSourceCodeUnits).toBeLessThan(
        ONE_SHOT_STDERR_PENDING_CHARS + ONE_SHOT_STDERR_TAIL_CHARS,
      );
      expect(tail.retainedFragments).toBeLessThanOrEqual(ONE_SHOT_STDERR_PENDING_CHARS);
    }
    expect(tail.consume()).toBe(chunks.join("").slice(-2000).trim());
    expect(tail.retainedCodeUnits).toBe(0);
    expect(tail.consume()).toBe("");
  });

  it("bounds cumulative multi-MiB diagnostics and releases the consumed suffix", () => {
    const tail = new OneShotStderrTail();
    const chunk = "diagnostic\n".repeat(6000);
    for (let i = 0; i < 512; i++) tail.append(Buffer.from(chunk));
    expect(tail.retainedCodeUnits).toBe(2000);
    expect(tail.consume()).toBe(chunk.slice(-2000).trim());
    expect(tail.retainedCodeUnits).toBe(0);
    tail.append(Buffer.from("new child diagnostic"));
    expect(tail.consume()).toBe("new child diagnostic");
  });

  it.each([
    ["split UTF-8 code point", [Buffer.from([0xf0, 0x9f]), Buffer.from([0x99, 0x82])]],
    [
      "malformed and incomplete UTF-8",
      [Buffer.from([0x61, 0xc0, 0xaf, 0xe2]), Buffer.from([0x82, 0xac, 0xed, 0xa0, 0x80, 0xff])],
    ],
    ["whitespace only", [Buffer.from(" \t\r\n\uFEFF\u2003")]],
    ["empty failure diagnostic", [Buffer.alloc(0)]],
    ["failure whitespace", [Buffer.from("\n  failure\t"), Buffer.from(" \r\n")]],
    [
      "half surrogate after an oversized decode",
      [Buffer.from("x".repeat(ONE_SHOT_STDERR_PENDING_CHARS) + "🙂" + "z".repeat(1999))],
    ],
    [
      "half surrogate across retained fragments",
      [Buffer.from("prefix".repeat(6000)), Buffer.from("🙂"), Buffer.from("z".repeat(1999))],
    ],
  ])("matches per-Buffer decoding and final slice/trim for %s", (_name, chunks) => {
    const tail = new OneShotStderrTail();
    for (const chunk of chunks) tail.append(chunk);
    expect(tail.consume()).toBe(
      chunks
        .map((chunk) => chunk.toString())
        .join("")
        .slice(-ONE_SHOT_STDERR_TAIL_CHARS)
        .trim(),
    );
    expect(tail.retainedSourceCodeUnits).toBe(0);
    expect(tail.retainedFragments).toBe(0);
  });

  it("compacts only the needed suffix and releases the old fragment array", () => {
    const tail = new OneShotStderrTail();
    const chunk = Buffer.alloc(64, 120);
    for (let i = 0; i < ONE_SHOT_STDERR_PENDING_CHARS / chunk.length; i++) tail.append(chunk);
    // Only the needed 32 fragments are joined; the owned copy drops the prefix.
    expect(tail.retainedCodeUnits).toBe(2000);
    expect(tail.retainedSourceCodeUnits).toBe(2000);
    expect(tail.retainedFragments).toBe(1);
    expect(tail.consume()).toBe("x".repeat(2000));
  });

  it("charges partial prefixes and compacts a nearly-full prefix once", () => {
    const tail = new OneShotStderrTail();
    tail.append(Buffer.alloc(ONE_SHOT_STDERR_PENDING_CHARS - 1, 120));
    expect(tail.retainedSourceCodeUnits).toBe(ONE_SHOT_STDERR_PENDING_CHARS - 1);
    tail.append(Buffer.from("y"));
    expect(tail.retainedSourceCodeUnits).toBe(2000);
    expect(tail.retainedFragments).toBe(1);
    for (let i = 0; i < 1999; i++) tail.append(Buffer.from("z"));
    expect(tail.retainedSourceCodeUnits).toBe(3999);
    expect(tail.retainedFragments).toBe(2000);
    expect(tail.consume()).toBe("y" + "z".repeat(1999));
  });

  it("bounds one-unit fragments, ignores empty writes, and resets for reuse", () => {
    const tail = new OneShotStderrTail();
    const chunk = Buffer.from("x");
    const empty = Buffer.alloc(0);
    for (let i = 0; i < ONE_SHOT_STDERR_PENDING_CHARS - 1; i++) {
      tail.append(chunk);
      tail.append(empty);
    }
    expect(tail.retainedSourceCodeUnits).toBe(ONE_SHOT_STDERR_PENDING_CHARS - 1);
    expect(tail.retainedFragments).toBe(ONE_SHOT_STDERR_PENDING_CHARS - 1);
    tail.append(chunk);
    expect(tail.retainedSourceCodeUnits).toBe(2000);
    expect(tail.retainedFragments).toBe(1);
    for (let i = 0; i < ONE_SHOT_STDERR_PENDING_CHARS - 1; i++) {
      tail.append(chunk);
      tail.append(empty);
    }
    // The suffix and the full pending window have independent source/count charges.
    expect(tail.retainedSourceCodeUnits).toBe(
      ONE_SHOT_STDERR_PENDING_CHARS + ONE_SHOT_STDERR_TAIL_CHARS - 1,
    );
    expect(tail.retainedFragments).toBe(ONE_SHOT_STDERR_PENDING_CHARS);
    tail.append(chunk);
    expect(tail.retainedSourceCodeUnits).toBe(2000);
    expect(tail.retainedFragments).toBe(1);
    expect(tail.consume()).toBe("x".repeat(2000));
    expect(tail.consume()).toBe("");
    expect(tail.retainedCodeUnits).toBe(0);
    expect(tail.retainedSourceCodeUnits).toBe(0);
    expect(tail.retainedFragments).toBe(0);
    tail.append(Buffer.from("new diagnostic"));
    expect(tail.consume()).toBe("new diagnostic");
  });

  it("bounds decoded UTF-16 units rather than input bytes", () => {
    const tail = new OneShotStderrTail();
    const chunk = Buffer.from("诊".repeat(20000));
    expect(chunk.length).toBeGreaterThan(ONE_SHOT_STDERR_PENDING_CHARS);
    tail.append(chunk);
    expect(tail.retainedSourceCodeUnits).toBe(20000);
    expect(tail.retainedFragments).toBe(1);
    tail.append(chunk);
    expect(tail.retainedSourceCodeUnits).toBe(2000);
    expect(tail.retainedFragments).toBe(1);
    expect(tail.consume()).toBe("诊".repeat(2000));
  });

  it.each([1999, 2000, 2001, 32767, 32768, 32769])(
    "replaces prior evidence and stays bounded at the %i-unit boundary",
    (length) => {
      const tail = new OneShotStderrTail();
      const chunks = [
        Buffer.from("old diagnostic"),
        Buffer.alloc(length, 120),
        Buffer.from(" end\n"),
      ];
      for (const chunk of chunks) {
        tail.append(chunk);
        expect(tail.retainedSourceCodeUnits).toBeLessThan(
          ONE_SHOT_STDERR_PENDING_CHARS + ONE_SHOT_STDERR_TAIL_CHARS,
        );
        expect(tail.retainedFragments).toBeLessThanOrEqual(ONE_SHOT_STDERR_PENDING_CHARS);
      }
      expect(tail.consume()).toBe(
        chunks
          .map((chunk) => chunk.toString())
          .join("")
          .slice(-2000)
          .trim(),
      );
    },
  );

  it("preserves decoded snapshots after an input Buffer is mutated", () => {
    const tail = new OneShotStderrTail();
    const chunk = Buffer.from("first failure");
    tail.append(chunk);
    chunk.fill(120);
    tail.append(Buffer.from(" second failure"));
    expect(tail.consume()).toBe("first failure second failure");
  });

  it("matches released storage through mixed valid/invalid chunks and repeated compactions", () => {
    const tail = new OneShotStderrTail();
    const chunks: Buffer[] = [];
    let seed = 0x12345678;
    const random = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return seed >>> 0;
    };
    for (let i = 0; i < 4000; i++) {
      const bytes = i % 257 === 0 ? ONE_SHOT_STDERR_PENDING_CHARS + 17 : random() % 513;
      const chunk = Buffer.alloc(bytes);
      for (let j = 0; j < chunk.length; j++) chunk[j] = random() & 0xff;
      chunks.push(chunk);
      tail.append(chunk);
      expect(tail.retainedSourceCodeUnits).toBeLessThan(
        ONE_SHOT_STDERR_PENDING_CHARS + ONE_SHOT_STDERR_TAIL_CHARS,
      );
      expect(tail.retainedFragments).toBeLessThanOrEqual(ONE_SHOT_STDERR_PENDING_CHARS);
    }
    expect(tail.consume()).toBe(
      chunks
        .map((chunk) => chunk.toString())
        .join("")
        .slice(-2000)
        .trim(),
    );
  });
});
