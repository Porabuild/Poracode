import { z } from "zod";
import {
  agentInstanceEnvVarSchema,
  agentInstanceIdSchema,
  baseAgentKind,
  type AgentDriverKind,
} from "./agentInstance";

/**
 * Multi-profile providers.
 *
 * A "profile" is a second (third, …) account or configuration of a provider
 * that already exists as a built-in agent. Each profile is an
 * `AgentInstanceConfig` whose `driver` names its provider, and it surfaces as
 * the instance-scoped agent kind `<driver>:<instanceId>` (`claude:work`).
 *
 * This module is the ONE place shared code learns which providers support
 * profiles. Everything downstream — the encrypting settings writer, the
 * supervisor registry, the settings sidebar, the profile list UI — reads this
 * registry instead of testing for a specific provider, so adding profiles to a
 * new provider means adding one entry here plus that provider's own adapter and
 * settings descriptor. No shared file needs a new branch.
 *
 * `acp-generic` instances also use the `<driver>:<id>` kind shape but are NOT
 * profiles: they are standalone registry agents with no built-in base provider,
 * and the supervisor owns their settings. They are deliberately absent here.
 */
export interface AgentProfileDriver {
  /** `AgentInstanceConfig.driver` value, and the agent-kind prefix. */
  driver: string;
  /**
   * Env var holding the profile credential for providers that authenticate
   * with a single secret. Providers whose profiles carry free-form
   * environments (Claude) omit it.
   */
  credentialEnvVar?: string;
}

export const AGENT_PROFILE_DRIVERS: readonly AgentProfileDriver[] = [
  { driver: "claude" },
  { driver: "cursor", credentialEnvVar: "CURSOR_API_KEY" },
];

const BY_DRIVER = new Map(AGENT_PROFILE_DRIVERS.map((entry) => [entry.driver, entry]));

export function agentProfileDriver(driver: string): AgentProfileDriver | undefined {
  return BY_DRIVER.get(driver);
}

/** True for providers whose instances are profiles of a built-in agent. */
export function isAgentProfileDriver(driver: string): boolean {
  return BY_DRIVER.has(driver);
}

/** `("claude", "work")` → `"claude:work"`. */
export function agentProfileKind(driver: string, instanceId: string): AgentDriverKind {
  return `${driver}:${instanceId}` as AgentDriverKind;
}

/** True only for instance-scoped kinds of a registered profile driver. */
export function isAgentProfileKind(kind: string): boolean {
  const driver = baseAgentKind(kind);
  return driver !== kind && BY_DRIVER.has(driver);
}

/**
 * Splits an instance-scoped kind into its driver and instance id, or returns
 * `undefined` for base kinds and for instance kinds of non-profile drivers
 * (`acp-generic:foo`).
 */
export function parseAgentProfileKind(
  kind: string,
): { driver: string; instanceId: string } | undefined {
  const driver = baseAgentKind(kind);
  if (driver === kind || !BY_DRIVER.has(driver)) return undefined;
  const instanceId = kind.slice(driver.length + 1);
  return instanceId ? { driver, instanceId } : undefined;
}

/** Instance id of a profile kind, for any registered profile driver. */
export function extractAgentProfileInstanceId(kind: string): string | undefined {
  return parseAgentProfileKind(kind)?.instanceId;
}

/**
 * Payload for the `setProfileEnvironment` main-local IPC. The renderer sends
 * the full desired environment (plaintext for freshly-entered values, already
 * sealed `lc-safe:` blobs round-tripped for unchanged secrets); the main
 * process seals any `sensitive` plaintext before writing settings.json.
 */
export const setProfileEnvironmentPayloadSchema = z.object({
  instanceId: agentInstanceIdSchema,
  environment: z.record(z.string().min(1).max(200), agentInstanceEnvVarSchema),
});
export type SetProfileEnvironmentPayload = z.infer<typeof setProfileEnvironmentPayloadSchema>;

/**
 * Payload for the `createProfile` main-local IPC. `environment` goes through
 * the same sealing path as `setProfileEnvironment`, so a provider whose profile
 * is created with a credential never routes that secret through the renderer's
 * plaintext settings flush.
 */
export const createProfilePayloadSchema = z.object({
  driver: z.string().min(1).max(64),
  id: agentInstanceIdSchema,
  displayName: z.string().min(1).max(120),
  environment: z.record(z.string().min(1).max(200), agentInstanceEnvVarSchema).optional(),
  /** Opaque per-driver config (e.g. a Claude profile's `configDir`). */
  config: z.unknown().optional(),
});
export type CreateProfilePayload = z.infer<typeof createProfilePayloadSchema>;
