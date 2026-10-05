import { describe, expect, it } from "vitest";
import { countLineChangeStats } from "@/shared/lineUnifiedDiff";
import { countCodexAddedFileLines } from "./fileChangeDiffSummary";
import {
  normalizePersistedRuntimePayload,
  runtimePayloadProjection,
} from "./persistedRuntimePayload";

const diff = "GENUINE_CREATED\nline two\nline three\n";
const path = "/owned/fixture/notes/created.txt";
const source = (content = diff) => ({ changes: [{ path, kind: { type: "add" }, diff: content }] });
const payload = (content = diff) => ({
  path,
  changeKind: "create",
  diffSummary: { added: 0, removed: 0, unknown: "kept" },
  args: source(content),
  result: source(content),
  unknown: { nested: [1, 2] },
});
const project = (value: unknown, overrides = {}) =>
  normalizePersistedRuntimePayload(value, {
    itemType: "file_change",
    storedJsonUnits: JSON.stringify(value)?.length ?? 0,
    streamsElided: false,
    ...overrides,
  });

describe("proved persisted Codex add payload projection", () => {
  it("repairs source-proved historical counters without altering evidence/key order and is idempotent", () => {
    const value = payload(),
      raw = JSON.stringify(value);
    Object.freeze(value);
    Object.freeze(value.diffSummary);
    const out = project(value) as typeof value;
    expect(out.diffSummary).toEqual({ added: 3, removed: 0, unknown: "kept" });
    expect(out.args).toBe(value.args);
    expect(out.result).toBe(value.result);
    expect(out.unknown).toBe(value.unknown);
    expect(Object.keys(out)).toEqual(Object.keys(value));
    expect(Object.keys(out.diffSummary)).toEqual(Object.keys(value.diffSummary));
    expect(JSON.stringify(value)).toBe(raw);
    expect(project(out)).toBe(out);
  });
  it.each([
    "+literal\n-literal\n+++ header\n--- header\n@@ marker\n",
    "one\r\ntwo\r\n",
    "\n",
    "one\n\n",
    "😀\n\ud800\n\udc00\n",
    "one\rtwo\u2028three\u2029four",
    " \n\t\n",
  ])("preserves raw full-file semantics for %j", (content) => {
    const value = payload(content),
      out = project(value) as typeof value;
    expect(out.diffSummary.added).toBe(countLineChangeStats("", content).added);
    expect(out.result).toBe(value.result);
  });
  it("accepts started args but refuses malformed/mismatched present results rather than falling back", () => {
    const value = payload();
    const { result: _result, ...started } = value;
    expect((project(started) as typeof value).diffSummary.added).toBe(3);
    for (const current of [
      null,
      {},
      source("different\n"),
      { changes: [{ path: path + "-other", kind: { type: "add" }, diff }] },
    ]) {
      const invalid = { ...value, result: current };
      expect(project(invalid)).toBe(invalid);
    }
  });
  it("keeps unsupported/mixed/empty/elided/malformed shapes unchanged", () => {
    for (const value of [
      null,
      [],
      3,
      { ...payload(), changeKind: "edit" },
      { ...payload(), diffSummary: { added: -1, removed: 0 } },
      { ...payload(), diffSummary: { added: "0", removed: 0 } },
      payload(""),
      { ...payload(), result: { changes: [{ path, kind: { type: "update" }, diff }] } },
      { ...payload(), elided: true },
      { ...payload(), result: { ...source(), truncated: true } },
    ])
      expect(project(value)).toBe(value);
    const value = payload();
    expect(project(value, { streamsElided: true })).toBe(value);
    expect(project(value, { itemType: "tool_call" })).toBe(value);
  });
  it("declines before oversized arrays/source/path/stored JSON work and never repairs a partial subset", () => {
    const value = payload();
    expect(project(value, { storedJsonUnits: 512 * 1024 + 1 })).toBe(value);
    for (const changes of [
      Array.from({ length: 65 }, () => source().changes[0]),
      [{ path, kind: { type: "add" }, diff: "x".repeat(256 * 1024) }],
      [{ path: "x".repeat(256 * 1024 + 1), kind: { type: "add" }, diff }],
    ]) {
      const input = { ...value, args: { changes }, result: { changes } };
      expect(project(input)).toBe(input);
    }
  });
  it("proves the declared wire/decode expansion ceiling at a decimal-width crossing", () => {
    const value = payload("\n".repeat(12000)),
      out = project(value);
    const before = JSON.stringify(value),
      after = JSON.stringify(out);
    expect(after.length - before.length).toBeGreaterThan(0);
    expect(Buffer.byteLength(after) - Buffer.byteLength(before)).toBeLessThanOrEqual(
      runtimePayloadProjection.maxWireExpansionBytes,
    );
    expect((after.length - before.length) * 2).toBeLessThanOrEqual(
      runtimePayloadProjection.maxDecodeExpansionBytes,
    );
  });
  it("matches the established complete-add counter over deterministic Unicode/CRLF/blank inputs", () => {
    let seed = 17;
    const chars = ["a", "\n", "\r", "😀", "\ud800", "\u2028", "+", "-", " "];
    for (let n = 0; n < 200; n++) {
      let text = "";
      for (let i = 0; i < n; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        text += chars[seed % chars.length];
      }
      expect(countCodexAddedFileLines(text)).toBe(countLineChangeStats("", text).added);
    }
  });
});
