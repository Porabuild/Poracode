import { sensitiveAgentSettingKeys } from "@/shared/agentSecrets";
import { agentProfileDriver } from "@/shared/contracts/agentProfiles";
import { isEncryptedSecret } from "@/shared/secretFormat";
import type { SharedSettings } from "@/shared/settings";

/** Unchanged ciphertext and deletions remain possible without a persistent key. */
export function assertSettingsCredentialPersistence(
  previous: SharedSettings,
  next: SharedSettings,
  assertPersistentCredentials?: () => void,
): void {
  function check(before: unknown, after: unknown, previouslySecret = true): void {
    if (after === undefined || after === "" || (previouslySecret && after === before)) return;
    if (!assertPersistentCredentials)
      throw new Error("Persistent credential storage is unavailable.");
    assertPersistentCredentials();
    if (typeof after !== "string" || !isEncryptedSecret(after))
      throw new Error("Sensitive settings must be sealed before persistence.");
  }
  for (const [kind, values] of Object.entries(next.agentSettings))
    for (const key of sensitiveAgentSettingKeys(kind))
      check(previous.agentSettings[kind]?.[key], values[key]);
  for (const [machine, entry] of Object.entries(next.machineSettings))
    for (const [kind, values] of Object.entries(entry.agentSettings ?? {}))
      for (const key of sensitiveAgentSettingKeys(kind)) {
        const value = values[key];
        if (value && value !== previous.machineSettings[machine]?.agentSettings?.[kind]?.[key])
          throw new Error("Sensitive settings cannot be stored as machine overrides.");
      }
  for (const [id, instance] of Object.entries(next.agentInstances)) {
    const credential = agentProfileDriver(instance.driver)?.credentialEnvVar;
    const previousInstance = previous.agentInstances[id];
    const previousCredential =
      previousInstance && agentProfileDriver(previousInstance.driver)?.credentialEnvVar;
    for (const [name, variable] of Object.entries(instance.environment ?? {}))
      if (variable.sensitive || name === credential || isEncryptedSecret(variable.value)) {
        const oldVariable = previousInstance?.environment?.[name];
        check(
          oldVariable?.value,
          variable.value,
          oldVariable !== undefined &&
            (oldVariable.sensitive === true ||
              name === previousCredential ||
              isEncryptedSecret(oldVariable.value)),
        );
      }
  }
}
