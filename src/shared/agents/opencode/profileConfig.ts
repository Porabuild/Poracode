import { z } from "zod";
import { modelProviderUrlSchema } from "../../contracts/modelProviders";
import { isOllamaContextLength } from "../ollamaContext";

/** Prefix for instance-scoped OpenCode profile kinds. */
export const OPENCODE_PROFILE_KIND_PREFIX = "opencode:";

/**
 * A named OpenCode model profile. The empty `agent` form reuses the normal
 * OpenCode account/config; `local` starts an isolated OpenCode server with one
 * private OpenAI-compatible provider and database for the given endpoint.
 *
 * There is deliberately no public provider id: the runtime always registers
 * the private `poracode-profile` provider, so an upstream model id such as
 * `openai/gpt-oss:20b` or `acme/foo` reaches the server verbatim.
 */
export const opencodeProfileInstanceConfigSchema = z
  .object({
    connection: z.enum(["agent", "local"]).default("agent"),
    /** OpenAI-compatible base URL, including `/v1` when the server needs it. */
    endpoint: modelProviderUrlSchema.optional(),
    /** Exact model id exposed by the endpoint, without any provider prefix. */
    model: z.string().trim().min(1).max(200).optional(),
    /**
     * Original installed model behind a context-derived `model` alias. Set
     * only together with `contextLength`; an ordinary local route leaves both
     * absent and sends `model` unchanged.
     */
    baseModel: z.string().trim().min(1).max(200).optional(),
    /** Ollama `num_ctx` baked into the derived alias. */
    contextLength: z.number().int().refine(isOllamaContextLength).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.connection !== "local") return;
    if (!value.endpoint) {
      ctx.addIssue({ code: "custom", path: ["endpoint"], message: "Endpoint is required." });
    }
    if (!value.model) {
      ctx.addIssue({ code: "custom", path: ["model"], message: "Model id is required." });
    }
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
export type OpenCodeProfileInstanceConfig = z.infer<typeof opencodeProfileInstanceConfigSchema>;

export function parseOpenCodeProfileInstanceConfig(value: unknown): OpenCodeProfileInstanceConfig {
  return opencodeProfileInstanceConfigSchema.parse(value ?? {});
}

/** Provider-owned registry descriptor; the common registry only registers it. */
export const opencodeProfileDriver = {
  driver: "opencode",
  validateConfig: parseOpenCodeProfileInstanceConfig,
} as const;

export function opencodeProfileKind(instanceId: string): string {
  return `${OPENCODE_PROFILE_KIND_PREFIX}${instanceId}`;
}

export function isOpenCodeProfileKind(kind: string): boolean {
  return kind.startsWith(OPENCODE_PROFILE_KIND_PREFIX);
}

export function extractOpenCodeProfileInstanceId(kind: string): string | undefined {
  return isOpenCodeProfileKind(kind) ? kind.slice(OPENCODE_PROFILE_KIND_PREFIX.length) : undefined;
}
