import { z } from "zod";
import { isSensitiveAgentSetting, sensitiveAgentSettingKeys } from "@/shared/agentSecrets";
import { normalizeSharedSettings, type SharedSettings } from "@/shared/settings";
import { mergeManagedSharedSettings } from "../../../sharedSettingsFile";
import { REDACTED_VALUE, redactMcpServer, restoreRedactedTransport } from "@/host/mcpSettings";
import type { ToolDomain } from "./types";

export { REDACTED_VALUE, redactMcpServer, restoreRedactedTransport };

/**
 * Settings keys that carry (or gate) secrets and must never be written through
 * this agent-facing tool. `agentInstances` holds Claude-profile environments
 * with sealed API keys/tokens; profile secrets are edited only via the
 * dedicated encrypting path. `mcpServers` transport values carry secrets and a
 * deep-merged array write would clobber other servers' real (unredacted)
 * values — it is edited only through add/update/remove_mcp_server. The
 * remaining keys are supervisor-managed.
 */
const PROTECTED_SETTINGS_KEYS: ReadonlySet<string> = new Set([
  "agentInstances",
  "acpRegistryInstalledAgents",
  "acpRegistryAutoInstallOptOuts",
  "agentHookSupport",
  "crossagentSelectionUsage",
  "crossagentRoutingOverrides",
  "mcpServers",
]);

const getArgsSchema = z.object({ section: z.string().min(1).optional() });
const updateArgsSchema = z.object({
  patch: z.record(z.string(), z.unknown()),
});

export const settingsTools: ToolDomain = {
  specs: [
    {
      name: "get_settings",
      description:
        "Read the app's shared settings (whole object, or a single top-level section). Secret-bearing values are redacted: agent profile environment variables return only their name and sensitive flag, and MCP server transport headers/env return their key names with values masked — never the values themselves.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: { section: { type: "string" } },
      },
    },
    {
      name: "update_settings",
      description:
        "Deep-merge a partial patch into the app's shared settings. Changes apply immediately app-wide. Cannot modify secret-bearing or supervisor-managed fields (agent profiles/instances, installed ACP agents, hook support). MCP servers are managed with the dedicated add_mcp_server/update_mcp_server/remove_mcp_server tools, not this one.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["patch"],
        properties: { patch: { type: "object" } },
      },
    },
  ],
  handlers: {
    get_settings: (args, ctx) => {
      const { section } = getArgsSchema.parse(args);
      const redacted = redactSharedSettings(ctx.settings.read());
      if (section === undefined) return { settings: redacted };
      if (!Object.prototype.hasOwnProperty.call(redacted, section)) {
        throw new Error(
          `Unknown settings section: ${section}. Valid sections: ${Object.keys(redacted)
            .sort()
            .join(", ")}.`,
        );
      }
      return { section, value: (redacted as Record<string, unknown>)[section] };
    },
    update_settings: (args, ctx) => {
      const { patch } = updateArgsSchema.parse(args);
      const rejected = Object.keys(patch).filter((key) => PROTECTED_SETTINGS_KEYS.has(key));
      const rejectedAgentSecrets = findPatchedAgentSecrets(patch.agentSettings);
      if (rejected.length > 0) {
        const hint = rejected.includes("mcpServers")
          ? " Manage MCP servers with add_mcp_server, update_mcp_server, and remove_mcp_server."
          : "";
        throw new Error(
          `These settings are managed elsewhere and cannot be changed with this tool: ${rejected.join(
            ", ",
          )}.${hint}`,
        );
      }
      if (rejectedAgentSecrets.length > 0) {
        throw new Error(
          `These sensitive agent settings are managed elsewhere and cannot be changed with this tool: ${rejectedAgentSecrets.join(
            ", ",
          )}.`,
        );
      }
      const onDisk = ctx.settings.read();
      const candidate = deepMerge(onDisk as Record<string, unknown>, patch);
      const normalized = normalizeSharedSettings(candidate);
      // Defense in depth: re-pin supervisor-managed fields and encrypted
      // profile environments regardless of what the patch attempted.
      const merged = mergeManagedSharedSettings(onDisk, normalized);
      ctx.settings.write(merged);
      return { updated: true, appliedKeys: Object.keys(patch).sort() };
    },
  },
};

/** Whether a value is a plain object (mergeable), as opposed to an array/primitive. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Recursively merge `patch` into a shallow copy of `base`; arrays replace. */
function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const current = result[key];
    result[key] =
      isPlainObject(current) && isPlainObject(value) ? deepMerge(current, value) : value;
  }
  return result;
}

/**
 * Strip secret values from settings before returning them.
 *
 * Two value-bearing credential surfaces exist in {@link SharedSettings}:
 *   - `agentInstances[].environment`: Claude-profile API keys/tokens (sealed or
 *     plaintext), replaced by a name+sensitive-flag summary.
 *   - `mcpServers[].transport`: HTTP/SSE `headers` and stdio `env` frequently
 *     carry bearer tokens / API keys. Their key names are preserved (so an agent
 *     can see what is configured) but every value is masked.
 *
 * An agent can therefore see what is configured without ever reading a secret.
 */
export function redactSharedSettings(settings: SharedSettings): Record<string, unknown> {
  const agentSettings = Object.fromEntries(
    Object.entries(settings.agentSettings).map(([agentKind, values]) => {
      const next = { ...values };
      for (const key of sensitiveAgentSettingKeys(agentKind)) {
        if (key in next) next[key] = REDACTED_VALUE;
      }
      return [agentKind, next];
    }),
  );
  const agentInstances = Object.fromEntries(
    Object.entries(settings.agentInstances).map(([id, instance]) => {
      if (!instance.environment) return [id, instance];
      const environment = Object.fromEntries(
        Object.entries(instance.environment).map(([name, variable]) => [
          name,
          { sensitive: variable.sensitive === true },
        ]),
      );
      return [id, { ...instance, environment }];
    }),
  );
  const mcpServers = settings.mcpServers.map(redactMcpServer);
  return { ...settings, agentSettings, agentInstances, mcpServers };
}

function findPatchedAgentSecrets(value: unknown): string[] {
  if (!isPlainObject(value)) return [];
  return Object.entries(value).flatMap(([agentKind, settings]) => {
    if (!isPlainObject(settings)) return [];
    return Object.keys(settings)
      .filter((key) => isSensitiveAgentSetting(agentKind, key))
      .map((key) => `${agentKind}.${key}`);
  });
}
