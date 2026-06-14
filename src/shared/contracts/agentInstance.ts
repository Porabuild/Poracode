import { z } from "zod";

/**
 * Driver / instance model for user-registered agents.
 *
 * - `AgentDriverKind` is an open branded slug: built-in adapters reserve
 *   well-known values (`claude`, `codex`, ...) and users can register
 *   additional instances of the special `acp-generic` driver to plug any
 *   ACP-speaking binary into the chat UI without code changes.
 * - `AgentInstanceConfig` is the per-instance configuration. The `config`
 *   field is opaque (typed per-driver via discriminated union — see
 *   `acpGenericInstanceConfigSchema`).
 *
 * Built-in agents do NOT need an instance id; threads with `agentInstanceId`
 * unset are routed by `agentKind` alone.
 */

export const agentDriverKindSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_\-:.]*$/i);
export type AgentDriverKind = z.infer<typeof agentDriverKindSchema>;

/** Reserved built-in drivers. New ACP integrations should prefer `acp-generic`. */
export const KNOWN_AGENT_DRIVERS = {
  claude: "claude" as AgentDriverKind,
  codex: "codex" as AgentDriverKind,
  copilot: "copilot" as AgentDriverKind,
  gemini: "gemini" as AgentDriverKind,
  antigravity: "antigravity" as AgentDriverKind,
  commandCode: "commandcode" as AgentDriverKind,
  cursor: "cursor" as AgentDriverKind,
  opencode: "opencode" as AgentDriverKind,
  acpGeneric: "acp-generic" as AgentDriverKind,
} as const;

export const CLAUDE_PROFILE_KIND_PREFIX = "claude:";

export const agentInstanceIdSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9_\-:.]*$/i);
export type AgentInstanceId = z.infer<typeof agentInstanceIdSchema>;

export const agentInstanceEnvVarSchema = z.object({
  value: z.string(),
  sensitive: z.boolean().optional(),
});
export type AgentInstanceEnvVar = z.infer<typeof agentInstanceEnvVarSchema>;

/**
 * Per-environment record of successful interactive login flows.
 *
 * ACP does not surface a positive "user is signed in" signal during the
 * capabilities probe (some agents accept `newSession` without enforcing
 * auth), so we trust the result of our own `authenticate()` call instead.
 * Interactive auth state is per-env because browser/CLI sessions are not
 * shared across Windows and individual WSL distros — env-var credentials
 * remain shared (that path uses `environment` directly).
 */
export const agentInstanceAuthAcknowledgedSchema = z.object({
  native: z.boolean().optional(),
  wsl: z.record(z.string(), z.boolean()).optional(),
});
export type AgentInstanceAuthAcknowledged = z.infer<typeof agentInstanceAuthAcknowledgedSchema>;

export const agentInstanceConfigSchema = z.object({
  id: agentInstanceIdSchema,
  driver: agentDriverKindSchema,
  displayName: z.string().min(1).max(120).optional(),
  icon: z.string().optional(),
  version: z.string().optional(),
  accentColor: z.string().optional(),
  enabled: z.boolean().optional(),
  environment: z.record(z.string(), agentInstanceEnvVarSchema).optional(),
  authAcknowledged: agentInstanceAuthAcknowledgedSchema.optional(),
  /** Driver-specific config; validated by the per-driver schema (see `acpGenericInstanceConfigSchema`). */
  config: z.unknown().optional(),
});
export type AgentInstanceConfig = z.infer<typeof agentInstanceConfigSchema>;

// ── acp-generic driver config ────────────────────────────────────────

export const acpGenericInstanceConfigSchema = z.object({
  /** Absolute path or PATH-resolvable command name (e.g. `npx @zed-industries/codex-acp`). */
  binary: z.string().min(1),
  args: z.array(z.string()).optional(),
  /** "project" → use the thread's project cwd; "fixed" → use `fixedCwd`. */
  cwd: z.enum(["project", "fixed"]).default("project"),
  fixedCwd: z.string().optional(),
  authMode: z.enum(["none", "envVar"]).default("none"),
  authEnvVar: z.string().optional(),
  /** User-overridable capability declarations (when `initialize` doesn't surface them). */
  capabilities: z
    .object({
      models: z.array(z.string()).optional(),
      modes: z.array(z.string()).optional(),
    })
    .optional(),
});
export type AcpGenericInstanceConfig = z.infer<typeof acpGenericInstanceConfigSchema>;

/**
 * Map of registered instances — keyed by instance id, so a thread can refer
 * to its provider via `{ agentKind: "acp-generic", agentInstanceId: <id> }`.
 */
export const agentInstanceConfigMapSchema = z.record(
  agentInstanceIdSchema,
  agentInstanceConfigSchema,
);
export type AgentInstanceConfigMap = z.infer<typeof agentInstanceConfigMapSchema>;

export function parseAcpGenericInstanceConfig(value: unknown): AcpGenericInstanceConfig {
  return acpGenericInstanceConfigSchema.parse(value ?? {});
}

// ── claude profile driver config ────────────────────────────────────────

export const claudeProfileInstanceConfigSchema = z.object({
  /**
   * Directory passed to Claude Code as CLAUDE_CONFIG_DIR. A leading "~/" is
   * resolved against the target runtime environment (native home or WSL home).
   */
  configDir: z.string().min(1),
});
export type ClaudeProfileInstanceConfig = z.infer<typeof claudeProfileInstanceConfigSchema>;

export function parseClaudeProfileInstanceConfig(value: unknown): ClaudeProfileInstanceConfig {
  return claudeProfileInstanceConfigSchema.parse(value ?? {});
}

export function claudeProfileKind(instanceId: string): AgentDriverKind {
  return `${CLAUDE_PROFILE_KIND_PREFIX}${instanceId}` as AgentDriverKind;
}

export function isClaudeProfileKind(kind: string): boolean {
  return kind.startsWith(CLAUDE_PROFILE_KIND_PREFIX);
}

export function extractClaudeProfileInstanceId(kind: string): string | undefined {
  return isClaudeProfileKind(kind) ? kind.slice(CLAUDE_PROFILE_KIND_PREFIX.length) : undefined;
}

/**
 * Strips the instance suffix from an instance-scoped kind (e.g.
 * "claude:work" → "claude"). Kinds without a suffix are returned unchanged.
 */
export function baseAgentKind(kind: string): string {
  const separatorIndex = kind.indexOf(":");
  return separatorIndex > 0 ? kind.slice(0, separatorIndex) : kind;
}
