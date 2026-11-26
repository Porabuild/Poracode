import { z } from "zod";
import type { AgentCapability } from "../../contracts/agent";
import type { ThreadConfig } from "../../contracts/config";
import { modelProviderUrlSchema } from "../../contracts/modelProviders";
import { isOllamaContextLength } from "../ollamaContext";
import { autoCompactTokenLimit, contextWindowIdFromTokens } from "../codexContextWindows";

/** A provider-owned local OpenAI-compatible route for a Codex profile. */
export const codexLocalProfileRouteSchema = z
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
export type CodexLocalProfileRoute = z.infer<typeof codexLocalProfileRouteSchema>;

/** Private provider id registered by the profile's scoped command overrides. */
export const CODEX_LOCAL_PROVIDER_ID = "poracode_local";

function tomlString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

/**
 * Codex's per-launch provider override. Nothing is written to the user's
 * `CODEX_HOME`/`config.toml`; the route rides on the command line for every
 * launch lane so ordinary profiles and user-managed homes stay untouched.
 */
export function codexLocalProfileArgs(route: CodexLocalProfileRoute): string[] {
  const prefix = `model_providers.${CODEX_LOCAL_PROVIDER_ID}`;
  const args = [
    "-c",
    `model_provider="${CODEX_LOCAL_PROVIDER_ID}"`,
    "-c",
    `${prefix}.name="Local"`,
    "-c",
    `${prefix}.base_url="${tomlString(route.endpoint.trim())}"`,
    "-c",
    `${prefix}.wire_api="responses"`,
    "-c",
    `${prefix}.requires_openai_auth=false`,
  ];
  if (route.contextLength !== undefined) {
    // Align Codex's own compaction with the Ollama window baked into the
    // alias. The derived model still receives the same alias on the wire.
    args.push(
      "-c",
      `model_context_window=${route.contextLength}`,
      "-c",
      `model_auto_compact_token_limit=${autoCompactTokenLimit(route.contextLength)}`,
    );
  }
  return args;
}

/**
 * A local profile pins its one model and, when a context alias was derived,
 * its own window. The structured app-server lane passes these as thread
 * overrides, so a renderer context-size default cannot widen the request past
 * the Ollama alias's `num_ctx`.
 */
export function pinCodexLocalThreadConfig(
  config: ThreadConfig,
  local: CodexLocalProfileRoute,
): ThreadConfig {
  const { effort: _effort, fast: _fast, contextSize: _contextSize, ...rest } = config;
  return {
    ...rest,
    model: local.model,
    ...(local.contextLength !== undefined
      ? { contextSize: contextWindowIdFromTokens(local.contextLength) }
      : {}),
  };
}

/** Host-namespaced managed home for a local Codex profile. */
export function codexManagedLocalProfileHome(profileId: string, namespace: string): string {
  return `~/.poracode/codex-profiles/${namespace}/${encodeURIComponent(profileId)}`;
}

/** A local route owns exactly one model and no inherited cloud catalogs. */
export function clampCodexLocalCapabilities(
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
