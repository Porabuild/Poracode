import { z } from "zod";
import type { McpServer, McpTransport } from "@/shared/contracts";
import { normalizeSharedSettings, type SharedSettings } from "@/shared/settings";
import { mergeManagedSharedSettings } from "../../../sharedSettingsFile";
import type { ToolDomain } from "./types";

/** Placeholder substituted for every secret-bearing value returned by get_settings. */
export const REDACTED_VALUE = "«redacted»";

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
  "agentHookSupport",
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
  return { ...settings, agentInstances, mcpServers };
}

/** Mask the credential-bearing values of one MCP server's transport. */
export function redactMcpServer(server: McpServer): McpServer {
  return { ...server, transport: redactMcpTransport(server.transport) };
}

/** Replace every transport header/env value with a masked marker, keeping key names. */
function redactMcpTransport(transport: McpTransport): McpTransport {
  if (transport.type === "stdio") {
    return {
      ...transport,
      args: transport.args.map(redactSecretArg),
      env: maskValues(transport.env),
    };
  }
  return {
    ...transport,
    url: redactUrlQuery(transport.url),
    headers: maskValues(transport.headers),
  };
}

const SECRET_ARG_PATTERN = /^(--?[^=]*(?:key|token|secret|password|auth|credential)[^=]*)=.+$/i;

/** Mask the value of secret-shaped `--flag=value` args, keeping the flag name. */
function redactSecretArg(arg: string): string {
  const match = SECRET_ARG_PATTERN.exec(arg);
  return match ? `${match[1]}=${REDACTED_VALUE}` : arg;
}

/** Mask every query-string value in a URL (tokens are commonly passed there), keeping keys. */
function redactUrlQuery(url: string): string {
  const queryStart = url.indexOf("?");
  if (queryStart === -1) return url;
  const query = url
    .slice(queryStart + 1)
    .split("&")
    .map((pair) => {
      const eq = pair.indexOf("=");
      return eq === -1 ? pair : `${pair.slice(0, eq)}=${REDACTED_VALUE}`;
    })
    .join("&");
  return `${url.slice(0, queryStart)}?${query}`;
}

/** Map every value of a string record to the redaction marker, preserving keys. */
function maskValues(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.keys(record).map((key) => [key, REDACTED_VALUE]));
}

/**
 * Inverse of {@link redactMcpTransport}: wherever an incoming transport still
 * carries the {@link REDACTED_VALUE} marker (because an agent echoed back a
 * redacted read), substitute the real value stored on the existing transport.
 * Only matching same-type transports can restore values; a transport-type
 * change keeps the incoming (already-validated) values verbatim.
 */
export function restoreRedactedTransport(next: McpTransport, existing: McpTransport): McpTransport {
  if (next.type === "stdio") {
    if (existing.type !== "stdio") return next;
    return {
      ...next,
      args: next.args.map((arg) => restoreRedactedArg(arg, existing.args)),
      env: restoreRedactedRecord(next.env, existing.env),
    };
  }
  if (existing.type === "stdio") return next;
  return {
    ...next,
    url: restoreRedactedUrl(next.url, existing.url),
    headers: restoreRedactedRecord(next.headers, existing.headers),
  };
}

/** Restore any redaction-marked values in a string record from the stored record. */
function restoreRedactedRecord(
  next: Record<string, string>,
  existing: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(next).map(([key, value]) => [
      key,
      value === REDACTED_VALUE && Object.prototype.hasOwnProperty.call(existing, key)
        ? existing[key]!
        : value,
    ]),
  );
}

/** Restore a `--flag=«redacted»` arg from the stored arg carrying the same flag. */
function restoreRedactedArg(arg: string, existingArgs: readonly string[]): string {
  const marker = `=${REDACTED_VALUE}`;
  if (!arg.endsWith(marker)) return arg;
  const prefix = arg.slice(0, arg.length - REDACTED_VALUE.length); // includes trailing "="
  return existingArgs.find((candidate) => candidate.startsWith(prefix)) ?? arg;
}

/** Restore redaction-marked URL query values from the stored URL's matching keys. */
function restoreRedactedUrl(next: string, existing: string): string {
  const queryStart = next.indexOf("?");
  if (queryStart === -1) return next;
  const existingQuery = parseQuery(existing);
  const query = next
    .slice(queryStart + 1)
    .split("&")
    .map((pair) => {
      const eq = pair.indexOf("=");
      if (eq === -1) return pair;
      const key = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      if (value === REDACTED_VALUE && Object.prototype.hasOwnProperty.call(existingQuery, key)) {
        return `${key}=${existingQuery[key]}`;
      }
      return pair;
    })
    .join("&");
  return `${next.slice(0, queryStart)}?${query}`;
}

/** Parse a URL's query string into a key→value record (first value wins). */
function parseQuery(url: string): Record<string, string> {
  const queryStart = url.indexOf("?");
  if (queryStart === -1) return {};
  const out: Record<string, string> = {};
  for (const pair of url.slice(queryStart + 1).split("&")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const key = pair.slice(0, eq);
    if (!Object.prototype.hasOwnProperty.call(out, key)) out[key] = pair.slice(eq + 1);
  }
  return out;
}
