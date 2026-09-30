/**
 * A3 correction: bounded producer-side projection of a JSON-shaped value.
 *
 * `stringify-json` inputs are caller-owned object graphs. Charging a fixed
 * reservation while posting the whole graph to the worker made "8 pending
 * stringify jobs" a count cap, not a byte bound: the worker clone was
 * unbounded. Copying, serializing or hashing the graph to measure it would
 * itself defeat the off-thread path, so admission uses a sound upper bound
 * computed without materializing the JSON:
 *
 * - strings are charged their exact JSON-escaped length (scanned, never
 *   allocated); a string whose minimum possible JSON length already exceeds
 *   the remaining budget is refused before the scan, so the escaping scan is
 *   itself bounded by the budget;
 * - numbers/booleans/null are charged their JSON text;
 * - every container is charged a fixed overhead allowance for the structured
 *   clone's V8 header/slot cost;
 * - own-key walks charge each key before reading its descriptor and before
 *   descending, so the walk aborts at the cap instead of first materializing a
 *   snapshot array of every key;
 * - anything JSON.stringify or structured clone would reshape beyond what this
 *   projection can bound — toJSON methods, accessors (never invoked), typed
 *   arrays/ArrayBuffer, Map/Set, BigInt, functions/symbols, class instances,
 *   cycles — refuses typed instead of risking an undercount.
 *
 * The walk's own descriptor reads, string scans and charges are bounded by the
 * remaining budget rather than the graph. Key enumeration inside the engine is
 * not separately measured (enumerating a very wide object can allocate
 * engine-owned key storage on first iteration regardless of when this walk
 * aborts), so no hard heap guarantee is claimed: a producer that needs a hard
 * bound must ship flat, size-limited JSON, not a wide exotic graph.
 */
export type JsonProjectionFailureReason = "too-large" | "unsupported";

export type JsonProjectionResult =
  | { readonly ok: true; readonly bytes: number }
  | { readonly ok: false; readonly reason: JsonProjectionFailureReason };

/** Per-container allowance for the structured clone's object/array header and
 * property slots; primitive leaves are charged their JSON text instead. */
const CONTAINER_OVERHEAD_BYTES = 64;
const MAX_DEPTH = 512;

/** Internal abort carrying the policy outcome; never escapes this module. */
class ProjectionAbort extends Error {
  constructor(readonly reason: JsonProjectionFailureReason) {
    super(reason);
    this.name = "ProjectionAbort";
  }
}

interface ProjectionBudget {
  used: number;
  readonly maxBytes: number;
}

export function projectJsonBytes(value: unknown, maxBytes: number): JsonProjectionResult {
  const budget: ProjectionBudget = { used: 0, maxBytes };
  try {
    walkValue(value, false, new Set<object>(), 0, budget);
  } catch (error) {
    // Aborts carry the policy outcome; a throwing proxy trap is classified as
    // unsupported rather than escaping as a crash from an input guard.
    return {
      ok: false,
      reason: error instanceof ProjectionAbort ? error.reason : "unsupported",
    };
  }
  return { ok: true, bytes: budget.used };
}

function charge(budget: ProjectionBudget, bytes: number): void {
  const used = budget.used + bytes;
  if (used > budget.maxBytes) throw new ProjectionAbort("too-large");
  budget.used = used;
}

/** Charges the exact JSON length of one string (quotes included) plus
 * `extraChars` for surrounding syntax. The lower-bound pre-check runs before
 * the escaping scan: every UTF-16 code unit emits at least one JSON character
 * (surrogate pairs emit two for two units; lone surrogates and control chars
 * emit more) and the quotes plus `extraChars` are mandatory, so when that
 * minimum already exceeds the remaining budget the scan can abort untouched.
 * After the pre-check passes the string is at most `remaining / 2` code units,
 * which bounds the scan by the budget. */
function chargeEscapedString(budget: ProjectionBudget, value: string, extraChars: number): void {
  const remaining = budget.maxBytes - budget.used;
  if ((value.length + 2 + extraChars) * 2 > remaining) {
    throw new ProjectionAbort("too-large");
  }
  charge(budget, escapedStringChars(value) * 2 + extraChars * 2);
}

function walkValue(
  value: unknown,
  inArray: boolean,
  ancestors: Set<object>,
  depth: number,
  budget: ProjectionBudget,
): void {
  if (depth > MAX_DEPTH) throw new ProjectionAbort("unsupported");
  switch (typeof value) {
    case "boolean":
      // "true" / "false"
      charge(budget, value ? 8 : 10);
      return;
    case "number":
      charge(budget, Number.isFinite(value) ? String(value).length * 2 : 8);
      return;
    case "string":
      chargeEscapedString(budget, value, 0);
      return;
    case "undefined":
      // A hole or undefined array slot serializes as null; an undefined
      // property value is omitted by JSON.stringify (and survives structured
      // clone), so only the array case carries a charge.
      if (inArray) {
        charge(budget, 8); // null
        return;
      }
      throw new ProjectionAbort("unsupported");
    case "bigint":
      // JSON.stringify throws; postMessage succeeds but the value has no JSON
      // representation. Refuse typed before either happens.
      throw new ProjectionAbort("unsupported");
    case "function":
    case "symbol":
      // Omitted by JSON.stringify but the structured clone throws, which would
      // otherwise kill a healthy worker.
      throw new ProjectionAbort("unsupported");
    case "object":
      break;
    default:
      throw new ProjectionAbort("unsupported");
  }
  if (value === null) {
    charge(budget, 8);
    return;
  }

  const object = value as object;
  if (ancestors.has(object)) throw new ProjectionAbort("unsupported");
  if (object instanceof Date) {
    // JSON.stringify always consults `toJSON` before anything else, and a Date
    // inherits `Date.prototype.toJSON`. Only take the bounded builtin path:
    // an own override (or a custom prototype between the instance and
    // `Date.prototype`) could return anything, and the builtin itself looks up
    // `toISOString`/`valueOf`/`toString`/`Symbol.toPrimitive` on the instance.
    if (!isPlainDate(object)) throw new ProjectionAbort("unsupported");
    charge(budget, dateJsonChars(object) * 2);
    return;
  }
  // Checked before the wrapper fast path: `toJSON` wins over unwrapping in
  // JSON.stringify, so a boxed primitive carrying one is unbounded. Accessors
  // are inspected by descriptor, never invoked.
  if (hasToJson(object)) throw new ProjectionAbort("unsupported");
  if (object instanceof Number || object instanceof String || object instanceof Boolean) {
    // JSON.stringify unwraps wrappers to their primitive through ToPrimitive,
    // which can invoke an own `valueOf`/`toString`/`Symbol.toPrimitive`.
    if (!isPlainBoxedPrimitive(object)) throw new ProjectionAbort("unsupported");
    charge(budget, CONTAINER_OVERHEAD_BYTES);
    walkValue(unwrapBoxedPrimitive(object), false, ancestors, depth + 1, budget);
    return;
  }
  if (ArrayBuffer.isView(object) || object instanceof ArrayBuffer || isSharedArrayBuffer(object)) {
    throw new ProjectionAbort("unsupported");
  }
  if (
    object instanceof Map ||
    object instanceof Set ||
    object instanceof WeakMap ||
    object instanceof WeakSet
  ) {
    throw new ProjectionAbort("unsupported");
  }

  const prototype = Object.getPrototypeOf(object);
  if (!Array.isArray(object) && prototype !== Object.prototype && prototype !== null) {
    // Class instances can carry internal slots structured clone copies but
    // JSON does not show; only plain data graphs are projectable.
    throw new ProjectionAbort("unsupported");
  }

  ancestors.add(object);
  try {
    if (Array.isArray(object)) {
      charge(budget, CONTAINER_OVERHEAD_BYTES + 4);
      const length = object.length;
      for (let index = 0; index < length; index += 1) {
        if (index > 0) charge(budget, 2);
        const descriptor = Object.getOwnPropertyDescriptor(object, String(index));
        if (!descriptor || !("value" in descriptor)) {
          if (descriptor) throw new ProjectionAbort("unsupported");
          charge(budget, 8); // hole -> null
          continue;
        }
        walkValue(descriptor.value, true, ancestors, depth + 1, budget);
      }
      return;
    }
    charge(budget, CONTAINER_OVERHEAD_BYTES + 4);
    let emitted = 0;
    // Streamed own-key walk (Object.keys would materialize every key before
    // the first charge could abort). Each visited key is charged before its
    // descriptor is read and before descending; inherited enumerable
    // properties (which JSON.stringify ignores) are skipped explicitly.
    for (const key in object) {
      if (!Object.hasOwn(object, key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      if (!descriptor) continue;
      if (!("value" in descriptor)) throw new ProjectionAbort("unsupported");
      const child = descriptor.value;
      const childType = typeof child;
      if (childType === "function" || childType === "symbol")
        throw new ProjectionAbort("unsupported");
      if (childType === "undefined") continue;
      if (emitted > 0) charge(budget, 2);
      emitted += 1;
      chargeEscapedString(budget, key, 1); // quoted key + ":"
      walkValue(child, false, ancestors, depth + 1, budget);
    }
  } finally {
    ancestors.delete(object);
  }
}

function isSharedArrayBuffer(object: object): boolean {
  return typeof SharedArrayBuffer !== "undefined" && object instanceof SharedArrayBuffer;
}

/** `JSON.stringify` calls an own or inherited callable `toJSON`; the projection
 * cannot bound what it returns without invoking it, so refuse. Descriptors
 * only, to avoid running an accessor while looking for it. A non-callable own
 * `toJSON` is ignored by JSON.stringify and does not refuse here (the wrapper
 * guard covers the case where shadowing it changes the unwrap path). */
function hasToJson(object: object): boolean {
  let current: object | null = object;
  while (current !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(current, "toJSON");
    if (descriptor) {
      if (!("value" in descriptor)) return true;
      return typeof descriptor.value === "function";
    }
    current = Object.getPrototypeOf(current);
  }
  return false;
}

function hasOwnKey(object: object, key: PropertyKey): boolean {
  return Object.getOwnPropertyDescriptor(object, key) !== undefined;
}

/** A Date is projectable only when JSON.stringify must take the builtin
 * `Date.prototype.toJSON` path unchanged: the prototype is exactly
 * `Date.prototype` (no custom intermediate object can redirect the method and
 * primitive-conversion lookups the builtin performs) and the instance carries
 * no own override of any of those lookups. Every check uses descriptors, so no
 * accessor is ever invoked. Global mutation of `Date.prototype` is out of
 * scope for this same-origin guard. */
function isPlainDate(date: Date): boolean {
  if (Object.getPrototypeOf(date) !== Date.prototype) return false;
  return !(
    hasOwnKey(date, "toJSON") ||
    hasOwnKey(date, "toISOString") ||
    hasOwnKey(date, "valueOf") ||
    hasOwnKey(date, "toString") ||
    hasOwnKey(date, Symbol.toPrimitive)
  );
}

/** JSON.stringify unwraps a boxed primitive via ToPrimitive, which consults
 * `Symbol.toPrimitive`, `valueOf` and `toString`. Only a wrapper whose
 * prototype is its pristine builtin and that carries no own override of those
 * lookups is projected, using the builtin's internal slot. Descriptors only:
 * no accessor is invoked. */
function isPlainBoxedPrimitive(object: object): boolean {
  const prototype = Object.getPrototypeOf(object);
  const expected =
    object instanceof Number
      ? Number.prototype
      : object instanceof String
        ? String.prototype
        : Boolean.prototype;
  if (prototype !== expected) return false;
  return !(
    hasOwnKey(object, "toJSON") ||
    hasOwnKey(object, "valueOf") ||
    hasOwnKey(object, "toString") ||
    hasOwnKey(object, Symbol.toPrimitive)
  );
}

/** The primitive of a wrapper already proven plain; the prototype method reads
 * the internal slot and cannot be redirected by an own accessor. */
function unwrapBoxedPrimitive(object: Number | String | Boolean): unknown {
  if (object instanceof Number) return Number.prototype.valueOf.call(object);
  if (object instanceof String) return String.prototype.valueOf.call(object);
  return Boolean.prototype.valueOf.call(object);
}

/** The Date's own text via the prototype methods (internal slot), never via an
 * own `getTime`/`toISOString`; `isPlainDate` has already refused overrides. */
function dateJsonChars(date: Date): number {
  const time = Date.prototype.getTime.call(date);
  if (!Number.isFinite(time)) return 4; // invalid Date serializes as "null"
  return Date.prototype.toISOString.call(date).length + 2;
}

/** Exact JSON string length including quotes, with no intermediate escaping:
 * ES2019 `JSON.stringify` emits valid surrogate pairs verbatim and escapes
 * lone surrogates plus control characters. */
function escapedStringChars(value: string): number {
  let chars = 2;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x22 || code === 0x5c) {
      chars += 2;
    } else if (code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d) {
      chars += 2;
    } else if (code < 0x20) {
      chars += 6;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        chars += 2;
        index += 1;
      } else {
        chars += 6;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      chars += 6;
    } else {
      chars += 1;
    }
  }
  return chars;
}
