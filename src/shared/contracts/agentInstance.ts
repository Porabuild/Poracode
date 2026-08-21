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

export const CLAUDE_PROFILE_KIND_PREFIX = "claude:";
export const CURSOR_PROFILE_KIND_PREFIX = "cursor:";

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

/** Prefix for generic-ACP `kind` values. Unique per registered instance. */
export const ACP_GENERIC_KIND_PREFIX = "acp-generic:";

function prefixedKind(prefix: string, instanceId: string): AgentDriverKind {
  return `${prefix}${instanceId}` as AgentDriverKind;
}

function hasKindPrefix(kind: string, prefix: string): boolean {
  return kind.startsWith(prefix);
}

function kindInstanceId(kind: string, prefix: string): string | undefined {
  return hasKindPrefix(kind, prefix) ? kind.slice(prefix.length) : undefined;
}

export function acpGenericKind(instanceId: string): AgentDriverKind {
  return prefixedKind(ACP_GENERIC_KIND_PREFIX, instanceId);
}

export function isAcpGenericKind(kind: string): boolean {
  return hasKindPrefix(kind, ACP_GENERIC_KIND_PREFIX);
}

/** Extract the instance id portion of an `acp-generic:<id>` kind. */
export function extractAcpGenericInstanceId(kind: string): string | undefined {
  return kindInstanceId(kind, ACP_GENERIC_KIND_PREFIX);
}

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

/**
 * A model entry advertised by a Claude profile's picker. `id` is sent verbatim
 * to the CLI via `--model`; `label` is the display name (falls back to `id`).
 * Used to surface an external provider's model names (e.g. GLM) on a profile
 * that points Claude Code at a non-Anthropic `ANTHROPIC_BASE_URL`.
 */
export const claudeProfileModelSchema = z.object({
  id: z.string().min(1).max(200),
  label: z.string().min(1).max(120).optional(),
});
export type ClaudeProfileModel = z.infer<typeof claudeProfileModelSchema>;

export const claudeProfileInstanceConfigSchema = z.object({
  /**
   * Directory passed to Claude Code as CLAUDE_CONFIG_DIR. A leading "~/" is
   * resolved against the target runtime environment (native home or WSL home).
   */
  configDir: z.string().min(1),
  /**
   * Optional extension of the model list the picker shows for this profile.
   * When omitted, only the built-in Claude model list is used.
   */
  models: z.array(claudeProfileModelSchema).max(50).optional(),
  /**
   * Optional allow-list of effort tiers for this profile (subset of the
   * built-in tiers, e.g. `["high", "max"]`). Tiers outside this set are hidden
   * from the picker. When omitted, all built-in tiers are offered.
   */
  efforts: z.array(z.string().min(1).max(40)).max(20).optional(),
  /** Default effort selected for new threads when the profile exposes effort choices. */
  defaultEffort: z.string().min(1).max(40).optional(),
  /** Optional per-model effort choices for external-provider model ids. */
  modelEfforts: z
    .record(z.string().min(1).max(200), z.array(z.string().min(1).max(40)).max(20))
    .optional(),
});
export type ClaudeProfileInstanceConfig = z.infer<typeof claudeProfileInstanceConfigSchema>;

export function parseClaudeProfileInstanceConfig(value: unknown): ClaudeProfileInstanceConfig {
  return claudeProfileInstanceConfigSchema.parse(value ?? {});
}

// Profile payload schemas are provider-agnostic and live in `agentProfiles.ts`
// (`setProfileEnvironment`, `createProfile`). The per-provider helpers below are
// only naming sugar over the shared `<driver>:<id>` kind shape.

export function claudeProfileKind(instanceId: string): AgentDriverKind {
  return prefixedKind(CLAUDE_PROFILE_KIND_PREFIX, instanceId);
}

export function isClaudeProfileKind(kind: string): boolean {
  return hasKindPrefix(kind, CLAUDE_PROFILE_KIND_PREFIX);
}

export function extractClaudeProfileInstanceId(kind: string): string | undefined {
  return kindInstanceId(kind, CLAUDE_PROFILE_KIND_PREFIX);
}

export function cursorProfileKind(instanceId: string): AgentDriverKind {
  return prefixedKind(CURSOR_PROFILE_KIND_PREFIX, instanceId);
}

export function isCursorProfileKind(kind: string): boolean {
  return hasKindPrefix(kind, CURSOR_PROFILE_KIND_PREFIX);
}

export function extractCursorProfileInstanceId(kind: string): string | undefined {
  return kindInstanceId(kind, CURSOR_PROFILE_KIND_PREFIX);
}

/**
 * Strips the instance suffix from an instance-scoped kind (e.g.
 * "claude:work" → "claude"). Kinds without a suffix are returned unchanged.
 */
export function baseAgentKind(kind: string): string {
  const separatorIndex = kind.indexOf(":");
  return separatorIndex > 0 ? kind.slice(0, separatorIndex) : kind;
}
