import type { AgentInstanceConfig, ProjectLocation } from "@/shared/contracts";
import {
  parseOpenCodeProfileInstanceConfig,
  type OpenCodeProfileInstanceConfig,
} from "@/shared/agents/opencode/profileConfig";
import {
  poracodeManagedProfileDir,
  poracodeManagedProfileNamespace,
  poracodeManagedProfileStem,
} from "@/shared/poracodePaths";
import { resolveTildePath } from "../base";

/**
 * The runtime identity of one OpenCode model profile.
 *
 * A profile gets its own `opencode serve` lease because a server's provider
 * catalog and database are process-wide. `env(location)` is resolved for the
 * execution runtime, then passed to every acquisition lane (structured
 * session, terminal attach, one-shot tag) and included in the server pool key,
 * so changing endpoint/model starts a fresh server while unrelated base or
 * profile servers keep their leases.
 */
export interface OpenCodeProfileRuntime {
  /** Stable pool-key component; changes when endpoint/model changes. */
  key: string;
  /** Exact route the profile advertises to the model picker and launches. */
  model: string;
  /** Raw upstream model id shown to the user; `model` stays the private route. */
  modelLabel: string;
  /** Per-runtime config/DB environment (native home or WSL home). */
  env(location: ProjectLocation): Promise<Record<string, string>>;
}

/**
 * The private provider id every local profile registers. A profile always owns
 * this one provider, so raw upstream ids (`openai/gpt-oss:20b`, `acme/foo`)
 * are stored and sent unchanged instead of being split into a public provider.
 */
export const OPENCODE_PROFILE_PROVIDER_ID = "poracode-profile";
const OPENAI_COMPATIBLE_PACKAGE = "@opencode/ai/providers/openai-compatible";

function profileConfigContent(config: OpenCodeProfileInstanceConfig, displayName: string): string {
  const model = config.model?.trim();
  if (!model) throw new Error("OpenCode profile is missing its model id.");
  const endpoint = config.endpoint?.trim();
  if (!endpoint) throw new Error("OpenCode profile is missing its endpoint.");
  return JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    // OpenCode splits a route at its first slash; everything after it stays the
    // upstream model id, including any further slashes.
    model: `${OPENCODE_PROFILE_PROVIDER_ID}/${model}`,
    providers: {
      [OPENCODE_PROFILE_PROVIDER_ID]: {
        name: displayName,
        package: OPENAI_COMPATIBLE_PACKAGE,
        // A dummy key keeps an inherited cloud credential out of the request.
        // Endpoints that require a real credential are not supported here.
        settings: { baseURL: endpoint, apiKey: OPENCODE_PROFILE_PROVIDER_ID },
        models: {
          [model]: {
            name: displayName,
            ...(config.contextLength !== undefined
              ? { limit: { context: config.contextLength } }
              : {}),
          },
        },
      },
    },
  });
}

export function parseOpenCodeProfileRuntime(instance: AgentInstanceConfig): OpenCodeProfileRuntime {
  const config = parseOpenCodeProfileInstanceConfig(instance.config);
  if (config.connection !== "local") {
    throw new Error("OpenCode profile is not a local model profile.");
  }
  const model = config.model?.trim();
  if (!model) throw new Error("OpenCode profile is missing its model id.");
  const endpoint = config.endpoint?.trim();
  if (!endpoint) throw new Error("OpenCode profile is missing its endpoint.");
  const displayName = instance.displayName ?? `OpenCode ${instance.id}`;
  const configContent = profileConfigContent(config, displayName);
  const namespace = poracodeManagedProfileNamespace();
  const database = `${poracodeManagedProfileStem("opencode-profile", instance.id)}.db`;
  const configDir = poracodeManagedProfileDir("opencode-profiles", instance.id);
  const key = `${OPENCODE_PROFILE_PROVIDER_ID}:${namespace}:${encodeURIComponent(instance.id)}:${JSON.stringify([endpoint, model])}`;
  return {
    key,
    model: `${OPENCODE_PROFILE_PROVIDER_ID}/${model}`,
    modelLabel: model,
    env: async (location) => ({
      OPENCODE_CONFIG_CONTENT: configContent,
      OPENCODE_CONFIG_DIR: await resolveTildePath(configDir, location),
      OPENCODE_DB: database,
    }),
  };
}
