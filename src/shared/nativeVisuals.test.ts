import { describe, expect, it } from "vitest";
import {
  evaluateNativeVisualValue,
  MAX_NATIVE_VISUAL_BYTES,
  NATIVE_VISUAL_FORMAT_VERSION,
  nativeVisualInputValue,
  parseNativeVisual,
  type NativeVisualValue,
} from "./nativeVisuals";

function document(value: unknown = { op: "multiply", args: [{ input: "seats" }, 16] }) {
  return {
    inputs: [{ id: "seats", label: "Seats", min: 1, max: 100, step: 1, value: 25 }],
    blocks: [{ type: "outputs", items: [{ label: "Monthly total", value }] }],
  };
}

describe("native visual data boundary", () => {
  it("parses a bounded calculator and evaluates only the explicit arithmetic tree", () => {
    expect(NATIVE_VISUAL_FORMAT_VERSION).toBe(1);
    const parsed = parseNativeVisual(JSON.stringify(document()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("Expected a valid calculator");
    expect(
      evaluateNativeVisualValue(
        { op: "multiply", args: [{ input: "seats" }, 16] },
        new Map([["seats", 25]]),
      ),
    ).toBe(400);
    expect(nativeVisualInputValue(parsed.spec.inputs[0]!, 30)).toBe(30);
    for (const value of [NaN, Infinity, -1, 101, 25.5, "30", null]) {
      expect(nativeVisualInputValue(parsed.spec.inputs[0]!, value)).toBe(25);
    }
  });

  it.each([
    "seats * 16",
    { op: "eval", args: [1, 2] },
    { op: ["add"], args: [1, 2] },
    { op: { toString: "add" }, args: [1, 2] },
    { op: "add", args: [1] },
    { input: "missing" },
    { input: "seats", path: "constructor" },
    { output: "previous" },
    { op: "add", args: [1, 2], action: "fetch" },
    1e13,
    null,
  ])("rejects unsupported expressions or nonfinite/unbounded literals: %j", (value) => {
    expect(parseNativeVisual(JSON.stringify(document(value))).ok).toBe(false);
  });

  it("rejects unsupported root/block/format keys instead of passing author properties to the DOM", () => {
    const base = document();
    for (const root of [
      { ...base, html: "<script>run()</script>" },
      { ...base, inputs: null },
      { ...base, version: 2 },
      { ...base, blocks: [{ type: "iframe", src: "http://127.0.0.1" }] },
      {
        ...base,
        blocks: [{ type: "outputs", onClick: "run()", items: [{ label: "Value", value: 1 }] }],
      },
      {
        ...base,
        blocks: [
          {
            type: "outputs",
            items: [{ label: "Value", value: 1, format: { style: "currency", currency: "bad!" } }],
          },
        ],
      },
      {
        ...base,
        blocks: [
          {
            type: "outputs",
            items: [{ label: "Value", value: 1, format: { style: "decimal", currency: "USD" } }],
          },
        ],
      },
    ])
      expect(parseNativeVisual(JSON.stringify(root)).ok).toBe(false);
    expect(parseNativeVisual('{"blocks":[],"__proto__":{"polluted":true}}').ok).toBe(false);
  });

  it("validates chart and table dimensions and preserves text as data", () => {
    const chart = {
      type: "chart",
      kind: "line",
      labels: ["Jan", "Feb"],
      series: [{ label: "Total", values: [1, 2] }],
    };
    const table = {
      type: "table",
      columns: [{ label: "Text" }, { label: "Value" }],
      rows: [["<img src=x onerror=run()>", 3]],
    };
    expect(parseNativeVisual(JSON.stringify({ blocks: [chart, table] }))).toMatchObject({
      ok: true,
      spec: { inputs: [], blocks: [chart, table] },
    });
    expect(
      parseNativeVisual(
        JSON.stringify({ blocks: [{ ...chart, series: [{ label: "Total", values: [1] }] }] }),
      ).ok,
    ).toBe(false);
    expect(parseNativeVisual(JSON.stringify({ blocks: [{ ...table, rows: [[1]] }] })).ok).toBe(
      false,
    );
  });

  it("rejects duplicate inputs, invalid ranges and defaults off the step grid", () => {
    const base = document();
    const input = base.inputs[0]!;
    for (const inputs of [
      [input, input],
      [{ ...input, step: 0 }],
      [{ ...input, min: 100 }],
      [{ ...input, value: 1.5 }],
      [{ ...input, value: 101 }],
      [{ ...input, step: 0.000001 }],
      [{ ...input, id: "a.b" }],
      Array.from({ length: 9 }, (_, index) => ({ ...input, id: `n${index}` })),
    ])
      expect(parseNativeVisual(JSON.stringify({ ...base, inputs })).ok).toBe(false);
  });

  it("limits UTF-8 bytes, JSON nesting, expression depth, work, blocks and value slots", () => {
    expect(parseNativeVisual(" ".repeat(MAX_NATIVE_VISUAL_BYTES + 1))).toEqual({
      ok: false,
      reason: "too-large",
    });
    expect(parseNativeVisual('"' + "😀".repeat(MAX_NATIVE_VISUAL_BYTES / 4) + '"')).toEqual({
      ok: false,
      reason: "too-large",
    });
    expect(parseNativeVisual("[".repeat(40) + "0" + "]".repeat(40)).ok).toBe(false);
    let nested: NativeVisualValue = 1;
    for (let i = 0; i < 14; i++) nested = { op: "add", args: [nested, 1] };
    expect(parseNativeVisual(JSON.stringify(document(nested))).ok).toBe(false);
    const block = {
      type: "table",
      columns: Array.from({ length: 8 }, () => ({ label: "Cell" })),
      rows: Array.from({ length: 100 }, () => Array.from({ length: 8 }, () => 1)),
    };
    expect(parseNativeVisual(JSON.stringify({ blocks: [block, block] })).ok).toBe(false);
    expect(
      parseNativeVisual(
        JSON.stringify({ blocks: Array.from({ length: 7 }, () => document().blocks[0]) }),
      ).ok,
    ).toBe(false);
  });

  it("does not turn unavailable arithmetic into zero, infinity or a chart coordinate", () => {
    const inputs = new Map([["seats", 25]]);
    for (const value of [
      { op: "divide", args: [1, 0] },
      { op: "multiply", args: [1e12, 1e12] },
      { input: "missing" },
      { op: "add", args: [{ op: "divide", args: [1, 0] }, 2] },
    ] satisfies NativeVisualValue[])
      expect(evaluateNativeVisualValue(value, inputs)).toBeNull();
    expect(evaluateNativeVisualValue({ op: "min", args: [3, 2] }, inputs)).toBe(2);
    expect(evaluateNativeVisualValue({ op: "max", args: [3, 2] }, inputs)).toBe(3);
    expect(evaluateNativeVisualValue({ op: "subtract", args: [3, 2] }, inputs)).toBe(1);
  });
});
