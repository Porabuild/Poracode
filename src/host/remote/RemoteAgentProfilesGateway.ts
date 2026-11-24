import { applyCreateProfile, applyProfileEnvironment } from "@/host/sharedSettingsFile";
import {
  AGENT_INSTANCE_REMOVAL_FIELDS,
  removeAgentInstanceSettings,
} from "@/shared/agentInstanceSettings";
import { assertAgentProfileDependencies } from "@/shared/agentProfileDependencies";
import {
  agentProfileDriver,
  isAgentProfileDriver,
  type AgentInstanceConfig,
  type AgentInstanceEnvVar,
} from "@/shared/contracts";
import type {
  RemoteAgentProfilesCommand,
  RemoteAgentProfilesCommandResult,
  RemoteAgentProfilesReadResult,
} from "@/shared/remote/contract/routeSchemas";
import { REDACTED_SECRET_VALUE, isEncryptedSecret, isRedactedSecret } from "@/shared/secretFormat";
import type { SharedSettings } from "@/shared/settings";
import type { SettingsMutationResult } from "@/shared/settingsTransactions";
import { RemoteHttpError } from "./auth";

export interface RemoteAgentProfilesGateway {
  read(): RemoteAgentProfilesReadResult;
  command(command: RemoteAgentProfilesCommand): Promise<RemoteAgentProfilesCommandResult>;
}

export interface RemoteAgentProfilesGatewayDependencies {
  readSettings(): SharedSettings;
  editSettingsFields<F extends keyof SharedSettings>(
    fields: readonly F[],
    compute: (current: SharedSettings) => Pick<SharedSettings, F>,
  ): Promise<SettingsMutationResult>;
}

/** Mask every sensitive environment value on a profile before crossing the remote wire. */
export function redactAgentProfile(instance: AgentInstanceConfig): AgentInstanceConfig {
  if (!instance.environment) return instance;
  const credentialEnvVar = agentProfileDriver(instance.driver)?.credentialEnvVar;
  const environment: Record<string, AgentInstanceEnvVar> = {};
  for (const [key, variable] of Object.entries(instance.environment)) {
    const isSensitive =
      variable.sensitive === true || key === credentialEnvVar || isEncryptedSecret(variable.value);
    environment[key] = isSensitive
      ? { value: REDACTED_SECRET_VALUE, sensitive: true }
      : { value: variable.value };
  }
  return { ...instance, environment };
}

function redactProfilesMap(settings: SharedSettings): Record<string, AgentInstanceConfig> {
  const profiles: Record<string, AgentInstanceConfig> = {};
  for (const [id, instance] of Object.entries(settings.agentInstances)) {
    if (!isAgentProfileDriver(instance.driver)) continue;
    profiles[id] = redactAgentProfile(instance);
  }
  return profiles;
}

function notFound(instanceId: string): RemoteHttpError {
  return new RemoteHttpError("profile_not_found", `Agent profile not found: ${instanceId}`, 404);
}

function requireProfile(settings: SharedSettings, instanceId: string): AgentInstanceConfig {
  const existing = settings.agentInstances[instanceId];
  if (!existing || !isAgentProfileDriver(existing.driver)) throw notFound(instanceId);
  return existing;
}

function assertProfileDependencies(
  previous: SharedSettings["agentInstances"],
  next: SharedSettings["agentInstances"],
  message = "Invalid agent profile dependency.",
): void {
  try {
    assertAgentProfileDependencies(previous, next);
  } catch (error) {
    throw badRequest(
      "profile_dependency_violation",
      error instanceof Error ? error.message : message,
    );
  }
}

function badRequest(code: string, message: string): RemoteHttpError {
  return new RemoteHttpError(code, message, 400);
}

function conflict(code: string, message: string): RemoteHttpError {
  return new RemoteHttpError(code, message, 409);
}

function validateDriverConfig(driver: string, config: unknown): void {
  if (config === undefined) return;
  try {
    agentProfileDriver(driver)?.validateConfig?.(config);
  } catch (error) {
    throw badRequest(
      "profile_invalid_config",
      error instanceof Error ? error.message : "Invalid agent profile configuration.",
    );
  }
}

function assertCommitted(result: SettingsMutationResult): void {
  if (result.status === "committed") return;
  if (result.status === "conflict") {
    throw new RemoteHttpError("settings_conflict", "Settings changed concurrently; retry.", 409);
  }
  throw new RemoteHttpError("settings_overloaded", "Settings writer is busy; retry.", 429);
}

/**
 * Host-owned agent profiles boundary for remote clients.
 *
 * Reads return only profile-driver instances with sensitive env vars masked to
 * `REDACTED_SECRET_VALUE`. Mutations seal new secrets on-host through the
 * settings authority, restore unchanged masked placeholders from disk, and
 * enforce cross-profile dependency guards atomically.
 */
export function createRemoteAgentProfilesGateway(
  dependencies: RemoteAgentProfilesGatewayDependencies,
): RemoteAgentProfilesGateway {
  const read = (): RemoteAgentProfilesReadResult => ({
    profiles: redactProfilesMap(dependencies.readSettings()),
  });

  let pending = Promise.resolve();

  const runCommand = async (
    command: RemoteAgentProfilesCommand,
  ): Promise<RemoteAgentProfilesCommandResult> => {
    switch (command.kind) {
      case "create": {
        const { payload } = command;
        if (!isAgentProfileDriver(payload.driver)) {
          throw badRequest(
            "profile_unsupported_driver",
            `Driver does not support profiles: ${payload.driver}`,
          );
        }
        for (const variable of Object.values(payload.environment ?? {})) {
          if (isEncryptedSecret(variable.value) || isRedactedSecret(variable.value)) {
            throw badRequest(
              "profile_invalid_environment",
              "Supply plaintext environment values when creating a profile.",
            );
          }
        }
        // A create must satisfy the driver's shape; omission is not "no change".
        validateDriverConfig(payload.driver, payload.config ?? {});
        let created: AgentInstanceConfig | undefined;
        const result = await dependencies.editSettingsFields(["agentInstances"], (current) => {
          const currentInstances = current.agentInstances ?? {};
          if (currentInstances[payload.id]) {
            throw conflict("profile_already_exists", `Agent profile already exists: ${payload.id}`);
          }
          let applied: { settings: SharedSettings; instance: AgentInstanceConfig };
          try {
            applied = applyCreateProfile(current, payload, "");
          } catch (error) {
            throw badRequest(
              "profile_invalid_config",
              error instanceof Error ? error.message : "Invalid agent profile configuration.",
            );
          }
          assertProfileDependencies(currentInstances, applied.settings.agentInstances);
          created = applied.instance;
          return { agentInstances: applied.settings.agentInstances };
        });
        assertCommitted(result);
        return {
          ...read(),
          ...(created ? { instance: redactAgentProfile(created) } : {}),
        };
      }

      case "update": {
        const trimmedName = command.displayName?.trim();
        if (command.displayName !== undefined && !trimmedName) {
          throw badRequest("profile_invalid_name", "Agent profiles require a name.");
        }
        let updated: AgentInstanceConfig | undefined;
        const result = await dependencies.editSettingsFields(["agentInstances"], (current) => {
          const existing = requireProfile(current, command.instanceId);
          validateDriverConfig(existing.driver, command.config);
          const nextInstance: AgentInstanceConfig = {
            ...existing,
            ...(trimmedName !== undefined ? { displayName: trimmedName } : {}),
            ...(command.enabled !== undefined ? { enabled: command.enabled } : {}),
            ...(command.config !== undefined ? { config: command.config } : {}),
          };
          const nextInstances = { ...current.agentInstances, [command.instanceId]: nextInstance };
          assertProfileDependencies(current.agentInstances, nextInstances);
          updated = nextInstance;
          return { agentInstances: nextInstances };
        });
        assertCommitted(result);
        return {
          ...read(),
          ...(updated ? { instance: redactAgentProfile(updated) } : {}),
        };
      }

      case "set-environment": {
        let updated: AgentInstanceConfig | undefined;
        const result = await dependencies.editSettingsFields(["agentInstances"], (current) => {
          const existing = requireProfile(current, command.instanceId);
          const resolved: Record<string, AgentInstanceEnvVar> = {};
          for (const [rawKey, variable] of Object.entries(command.environment)) {
            const key = rawKey.trim();
            if (!key) continue;
            if (isEncryptedSecret(variable.value)) {
              throw badRequest(
                "profile_invalid_environment",
                "Supply new environment values, or keep the redacted placeholder for unchanged secrets.",
              );
            }
            if (isRedactedSecret(variable.value)) {
              const stored = existing.environment?.[key];
              if (!stored || !stored.value) {
                throw badRequest(
                  "profile_redaction_without_existing_secret",
                  `Cannot preserve secret "${key}" because no saved value exists.`,
                );
              }
              resolved[key] = { value: stored.value, sensitive: true };
            } else {
              resolved[key] = variable;
            }
          }
          let applied: { settings: SharedSettings; instance: AgentInstanceConfig };
          try {
            applied = applyProfileEnvironment(
              current,
              { instanceId: command.instanceId, environment: resolved },
              "",
            );
          } catch (error) {
            throw badRequest(
              "profile_invalid_environment",
              error instanceof Error ? error.message : "Invalid profile environment.",
            );
          }
          updated = applied.instance;
          return { agentInstances: applied.settings.agentInstances };
        });
        assertCommitted(result);
        return {
          ...read(),
          ...(updated ? { instance: redactAgentProfile(updated) } : {}),
        };
      }

      case "remove": {
        const result = await dependencies.editSettingsFields(
          AGENT_INSTANCE_REMOVAL_FIELDS,
          (current) => {
            const existing = requireProfile(current, command.instanceId);
            const next = removeAgentInstanceSettings(current, existing);
            assertProfileDependencies(
              current.agentInstances,
              next.agentInstances,
              "Cannot remove profile with dependents.",
            );
            return next;
          },
        );
        assertCommitted(result);
        return read();
      }
    }
  };

  return {
    read,
    command(command) {
      const result = pending.then(() => runCommand(command));
      pending = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}
