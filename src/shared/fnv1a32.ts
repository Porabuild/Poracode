/**
 * FNV-1a over UTF-16 code units, returned as an unsigned 32-bit number.
 * Keep the input encoding and arithmetic stable: existing persisted identifiers
 * use this hash. Callers own their decimal, base36, or padded-hex formatting.
 */
export function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}
