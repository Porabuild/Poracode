import type { RuntimeEvent } from "@/shared/contracts";

/** Quotes, controls and lone surrogates need at most five extra JSON bytes.
 * Unicode matching leaves valid surrogate pairs as their original UTF-8 bytes. */
function quotedStringBound(value: string): number {
  const escapes = value.match(/["\\]|\p{Cc}|\p{Cs}/gu)?.length ?? 0;
  return 2 + Buffer.byteLength(value, "utf8") + 5 * escapes;
}

/** Common streaming events are flat primitives. Bound them without allocating
 * another serialized stream or invoking payload/accessor/custom JSON behavior.
 * Structured events use the existing exact serialization fallback. */
export function threadReplayEventBytes(events: readonly RuntimeEvent[]): number {
  let bytes = 2; // array brackets
  if (Object.getPrototypeOf(events) === Array.prototype && !("toJSON" in events)) {
    for (let index = 0; index < events.length; index++) {
      const event = events[index]!;
      if (Object.getPrototypeOf(event) !== Object.prototype || "toJSON" in event)
        return Buffer.byteLength(JSON.stringify(events), "utf8");
      bytes += (index === 0 ? 0 : 1) + 2; // comma and object braces
      let properties = 0;
      for (const key of Object.keys(event)) {
        const property = Object.getOwnPropertyDescriptor(event, key)!;
        if (!("value" in property)) return Buffer.byteLength(JSON.stringify(events), "utf8");
        const value: unknown = property.value;
        if (value === undefined || typeof value === "function" || typeof value === "symbol")
          continue;
        let size: number;
        if (typeof value === "string") size = quotedStringBound(value);
        else if (typeof value === "number")
          size = Number.isFinite(value) ? String(value).length : 4;
        else if (typeof value === "boolean") size = value ? 4 : 5;
        else if (value === null) size = 4;
        else return Buffer.byteLength(JSON.stringify(events), "utf8");
        bytes += (properties++ === 0 ? 0 : 1) + quotedStringBound(key) + 1 + size;
      }
    }
    return bytes;
  }
  return Buffer.byteLength(JSON.stringify(events), "utf8");
}
