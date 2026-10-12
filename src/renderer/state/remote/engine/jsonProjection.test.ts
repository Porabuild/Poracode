import { describe, expect, it, vi } from "vitest";
import { projectJsonBytes } from "./jsonProjection";

const LARGE_CAP = 64 * 1024 * 1024;

function expectSound(value: unknown): number {
  const json = JSON.stringify(value);
  if (typeof json !== "string") throw new Error("expected a JSON string");
  const result = projectJsonBytes(value, LARGE_CAP);
  if (!result.ok) throw new Error(`expected a projection, got ${result.reason}`);
  // Sound: the projected footprint never undercounts the JSON text it must
  // cover (and for primitive roots it is exact).
  expect(result.bytes).toBeGreaterThanOrEqual(json.length * 2);
  return result.bytes;
}

describe("projectJsonBytes (bounded producer-side projection)", () => {
  it("is a sound upper bound for JSON-shaped data", () => {
    const corpus: unknown[] = [
      null,
      true,
      false,
      0,
      -0,
      123.456,
      -1e21,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "",
      "plain",
      'quote " backslash \\ newline \n tab \t',
      "\u0000\u001f",
      "\ud83d\ude00", // valid surrogate pair
      "\ud800", // lone high surrogate
      "\udc00", // lone low surrogate
      [],
      {},
      [1, "two", null, [3], { four: 4 }],
      { nested: { deep: { value: "x".repeat(10) } } },
      { omitted: undefined, kept: 1 },
      [undefined, null],
      { date: new Date("2024-01-02T03:04:05.000Z") },
      { invalidDate: new Date(Number.NaN) },
      new Number(7),
      new String("wrapped"),
      new Boolean(false),
      { "": "", "long key": "value" },
      Object.assign(Object.create(null) as object, { inherited: "none" }),
    ];
    for (const value of corpus) expect(expectSound(value)).toBeGreaterThan(0);
  });

  it("scans string escapes exactly", () => {
    for (const value of [
      "plain",
      'quote " backslash \\',
      "line\nbreak\t\u0007",
      "\ud83d\ude00 pair",
      "\ud800 lone",
      "\udc00 lone",
    ]) {
      const result = projectJsonBytes(value, LARGE_CAP);
      if (!result.ok) throw new Error("expected a projection");
      expect(result.bytes).toBe(JSON.stringify(value).length * 2);
    }
  });

  it("charges per-container overhead for deep graphs", () => {
    let nested: unknown = 1;
    for (let depth = 0; depth < 500; depth += 1) nested = { next: nested };
    const bytes = expectSound(nested);
    expect(bytes).toBeGreaterThanOrEqual(500 * 64);
  });

  it("refuses graphs whose JSON or clone semantics it cannot bound", () => {
    class Instance {
      readonly value = 1;
    }
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const cases: Array<[string, unknown]> = [
      ["bigint", 1n],
      ["function", () => undefined],
      ["symbol", Symbol("s")],
      ["undefined root", undefined],
      ["object property function", { fn: () => undefined }],
      ["array element symbol", [Symbol("s")]],
      ["cycle", cyclic],
      ["toJSON", { toJSON: () => "anything" }],
      ["class instance", new Instance()],
      ["Map", new Map([["a", "b"]])],
      ["Set", new Set([1])],
      ["typed array", new Uint8Array([1, 2, 3])],
      ["ArrayBuffer", new ArrayBuffer(8)],
    ];
    const outcomes = cases.map(
      ([label, value]) => [label, projectJsonBytes(value, LARGE_CAP)] as const,
    );
    expect(outcomes).toEqual(cases.map(([label]) => [label, { ok: false, reason: "unsupported" }]));
  });

  it("refuses accessor properties without invoking them", () => {
    const getter = vi.fn<() => string>(() => "huge");
    const value = Object.defineProperty({}, "secret", { get: getter, enumerable: true });
    const result = projectJsonBytes(value, LARGE_CAP);
    expect(result).toEqual({ ok: false, reason: "unsupported" });
    expect(getter).not.toHaveBeenCalled();
  });

  it("aborts at the cap without serializing the graph", () => {
    const value = { blob: "x".repeat(1_000_000) };
    const stringify = vi.spyOn(JSON, "stringify");
    try {
      const result = projectJsonBytes(value, 4_096);
      expect(result).toEqual({ ok: false, reason: "too-large" });
      expect(stringify).not.toHaveBeenCalled();
    } finally {
      stringify.mockRestore();
    }
  });

  it("refuses a Date or boxed primitive whose own toJSON bypasses the builtin size", () => {
    const ownToJson = vi.fn<() => string>(() => "x".repeat(1_000_000));
    const date = new Date(0) as Date & { toJSON: () => string };
    date.toJSON = ownToJson;
    const boxed: unknown[] = [
      Object.assign(new Number(7), { toJSON: ownToJson }),
      Object.assign(new String("wrapped"), { toJSON: ownToJson }),
      Object.assign(new Boolean(false), { toJSON: ownToJson }),
    ];
    for (const value of [date, ...boxed]) {
      // JSON.stringify consults toJSON BEFORE unwrapping/dating, so what it
      // returns cannot be bounded from the instance's shape.
      expect(projectJsonBytes(value, 4_096)).toEqual({ ok: false, reason: "unsupported" });
    }
    // Descriptor-based refusal: the user's toJSON never ran during projection.
    expect(ownToJson).not.toHaveBeenCalled();
  });

  it("refuses Date/boxed method accessors without invoking them", () => {
    const date = new Date(0);
    const toIsoString = vi.fn<() => string>(() => "x".repeat(1_000_000));
    Object.defineProperty(date, "toISOString", { get: toIsoString, configurable: true });
    expect(projectJsonBytes(date, 4_096)).toEqual({ ok: false, reason: "unsupported" });
    expect(toIsoString).not.toHaveBeenCalled();

    const boxed = new Number(7);
    const valueOf = vi.fn<() => string>(() => "y".repeat(1_000_000));
    Object.defineProperty(boxed, "valueOf", { get: valueOf, configurable: true });
    expect(projectJsonBytes(boxed, 4_096)).toEqual({ ok: false, reason: "unsupported" });
    expect(valueOf).not.toHaveBeenCalled();

    // Symbol.toPrimitive is the other ToPrimitive escape hatch JSON.stringify
    // uses for wrappers and, through the builtin toJSON, for dates.
    const withToPrimitive = new String("wrapped");
    Object.defineProperty(withToPrimitive, Symbol.toPrimitive, {
      value: () => "z".repeat(1_000_000),
      configurable: true,
    });
    expect(projectJsonBytes(withToPrimitive, 4_096)).toEqual({
      ok: false,
      reason: "unsupported",
    });
  });

  it("refuses a Date or wrapper whose prototype redirects the builtin methods", () => {
    const date = new Date(0);
    Object.setPrototypeOf(
      date,
      Object.create(Date.prototype, {
        toJSON: { value: () => "x".repeat(1_000_000) },
      }),
    );
    expect(projectJsonBytes(date, 4_096)).toEqual({ ok: false, reason: "unsupported" });

    const boxed = new Number(7);
    Object.setPrototypeOf(
      boxed,
      Object.create(Number.prototype, {
        valueOf: { value: () => "y".repeat(1_000_000) },
      }),
    );
    expect(projectJsonBytes(boxed, 4_096)).toEqual({ ok: false, reason: "unsupported" });
  });

  it("bounds the escaping scan by the remaining budget instead of the input", () => {
    const value = "x".repeat(4_000_000);
    const charCodeAt = vi.spyOn(String.prototype, "charCodeAt");
    let result: ReturnType<typeof projectJsonBytes>;
    let calls = 0;
    try {
      result = projectJsonBytes(value, 4_096);
      calls = charCodeAt.mock.calls.length;
    } finally {
      charCodeAt.mockRestore();
    }
    expect(result!).toEqual({ ok: false, reason: "too-large" });
    // The minimum possible JSON length of the string already exceeds the
    // budget, so the scan aborts before reading it. Failed before the fix:
    // every one of the 4M code units was scanned to measure the refusal.
    expect(calls).toBeLessThanOrEqual(2_048);
  });

  it("aborts a wide own-key walk at the budget without snapshotting every key", () => {
    const width = 200_000;
    const wide: Record<string, number> = {};
    for (let index = 0; index < width; index += 1) wide[`k${index}`] = index;
    const keys = vi.spyOn(Object, "keys");
    const descriptors = vi.spyOn(Object, "getOwnPropertyDescriptor");
    let result: ReturnType<typeof projectJsonBytes>;
    let keysCalls = -1;
    let descriptorCalls = 0;
    try {
      result = projectJsonBytes(wide, 4_096);
      keysCalls = keys.mock.calls.length;
      descriptorCalls = descriptors.mock.calls.length;
    } finally {
      // mockRestore() also clears mock history, so snapshot the counts above.
      keys.mockRestore();
      descriptors.mockRestore();
    }
    expect(result!).toEqual({ ok: false, reason: "too-large" });
    // Failed before the fix: Object.keys materialized all 200k keys first.
    expect(keysCalls).toBe(0);
    // Each visited key is charged before its descriptor is read, so the walk
    // stops within the budget rather than visiting the whole object.
    expect(descriptorCalls).toBeLessThan(4_096);
  });

  it("bounds wide sparse arrays by work, not by length", () => {
    const sparse = new Array(100_000_000);
    sparse[99_999_999] = 1;
    const result = projectJsonBytes(sparse, 4_096);
    expect(result).toEqual({ ok: false, reason: "too-large" });
  });
});
