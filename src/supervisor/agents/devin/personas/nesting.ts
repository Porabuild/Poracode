import { isAlias, isMap, isScalar, type Document } from "yaml";

/** Native CLI 3000.11.3 max-nesting is an optional u32. */
export const DEVIN_PERSONA_MAX_NESTING_U32_MAX = 4294967295;

// Native accepts an optional positive sign and decimal, hex, octal or binary
// integers. Float syntax and negative zero cannot be recovered from JS values.
const DEVIN_PERSONA_NESTING_U32_SOURCE = /^\+?(?:0x[0-9a-fA-F]+|0o[0-7]+|0b[01]+|[0-9]+)$/;

/** Private parse metadata; preserves native distinctions lost by YAML toJS. */
export type DevinPersonaMaxNestingScalar =
  | { kind: "absent" }
  | { kind: "default" }
  | { kind: "u32"; value: number }
  | { kind: "invalid" };

/**
 * Follow alias chains to their source node (`max-nesting: *anchor` classifies
 * as the anchored scalar, mirroring native alias resolution). Returns
 * `undefined` when a chain cannot be resolved or exceeds `maxHops` hops.
 */
function resolveDevinAliasChain(node: unknown, document: Document, maxHops = 16): unknown {
  let current = node;
  for (let hops = 0; isAlias(current); hops += 1) {
    if (hops >= maxHops) return undefined;
    current = current.resolve(document);
  }
  return current;
}

/**
 * Classify the `max-nesting` value node of an already-parsed frontmatter
 * document under native u32 scalar semantics. The AST is walked, not
 * re-parsed; keys are compared by resolved value so alias keys match the way
 * the record was built.
 */
export function classifyDevinPersonaMaxNesting(document: Document): DevinPersonaMaxNestingScalar {
  if (!isMap(document.contents)) return { kind: "absent" };
  let match: unknown;
  let found = false;
  for (const pair of document.contents.items) {
    const key = resolveDevinAliasChain(pair.key, document);
    if (isScalar(key) && key.value === "max-nesting") {
      match = pair.value;
      found = true;
    }
  }
  if (!found) return { kind: "absent" };
  if (match === null) return { kind: "default" };
  const value = resolveDevinAliasChain(match, document);
  if (!isScalar(value)) return { kind: "invalid" }; // sequence/mapping → CFG005
  if (value.value === null) return { kind: "default" }; // empty value / null keyword
  if (value.tag === "tag:yaml.org,2002:null") return { kind: "invalid" };
  if (value.type !== "PLAIN") return { kind: "invalid" }; // quoted/block → string → CFG005
  const source = value.source;
  if (source === undefined || !DEVIN_PERSONA_NESTING_U32_SOURCE.test(source)) {
    return { kind: "invalid" }; // bool / float spelling / negative / string keyword
  }
  const unsigned = source.startsWith("+") ? source.slice(1) : source;
  const radix = unsigned.startsWith("0x")
    ? 16
    : unsigned.startsWith("0o")
      ? 8
      : unsigned.startsWith("0b")
        ? 2
        : 10;
  const parsed = Number.parseInt(radix === 10 ? unsigned : unsigned.slice(2), radix);
  if (!Number.isSafeInteger(parsed) || parsed > DEVIN_PERSONA_MAX_NESTING_U32_MAX) {
    return { kind: "invalid" }; // above u32 range
  }
  return { kind: "u32", value: parsed };
}
