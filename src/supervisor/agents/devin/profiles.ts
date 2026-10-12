import type { AgentInstanceConfig } from "@/shared/contracts";
import {
  describeDevinProfileConfigUnavailability,
  isUsableDevinProfileConfig,
  parseDevinProfileConfig,
} from "./profileConfig";
import { devinExecutionSettingsFromConfig } from "./profileContext";
import { createDevinAdapter } from "./index";

/**
 * Supervisor registry factory for Devin profiles (`devin:<instanceId>` kinds).
 *
 * Receives the persisted `AgentInstanceConfig` plus the factory context
 * supplied by the shared registry (`resolveInstance`). Devin profiles do NOT
 * require a credential: same-login profiles share the native default login,
 * and isolated accounts authenticate through their own Poracode-managed root —
 * so unlike Cursor there is no `credentialEnvVar` gate (the shared registry
 * entry registers the driver without one; integrator-owned declaration).
 *
 * Throws when the profile is unusable (unknown config format, invalid payload,
 * or an invalid owner reference) — the registry skips it with a warning while
 * the persisted settings stay preserved, which is the sanctioned "disabled
 * with an explanation" path until the settings UI (Lane U) surfaces a proper
 * disabled state.
 *
 * Owner references are validated strictly and fail closed: the owner must
 * exist, be an enabled Devin profile whose parsed auth source is
 * `isolated-owner`, and never be the profile itself (no self-references, no
 * reference chains, no cross-driver or native-default owners). Without a
 * factory context an unresolved reference is rejected rather than approved —
 * the registry always supplies one, so a missing context only occurs in
 * direct construction, where guessing would be worse than refusing.
 */
export interface DevinProfileFactoryContext {
  /**
   * Resolve a registered instance by id (enabled or disabled), used to
   * validate `owner-reference` auth sources against the current instance set.
   * The shared registry tracks these reads in the adapter's `inputKey`, so
   * editing or disabling an owner rebuilds (and re-validates) every dependent.
   */
  resolveInstance?: (instanceId: string) => AgentInstanceConfig | undefined;
}

export function createDevinProfileAdapter(
  instance: AgentInstanceConfig,
  factoryContext?: DevinProfileFactoryContext,
) {
  const parsed = parseDevinProfileConfig(instance.config);
  if (!isUsableDevinProfileConfig(parsed)) {
    throw new Error(
      describeDevinProfileConfigUnavailability(parsed) ?? "Unusable Devin profile config.",
    );
  }
  const config = parsed.config;
  const settings = devinExecutionSettingsFromConfig(
    instance.id,
    instance.displayName ?? instance.id,
    config,
    resolveInstanceEnvironment(instance),
  );
  if (settings.auth.kind === "reference") {
    assertValidDevinOwnerReference(instance.id, settings.auth.ownerId, factoryContext);
  }
  return createDevinAdapter({
    kind: `devin:${instance.id}`,
    label: `Devin ${instance.displayName ?? instance.id}`,
    profile: settings,
  });
}

function assertValidDevinOwnerReference(
  instanceId: string,
  ownerId: string,
  factoryContext: DevinProfileFactoryContext | undefined,
): void {
  if (ownerId === instanceId) {
    throw new Error(
      `Devin profile "${instanceId}" cannot reference itself as its account owner. Give it an isolated-owner auth source instead.`,
    );
  }
  // Fail closed: without a resolver an owner reference stays unapproved. The
  // deterministic root derivation still works, but construction must not
  // silently approve a reference nobody validated.
  const owner = factoryContext?.resolveInstance?.(ownerId);
  if (!owner) {
    throw new Error(
      `Devin profile "${instanceId}" references account owner "${ownerId}", which is not a registered profile. Reassign or remove the reference.`,
    );
  }
  if (owner.enabled === false) {
    throw new Error(
      `Devin profile "${instanceId}" references "${ownerId}", which is disabled. Re-enable the owner profile or reassign the reference.`,
    );
  }
  if (owner.driver !== "devin") {
    throw new Error(
      `Devin profile "${instanceId}" references "${ownerId}", which is a ${owner.driver} profile, not a Devin account owner.`,
    );
  }
  const ownerParsed = parseDevinProfileConfig(owner.config);
  if (!isUsableDevinProfileConfig(ownerParsed)) {
    throw new Error(
      `Devin profile "${instanceId}" references "${ownerId}", whose own configuration is unusable: ${
        describeDevinProfileConfigUnavailability(ownerParsed) ?? "invalid config"
      }`,
    );
  }
  if (ownerParsed.config.auth.kind !== "isolated-owner") {
    throw new Error(
      `Devin profile "${instanceId}" references "${ownerId}", which does not own an isolated account (auth source: ${ownerParsed.config.auth.kind}). Only isolated-owner profiles can be referenced; native-default and owner-reference profiles cannot.`,
    );
  }
}

/**
 * Flatten an instance's sealed environment map into a spawn record. Values
 * never include account-root redirection variables created by the context —
 * those are assigned after this map and win.
 */
function resolveInstanceEnvironment(instance: AgentInstanceConfig) {
  if (!instance.environment) return undefined;
  const resolved: Record<string, string> = {};
  for (const [name, variable] of Object.entries(instance.environment)) {
    if (name.trim().length === 0) continue;
    resolved[name] = variable.value;
  }
  return Object.keys(resolved).length > 0 ? resolved : undefined;
}
