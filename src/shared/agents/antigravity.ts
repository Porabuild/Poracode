export const ANTIGRAVITY_ACP_REGISTRY_ID = "antigravity-acp";
export const LEGACY_ANTIGRAVITY_ACP_KIND = `acp-generic:${ANTIGRAVITY_ACP_REGISTRY_ID}`;

const ANTIGRAVITY_ACP_MODEL_VARIANTS: Record<string, { model: string; effort: string }> = {
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
