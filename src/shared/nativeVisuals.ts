import { validateNativeVisualV2, type NativeVisualV2Spec } from "./nativeVisualsV2";

/** Data-only authored format. HTML v1 remains a separate source-only format. */
export const NATIVE_VISUAL_FORMAT_VERSION = 1 as const;
export const NATIVE_VISUAL_V2_FORMAT_VERSION = 2 as const;
export const MAX_NATIVE_VISUAL_BYTES = 64 * 1024;
export const MAX_NATIVE_VISUALS_PER_MESSAGE = 6;
const MAX_LITERAL = 1e12;
const MAX_RESULT = 1e15;

export type NativeVisualValue =
  | number
  | { input: string }
  | {
      op: "add" | "subtract" | "multiply" | "divide" | "min" | "max";
      args: [NativeVisualValue, NativeVisualValue];
    };

export type NativeVisualFormat =
  | { style: "decimal" | "percent" }
  | { style: "currency"; currency: string };

export interface NativeVisualInput {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
}

export interface NativeVisualChart {
  type: "chart";
  kind: "bar" | "line";
  title?: string;
  labels: string[];
  series: { label: string; values: NativeVisualValue[] }[];
  format?: NativeVisualFormat;
}

export interface NativeVisualTable {
  type: "table";
  title?: string;
  columns: { label: string; format?: NativeVisualFormat }[];
  rows: (string | NativeVisualValue)[][];
}

export interface NativeVisualOutputs {
  type: "outputs";
  title?: string;
  items: { label: string; value: NativeVisualValue; format?: NativeVisualFormat }[];
}

export interface NativeVisualSpec {
  description?: string;
  inputs: NativeVisualInput[];
  blocks: (NativeVisualChart | NativeVisualTable | NativeVisualOutputs)[];
}

export type NativeVisualParseResult =
  | { ok: true; spec: NativeVisualSpec }
  | { ok: false; reason: "too-large" | "invalid" };

export type NativeVisualV2ParseResult =
  | { ok: true; spec: NativeVisualV2Spec }
  | { ok: false; reason: "too-large" | "invalid" };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function text(value: unknown, max = 120): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function literal(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= MAX_LITERAL;
}

function format(value: unknown): boolean {
  if (value === undefined) return true;
  if (!record(value)) return false;
  return value.style === "currency"
    ? keys(value, ["style", "currency"]) &&
        typeof value.currency === "string" &&
        /^[A-Z]{3}$/.test(value.currency)
    : keys(value, ["style"]) && (value.style === "decimal" || value.style === "percent");
}

/** Shared by restored UI state and authored defaults; never trusts storage values. */
export function nativeVisualInputValue(input: NativeVisualInput, value: unknown): number {
  if (!literal(value) || value < input.min || value > input.max) return input.value;
  const steps = (value - input.min) / input.step;
  if (Math.abs(steps - Math.round(steps)) > 1e-6) return input.value;
  return value;
}

/** Parse only bounded JSON data. No DOM, provider, HTML or expression-source parser. */
export function parseNativeVisual(source: string, version?: 1): NativeVisualParseResult;
export function parseNativeVisual(source: string, version: 2): NativeVisualV2ParseResult;
export function parseNativeVisual(
  source: string,
  version: 1 | 2 = 1,
): NativeVisualParseResult | NativeVisualV2ParseResult {
  if (
    source.length > MAX_NATIVE_VISUAL_BYTES ||
    new TextEncoder().encode(source).length > MAX_NATIVE_VISUAL_BYTES
  ) {
    return { ok: false, reason: "too-large" };
  }
  let root: unknown;
  try {
    root = JSON.parse(source) as unknown;
  } catch {
    return { ok: false, reason: "invalid" };
  }
  const invalid: NativeVisualParseResult = { ok: false, reason: "invalid" };
  const pending: [unknown, number][] = [[root, 0]];
  let nodes = 0;
  let textChars = 0;
  while (pending.length) {
    const [value, depth] = pending.pop()!;
    if (++nodes > 20_000 || depth > 32) return invalid;
    if (version === 2 && typeof value === "string" && (textChars += value.length) > 12_000)
      return invalid;
    if (Array.isArray(value)) {
      for (const child of value) pending.push([child, depth + 1]);
    } else if (record(value)) {
      for (const child of Object.values(value)) pending.push([child, depth + 1]);
    }
  }
  if (
    !record(root) ||
    !keys(
      root,
      version === 2
        ? ["description", "inputs", "blocks", "layout", "accent"]
        : ["description", "inputs", "blocks"],
    ) ||
    (root.description !== undefined && !text(root.description, 512))
  )
    return invalid;
  const inputs = root.inputs === undefined ? [] : root.inputs;
  if (!Array.isArray(inputs) || inputs.length > 8) return invalid;
  const ids = new Set<string>();
  for (const input of inputs) {
    if (
      !record(input) ||
      !keys(input, ["id", "label", "min", "max", "step", "value"]) ||
      !text(input.id, 40) ||
      !/^[A-Za-z][A-Za-z0-9_-]*$/.test(input.id) ||
      ids.has(input.id) ||
      !text(input.label) ||
      !literal(input.min) ||
      !literal(input.max) ||
      input.min >= input.max ||
      !literal(input.step) ||
      input.step <= 0 ||
      (input.max - input.min) / input.step > 1e6 ||
      !literal(input.value) ||
      input.value < input.min ||
      input.value > input.max
    )
      return invalid;
    const steps = (input.value - input.min) / input.step;
    if (Math.abs(steps - Math.round(steps)) > 1e-6) return invalid;
    ids.add(input.id);
  }
  let expressionNodes = 0;
  let slots = 0;
  function valueValid(value: unknown, depth = 0): boolean {
    if (++expressionNodes > 4_096 || depth > 12) return false;
    if (literal(value)) return true;
    if (!record(value)) return false;
    if (keys(value, ["input"]) && typeof value.input === "string") return ids.has(value.input);
    return (
      keys(value, ["op", "args"]) &&
      typeof value.op === "string" &&
      ["add", "subtract", "multiply", "divide", "min", "max"].includes(value.op) &&
      Array.isArray(value.args) &&
      value.args.length === 2 &&
      valueValid(value.args[0], depth + 1) &&
      valueValid(value.args[1], depth + 1)
    );
  }
  function legacyBlockValid(block: unknown): boolean {
    if (!record(block) || (block.title !== undefined && !text(block.title, 200))) return false;
    if (block.type === "chart") {
      if (
        !keys(block, ["type", "kind", "title", "labels", "series", "format"]) ||
        (block.kind !== "bar" && block.kind !== "line") ||
        !format(block.format) ||
        !Array.isArray(block.labels) ||
        !block.labels.length ||
        block.labels.length > 100 ||
        !block.labels.every((label) => text(label)) ||
        !Array.isArray(block.series) ||
        !block.series.length ||
        block.series.length > 4
      )
        return false;
      const labels = block.labels;
      for (const series of block.series) {
        if (
          !record(series) ||
          !keys(series, ["label", "values"]) ||
          !text(series.label) ||
          !Array.isArray(series.values) ||
          series.values.length !== labels.length ||
          !series.values.every((value) => valueValid(value))
        )
          return false;
        slots += series.values.length;
      }
    } else if (block.type === "table") {
      if (
        !keys(block, ["type", "title", "columns", "rows"]) ||
        !Array.isArray(block.columns) ||
        !block.columns.length ||
        block.columns.length > 8 ||
        !Array.isArray(block.rows) ||
        block.rows.length > 100
      )
        return false;
      for (const column of block.columns) {
        if (
          !record(column) ||
          !keys(column, ["label", "format"]) ||
          !text(column.label) ||
          !format(column.format)
        )
          return false;
      }
      const columns = block.columns;
      for (const row of block.rows) {
        if (
          !Array.isArray(row) ||
          row.length !== columns.length ||
          !row.every((value) =>
            typeof value === "string" ? value.length <= 512 : valueValid(value),
          )
        )
          return false;
        slots += row.length;
      }
    } else if (block.type === "outputs") {
      if (
        !keys(block, ["type", "title", "items"]) ||
        !Array.isArray(block.items) ||
        !block.items.length ||
        block.items.length > 32
      )
        return false;
      for (const item of block.items) {
        if (
          !record(item) ||
          !keys(item, ["label", "value", "format"]) ||
          !text(item.label) ||
          !format(item.format) ||
          !valueValid(item.value)
        )
          return false;
      }
      slots += block.items.length;
    } else {
      return false;
    }
    return slots <= 1_024;
  }
  if (version === 2) {
    if (!validateNativeVisualV2(root, legacyBlockValid)) return invalid;
    return { ok: true, spec: { ...root, inputs } as unknown as NativeVisualV2Spec };
  }
  if (!Array.isArray(root.blocks) || root.blocks.length < 1 || root.blocks.length > 6)
    return invalid;
  if (!root.blocks.every(legacyBlockValid)) return invalid;
  return { ok: true, spec: { ...root, inputs } as unknown as NativeVisualSpec };
}

/** A closed arithmetic vocabulary with a fixed depth/work budget. */
export function evaluateNativeVisualValue(
  value: NativeVisualValue,
  inputs: ReadonlyMap<string, number>,
): number | null {
  let remaining = 4_096;
  function evaluate(node: NativeVisualValue, depth: number): number | null {
    if (--remaining < 0 || depth > 12) return null;
    let result: number;
    if (typeof node === "number") result = node;
    else if ("input" in node) result = inputs.get(node.input) ?? NaN;
    else {
      const a = evaluate(node.args[0], depth + 1);
      const b = evaluate(node.args[1], depth + 1);
      if (a === null || b === null) return null;
      switch (node.op) {
        case "add":
          result = a + b;
          break;
        case "subtract":
          result = a - b;
          break;
        case "multiply":
          result = a * b;
          break;
        case "divide":
          result = b === 0 ? NaN : a / b;
          break;
        case "min":
          result = Math.min(a, b);
          break;
        case "max":
          result = Math.max(a, b);
          break;
        default:
          return null;
      }
    }
    return Number.isFinite(result) && Math.abs(result) <= MAX_RESULT ? result : null;
  }
  return evaluate(value, 0);
}
