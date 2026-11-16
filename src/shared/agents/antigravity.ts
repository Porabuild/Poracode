import { baseAgentKind } from "@/shared/contracts/agentInstance";

export const ANTIGRAVITY_ACP_REGISTRY_ID = "antigravity-acp";
export const LEGACY_ANTIGRAVITY_ACP_KIND = `acp-generic:${ANTIGRAVITY_ACP_REGISTRY_ID}`;

export function isAntigravityAgentKind(agentKind: string): boolean {
  return baseAgentKind(agentKind) === "antigravity" || agentKind === LEGACY_ANTIGRAVITY_ACP_KIND;
}

export function sanitizePersistedAntigravityContextUsage(
  raw: string,
): { action: "keep" } | { action: "update"; usage: string } | { action: "delete" } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { action: "keep" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { action: "keep" };
  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.breakdown)) return { action: "keep" };
  const { usedTokens: _usedTokens, breakdown: _breakdown, maxTokens, ...rest } = record;
  const validMaxTokens =
    typeof maxTokens === "number" && Number.isSafeInteger(maxTokens) && maxTokens > 0;
  const next = validMaxTokens ? { ...rest, maxTokens } : rest;
  return Object.keys(next).length > 0
    ? { action: "update", usage: JSON.stringify(next) }
    : { action: "delete" };
}

const ANTIGRAVITY_ACP_MODEL_VARIANTS: Record<string, { model: string; effort: string }> = {
  "gemini-4-argon-high": { model: "gemini-4-argon", effort: "High" },
  "gemini-4-argon-medium": { model: "gemini-4-argon", effort: "Medium" },
  "gemini-4-argon-low": { model: "gemini-4-argon", effort: "Low" },
  "gemini-3.8-flash-high": { model: "gemini-3.8-flash", effort: "High" },
  "gemini-3.8-flash-medium": { model: "gemini-3.8-flash", effort: "Medium" },
  "gemini-3.8-flash-low": { model: "gemini-3.8-flash", effort: "Low" },
  "gemini-3.7-flash-high": { model: "gemini-3.7-flash", effort: "High" },
  "gemini-3.7-flash-medium": { model: "gemini-3.7-flash", effort: "Medium" },
  "gemini-3.7-flash-low": { model: "gemini-3.7-flash", effort: "Low" },
  "gemini-3.6-flash-high": { model: "gemini-3.6-flash", effort: "High" },
  "gemini-3.6-flash-medium": { model: "gemini-3.6-flash", effort: "Medium" },
  "gemini-3.6-flash-low": { model: "gemini-3.6-flash", effort: "Low" },
  "gemini-3-flash-agent": { model: "gemini-3.5-flash", effort: "High" },
  "gemini-3.5-flash-low": { model: "gemini-3.5-flash", effort: "Medium" },
  "gemini-3.5-flash-extra-low": { model: "gemini-3.5-flash", effort: "Low" },
  "gemini-pro-agent": { model: "gemini-3.1-pro", effort: "High" },
  "gemini-3.1-pro-low": { model: "gemini-3.1-pro", effort: "Low" },
};

export function normalizeAntigravityAcpModelSelection(
  model: string,
  effort?: string,
): { model: string; effort?: string } {
  return ANTIGRAVITY_ACP_MODEL_VARIANTS[model] ?? { model, ...(effort ? { effort } : {}) };
}

/**
 * Normalize a persisted provider selection without reinterpreting a valid CLI
 * slug as ACP wire state. `gemini-3.5-flash-low` is the one ambiguous id: it
 * means Low in `agy` but Medium in the ACP server.
 */
export function normalizePersistedAntigravityModelSelection(
  model: string,
  effort?: string,
  acpOrigin = false,
): { model: string; effort?: string } {
  if (!acpOrigin && model === "gemini-3.5-flash-low") {
    return { model, ...(effort ? { effort } : {}) };
  }
  return normalizeAntigravityAcpModelSelection(model, effort);
}
