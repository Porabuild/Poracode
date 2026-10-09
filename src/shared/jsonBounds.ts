/** Verify provider action data before it crosses a JSON-RPC or host boundary.
 * Reject data that JSON would silently drop or change, and cap nesting/bytes. */
export function assertBoundedJson(value: unknown, maxBytes: number): void {
  const ancestors = new Set<object>();
  function visit(entry: unknown, depth: number): void {
    if (depth > 64) throw new RangeError("JSON data exceeds the nesting bound.");
    if (entry === null || typeof entry === "string" || typeof entry === "boolean") return;
    if (typeof entry === "number" && Number.isFinite(entry)) return;
    if (typeof entry !== "object" || entry === null) {
      throw new TypeError("Data must contain only JSON values.");
    }
    if (ancestors.has(entry)) throw new TypeError("JSON data must not contain cycles.");
    if (
      !Array.isArray(entry) &&
      Object.getPrototypeOf(entry) !== Object.prototype &&
      Object.getPrototypeOf(entry) !== null
    ) {
      throw new TypeError("JSON data must contain plain objects.");
    }
    ancestors.add(entry);
    if (Object.getOwnPropertySymbols(entry).length)
      throw new TypeError("Data must contain only JSON keys.");
    for (const item of Array.isArray(entry) ? entry : Object.values(entry)) visit(item, depth + 1);
    ancestors.delete(entry);
  }
  visit(value, 0);
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > maxBytes) {
    throw new RangeError("JSON data exceeds the byte bound.");
  }
}
