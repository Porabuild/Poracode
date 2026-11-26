import { z } from "zod";
import type { AgentCapability } from "../../contracts/agent";
import { modelProviderUrlSchema } from "../../contracts/modelProviders";
import { isOllamaContextLength } from "../ollamaContext";

/** A provider-owned, auth-scoped route to one local Anthropic-compatible model. */
export const claudeLocalProfileRouteSchema = z
  .object({
    endpoint: modelProviderUrlSchema,
    model: z.string().trim().min(1).max(200),
    /** Original installed model behind a context-derived `model` alias. */
    baseModel: z.string().trim().min(1).max(200).optional(),
    /** Ollama `num_ctx` baked into the derived alias. */
    contextLength: z.number().int().refine(isOllamaContextLength).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.contextLength !== undefined && !value.baseModel) {
      ctx.addIssue({ code: "custom", path: ["baseModel"], message: "Base model is required." });
    }
    if (value.baseModel !== undefined && value.contextLength === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["contextLength"],
        message: "Context length is required.",
      });
    }
  });
export type ClaudeLocalProfileRoute = z.infer<typeof claudeLocalProfileRouteSchema>;

/**
 * A value, not a real credential, so a local profile never falls back to the
 * base account's OAuth session. Servers that ignore auth still see a non-empty
 * token; servers that require one fail with their own auth error instead of
 * silently using Anthropic credentials.
 */
export const CLAUDE_LOCAL_AUTH_TOKEN_PLACEHOLDER = "poracode-local-profile";

/** Claude's model-alias environment, all pinned to the selected local id. */
export const CLAUDE_LOCAL_MODEL_ALIASES = [
  "ANTHROPIC_MODEL",
  "ANTHROPIC_DEFAULT_FABLE_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "CLAUDE_CODE_SUBAGENT_MODEL",
] as const;

/**
 * Credential and alternate-backend variables a local profile must shadow on
 * every spawn lane. Empty strings are intentional: persistence drops empty
 * values, so the runtime re-adds them after the stored environment.
 */
const CLAUDE_LOCAL_SHADOWED_ENV = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_API_KEY_HELPER",
  "CLAUDE_CODE_API_KEY_HELPER",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "ANTHROPIC_CUSTOM_HEADERS",
  "AWS_BEARER_TOKEN_BEDROCK",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY",
  "CLAUDE_CODE_USE_MANTLE",
  "CLAUDE_CODE_USE_ANTHROPIC_AWS",
] as const;

/** The final local-profile environment, applied after every stored override. */
export function claudeLocalProfileEnv(route: ClaudeLocalProfileRoute): Record<string, string> {
  const env: Record<string, string> = {
    ANTHROPIC_BASE_URL: route.endpoint.trim(),
    ANTHROPIC_AUTH_TOKEN: CLAUDE_LOCAL_AUTH_TOKEN_PLACEHOLDER,
  };
  for (const key of CLAUDE_LOCAL_SHADOWED_ENV) env[key] = "";
  for (const key of CLAUDE_LOCAL_MODEL_ALIASES) env[key] = route.model.trim();
  if (route.contextLength !== undefined) {
    // Pin the harness's own bookkeeping to the derived Ollama window. Claude's
    // auto-compact override only accepts 100K+, so smaller windows rely on the
    // max-context value and Ollama's own load-time limit.
    env.CLAUDE_CODE_MAX_CONTEXT_TOKENS = String(route.contextLength);
    if (route.contextLength >= 100_000) {
      env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = String(route.contextLength);
    }
  }
  return env;
}

/** Unique, filesystem-safe config directory derived from the allocated profile id. */
export function claudeLocalProfileConfigDir(profileId: string): string {
  return `~/.poracode/claude-profiles/${encodeURIComponent(profileId)}`;
}

/** Host-namespaced managed directory used by the supervisor runtime. */
export function claudeManagedLocalProfileDir(profileId: string, namespace: string): string {
  return `~/.poracode/claude-profiles/${namespace}/${encodeURIComponent(profileId)}`;
}

/**
 * A local route owns exactly one selectable model. The base Claude catalog
 * (cloud aliases and all) must not leak into a local profile's picker or its
 * default effort/model relations.
 */
export function clampClaudeLocalCapabilities(
  capabilities: AgentCapability,
  model: string,
): AgentCapability {
  const next = {
    ...capabilities,
    models: [{ id: model, label: model }],
    efforts: [],
    modelEfforts: {},
  };
  delete next.defaultEffort;
  delete next.defaultHiddenModels;
  delete next.modelDefaultEfforts;
  delete next.subProviders;
  delete next.modelSubProvider;
  delete next.modelFamilies;
  delete next.contextSizes;
  delete next.modelContextSizes;
  delete next.defaultContextSize;
  delete next.fastModels;
  delete next.fastDisabledReason;
  delete next.thinkingModels;
  delete next.workflowModels;
  delete next.workflowLabel;
  return next;
}
