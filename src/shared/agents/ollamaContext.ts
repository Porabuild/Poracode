import { MAX_CONTEXT_WINDOW_TOKENS, MIN_CONTEXT_WINDOW_TOKENS } from "../contextWindow";
import { sha256Hex } from "../remote/contract/sha256";
import { isCloudOllamaModelTag } from "./ollamaModelInventory";

export const OLLAMA_CONTEXT_ALIAS_PREFIX = "poracode-ctx-";

/** Only the exact host/route shapes Poracode actually prepares models on. */
const OLLAMA_CONTEXT_ENDPOINTS = new Set(["http://127.0.0.1:11434", "http://127.0.0.1:11434/v1"]);

/** Installed model ids may be opaque, but they must stay safe as literals. */
const SAFE_OLLAMA_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,199}$/u;

export function isOllamaContextLength(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= MIN_CONTEXT_WINDOW_TOKENS &&
    value <= MAX_CONTEXT_WINDOW_TOKENS
  );
}

export type OllamaContextInputParse =
  | { kind: "default" }
  | { kind: "valid"; tokens: number }
  | { kind: "invalid" };

/**
 * Parses the editable Context length field. An empty field is the explicit
 * Server default state; every non-empty value must be an exact whole token
 * count in Poracode's shared context-window range.
 */
export function parseOllamaContextInput(raw: string, badInput = false): OllamaContextInputParse {
  if (badInput) return { kind: "invalid" };
  const value = raw.trim();
  if (!value) return { kind: "default" };
  if (!/^\d+$/u.test(value)) return { kind: "invalid" };
  const tokens = Number(value);
  if (!Number.isSafeInteger(tokens) || !isOllamaContextLength(tokens)) {
    return { kind: "invalid" };
  }
  return { kind: "valid", tokens };
}

/**
 * True for a local model id that can be sent to the local Ollama API without
 * shell or JSON escaping surprises. Unlike a pull tag this accepts arbitrary
 * installed ids (including uppercase/registry forms) but still rejects spaces,
 * control characters, quotes, and shell metacharacters. Cloud aliases are
 * excluded because they have no account-free local route.
 */
export function isValidOllamaInstalledModelId(value: string): boolean {
  const model = value.trim();
  return model.length > 0 && SAFE_OLLAMA_MODEL_ID.test(model) && !isCloudOllamaModelTag(model);
}

function normalizeEndpoint(value: string): string {
  return value.trim().replace(/\/+$/u, "");
}

/**
 * A profile is context-eligible only when it points at the exact Ollama host
 * Poracode prepares models on. `expected` is the provider's declared local
 * endpoint shape (`/v1` for OpenCode and Codex, the root for Claude); when
 * omitted, both supported shapes are accepted. A generic loopback URL on
 * another port or path never qualifies.
 */
export function isOllamaLoopbackEndpoint(value: string, expected?: string): boolean {
  const normalized = normalizeEndpoint(value);
  if (expected !== undefined) return normalized === normalizeEndpoint(expected);
  return OLLAMA_CONTEXT_ENDPOINTS.has(normalized);
}

/**
 * A random id from Web Crypto's insecure-context-safe source. `randomUUID` is
 * secure-context only, while paired HTTP clients still need to create aliases.
 */
export function generateOllamaContextAliasId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * A per-creation alias in Poracode's reserved namespace. A mutable base tag
 * (`:latest`) can resolve to different weights after a pull, so aliases are
 * never reused across creations: each one carries a fresh collision-resistant
 * id. The base hash keeps two bases at the same window recognizable in logs.
 */
export function ollamaContextAlias(
  baseModel: string,
  contextLength: number,
  uniqueId: string = generateOllamaContextAliasId(),
): string {
  const base = baseModel.trim();
  if (!isValidOllamaInstalledModelId(base)) throw new Error("Invalid Ollama model id.");
  if (!isOllamaContextLength(contextLength)) throw new Error("Invalid Ollama context length.");
  if (!/^[a-z0-9]{8,64}$/u.test(uniqueId)) throw new Error("Invalid Ollama alias id.");
  const baseHash = sha256Hex(base).slice(0, 12);
  return `${OLLAMA_CONTEXT_ALIAS_PREFIX}${contextLength}-${baseHash}-${uniqueId}`;
}
