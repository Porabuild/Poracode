import type { SharedSettings } from "@/shared/settings";
import {
  configureSecretStorageKey,
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
} from "@/shared/secretStorage";

// The sealing primitives are shared with the main process (so a value sealed in
// either process unseals in the other). Re-exported here to keep existing
// supervisor import sites stable.
export { configureSecretStorageKey, decryptSecret, encryptSecret, isEncryptedSecret };

export function transformSensitiveAgentSecrets(
  settings: SharedSettings,
  baseDir: string,
  transform: (baseDir: string, value: string) => string,
): SharedSettings {
  let changed = false;
  const agentInstances = { ...settings.agentInstances };

  for (const [instanceId, instance] of Object.entries(settings.agentInstances)) {
    if (!instance.environment) continue;
    let environmentChanged = false;
    const environment = { ...instance.environment };
    for (const [name, variable] of Object.entries(instance.environment)) {
      if (variable.sensitive !== true) continue;
      environment[name] = { ...variable, value: transform(baseDir, variable.value) };
      environmentChanged = true;
    }
    if (!environmentChanged) continue;
    agentInstances[instanceId] = { ...instance, environment };
    changed = true;
  }

  return changed ? { ...settings, agentInstances } : settings;
}
