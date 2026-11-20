/**
 * Deterministic JSON-value encoding for advisory presentation cache consistency.
 * Not authentication: scopes and ownership are checked independently.
 * Numbers use their IEEE-754 bits, and object keys use UTF-16 lexical order.
 */
export const PRESENTATION_INPUT_MAX_BYTES = 4 * 1024 * 1024;
export const PRESENTATION_INPUT_MAX_DEPTH = 64;
export const PRESENTATION_INPUT_MAX_NODES = 16384;

export function encodePresentationInput(value: unknown): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let nodes = 0;
  function append(text: string) {
    const chunk = encoder.encode(text);
    bytes += chunk.length;
    if (bytes > PRESENTATION_INPUT_MAX_BYTES)
      throw new Error("Presentation input exceeds its encoding budget.");
    chunks.push(chunk);
  }
  function string(text: string) {
    if (text.length > PRESENTATION_INPUT_MAX_BYTES - bytes)
      throw new Error("Presentation input exceeds its encoding budget.");
    const data = encoder.encode(text);
    append(`s${data.length}:`);
    bytes += data.length;
    if (bytes > PRESENTATION_INPUT_MAX_BYTES)
      throw new Error("Presentation input exceeds its encoding budget.");
    chunks.push(data);
  }
  function visit(member: unknown, depth: number) {
    if (++nodes > PRESENTATION_INPUT_MAX_NODES)
      throw new Error("Presentation input exceeds its node budget.");
    if (depth > PRESENTATION_INPUT_MAX_DEPTH)
      throw new Error("Presentation input exceeds its nesting budget.");
    if (member === undefined || member === null) {
      append("n");
      return;
    }
    if (typeof member === "string") {
      string(member);
      return;
    }
    if (typeof member === "boolean") {
      append(member ? "b1" : "b0");
      return;
    }
    if (typeof member === "number") {
      if (!Number.isFinite(member))
        throw new Error("Presentation input contains a non-JSON number.");
      const buffer = new ArrayBuffer(8);
      new DataView(buffer).setFloat64(0, Object.is(member, -0) ? 0 : member, false);
      append(
        "d" +
          Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join(""),
      );
      return;
    }
    if (Array.isArray(member)) {
      append(`a${member.length}[`);
      for (const child of member) visit(child, depth + 1);
      append("]");
      return;
    }
    if (typeof member === "object") {
      const record = member as Record<string, unknown>;
      const keys = Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort();
      append(`o${keys.length}{`);
      for (const key of keys) {
        string(key);
        visit(record[key], depth + 1);
      }
      append("}");
      return;
    }
    throw new Error("Presentation input contains a non-JSON value.");
  }
  visit(value, 0);
  const result = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
