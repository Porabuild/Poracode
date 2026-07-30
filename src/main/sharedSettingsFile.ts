import { existsSync, readFileSync } from "node:fs";
import { writeFileAtomic } from "@/shared/atomicFile";
import type {
  AgentInstanceConfig,
  AgentInstanceEnvVar,
  SetClaudeProfileEnvironmentPayload,
} from "@/shared/contracts";
import { isSensitiveAgentSetting, sensitiveAgentSettingKeys } from "@/shared/agentSecrets";
import { encryptSecret } from "@/shared/secretStorage";
import {
  defaultSharedSettings,
  normalizeSharedSettings,
  type SharedSettings,
  type SharedSettingsInput,
} from "@/shared/settings";

function serializeSharedSettings(settings: SharedSettings): string {
  return `${JSON.stringify(settings, null, 2)}\n`;
}

export function readSharedSettingsFile(settingsPath: string): SharedSettings {
  if (!existsSync(settingsPath)) {
    return { ...defaultSharedSettings };
  }

  try {
    return normalizeSharedSettings(JSON.parse(readFileSync(settingsPath, "utf8")));
  } catch (error) {
    console.warn("[settings] failed to read shared settings, using defaults:", error);
    return { ...defaultSharedSettings };
  }
}

export function writeSharedSettingsFile(settingsPath: string, settings: SharedSettings): void {
  writeFileAtomic(settingsPath, serializeSharedSettings(settings), { encoding: "utf8" });
}

/** Merges a partial update into the settings on disk and returns the result.
 * Used by write paths that don't hold the full settings object (the remote
 * settings API); `undefined` patch values are ignored rather than written. */
export function patchSharedSettingsFile(
  settingsPath: string,
  patch: { [K in keyof SharedSettings]?: SharedSettings[K] | undefined },
): SharedSettings {
  const onDisk = readSharedSettingsFile(settingsPath);
  const incoming = { ...onDisk };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) (incoming as Record<string, unknown>)[key] = value;
  }
  const next = mergeManagedSharedSettings(onDisk, incoming);
  writeSharedSettingsFile(settingsPath, next);
  return next;
}

/**
 * Re-merge supervisor-managed fields and encrypted Claude-profile environments
 * from the on-disk settings into an `incoming` (renderer- or tool-originated)
 * settings object, so a plaintext-capable write can never clobber a secret or a
 * field the supervisor owns. Preserves:
 *   - `acpRegistryInstalledAgents` and `agentHookSupport` (supervisor-managed),
 *   - `acp-generic` agent instances (supervisor-managed), and
 *   - each Claude profile's `environment` (owned by the encrypting
 *     `setClaudeProfileEnvironment` path).
 * Extracted verbatim from the IPC `setSharedSettings` path so every write —
 * including the app-controls MCP `update_settings` tool — applies one guard.
 * `incoming` is assumed already normalized.
 */
export function mergeManagedSharedSettings(
  onDisk: SharedSettings,
  incoming: SharedSettingsInput,
): SharedSettings {
  const agentSettings = { ...incoming.agentSettings };
  for (const agentKind of new Set([
    ...Object.keys(onDisk.agentSettings),
    ...Object.keys(incoming.agentSettings),
  ])) {
    const sensitiveKeys = sensitiveAgentSettingKeys(agentKind);
    if (sensitiveKeys.length === 0) continue;
    const values = { ...agentSettings[agentKind] };
    for (const key of sensitiveKeys) {
      const stored = onDisk.agentSettings[agentKind]?.[key];
      if (stored === undefined) delete values[key];
      else values[key] = stored;
    }
    agentSettings[agentKind] = values;
  }

  const rendererManagedInstances = Object.fromEntries(
    Object.entries(incoming.agentInstances)
      .filter(([, instance]) => instance.driver !== "acp-generic")
      .map(([id, instance]): [string, AgentInstanceConfig] => {
        // A Claude profile's `environment` is owned by the encrypting
        // `setClaudeProfileEnvironment` path; pin it to disk so a plaintext-
        // capable write can never leak or clear a saved secret.
        if (instance.driver !== "claude") return [id, instance];
        const onDiskEnv = onDisk.agentInstances[id]?.environment;
        const next: AgentInstanceConfig = { ...instance };
        if (onDiskEnv) next.environment = onDiskEnv;
        else delete next.environment;
        return [id, next];
      }),
  );
  const supervisorManagedInstances = Object.fromEntries(
    Object.entries(onDisk.agentInstances).filter(
      ([, instance]) => instance.driver === "acp-generic",
    ),
  );
  return {
    ...incoming,
    agentSettings,
    acpRegistryInstalledAgents: onDisk.acpRegistryInstalledAgents,
    agentInstances: {
      ...rendererManagedInstances,
      ...supervisorManagedInstances,
    },
    agentHookSupport: onDisk.agentHookSupport,
    crossagentSelectionUsage: onDisk.crossagentSelectionUsage,
    crossagentRoutingOverrides: onDisk.crossagentRoutingOverrides,
  };
}

export function applyAgentSecretSetting(
  settings: SharedSettings,
  payload: { agentKind: string; key: string; value: string },
  baseDir: string,
): { settings: SharedSettings; storedValue: string | null } {
  if (!isSensitiveAgentSetting(payload.agentKind, payload.key)) {
    throw new Error(`Unsupported sensitive agent setting: ${payload.agentKind}.${payload.key}`);
  }

  const current = settings.agentSettings[payload.agentKind] ?? {};
  const nextValues = { ...current };
  const value = payload.value.trim();
  let storedValue: string | null = null;
  if (value) {
    storedValue = encryptSecret(baseDir, value);
    nextValues[payload.key] = storedValue;
  } else {
    delete nextValues[payload.key];
  }

  return {
    settings: {
      ...settings,
      agentSettings: {
        ...settings.agentSettings,
        [payload.agentKind]: nextValues,
      },
    },
    storedValue,
  };
}

/**
 * Apply a Claude profile's environment edit, sealing any `sensitive` value that
 * is not already sealed. `baseDir` is the settings directory (passed through to
 * the cipher). Empty values are dropped (delete semantics); an empty result
 * removes the `environment` field entirely. Throws if the instance is missing
 * or is not a Claude profile. Returns the next settings plus the updated
 * instance (with sealed env) for the renderer store to adopt without re-reading.
 */
export function applyClaudeProfileEnvironment(
  settings: SharedSettings,
  payload: SetClaudeProfileEnvironmentPayload,
  baseDir: string,
): { settings: SharedSettings; instance: AgentInstanceConfig } {
  const instance = settings.agentInstances[payload.instanceId];
  if (!instance || instance.driver !== "claude") {
    throw new Error(`Claude profile not found: ${payload.instanceId}`);
  }

  const nextEnv: Record<string, AgentInstanceEnvVar> = {};
  for (const [name, variable] of Object.entries(payload.environment)) {
    const key = name.trim();
    if (key.length === 0 || variable.value.length === 0) continue;
    nextEnv[key] = variable.sensitive
      ? { value: encryptSecret(baseDir, variable.value), sensitive: true }
      : { value: variable.value };
  }

  const nextInstance: AgentInstanceConfig = { ...instance };
  if (Object.keys(nextEnv).length > 0) {
    nextInstance.environment = nextEnv;
  } else {
    delete nextInstance.environment;
  }

  return {
    settings: {
      ...settings,
      agentInstances: { ...settings.agentInstances, [payload.instanceId]: nextInstance },
    },
    instance: nextInstance,
  };
}
