import type { SharedSettings } from "@/shared/settings";
import { sensitiveAgentSettingKeys } from "@/shared/agentSecrets";
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
  onTransformError?: (input: { instanceId: string; variableName: string; error: unknown }) => void,
): SharedSettings {
  let changed = false;
  const agentSettings = { ...settings.agentSettings };
  const agentInstances = { ...settings.agentInstances };

  for (const [agentKind, values] of Object.entries(settings.agentSettings)) {
    const sensitiveKeys = sensitiveAgentSettingKeys(agentKind);
    if (sensitiveKeys.length === 0) continue;
    const nextValues = { ...values };
    let settingsChanged = false;
    for (const key of sensitiveKeys) {
      const value = values[key];
      if (typeof value !== "string") continue;
      try {
        nextValues[key] = transform(baseDir, value);
      } catch (error) {
        if (!onTransformError) throw error;
        delete nextValues[key];
        onTransformError({ instanceId: agentKind, variableName: key, error });
      }
      settingsChanged = true;
    }
    if (!settingsChanged) continue;
    agentSettings[agentKind] = nextValues;
    changed = true;
  }

  for (const [instanceId, instance] of Object.entries(settings.agentInstances)) {
    if (!instance.environment) continue;
    let environmentChanged = false;
    const environment = { ...instance.environment };
    for (const [name, variable] of Object.entries(instance.environment)) {
      if (variable.sensitive !== true) continue;
      try {
        environment[name] = { ...variable, value: transform(baseDir, variable.value) };
      } catch (error) {
        if (!onTransformError) throw error;
        delete environment[name];
        onTransformError({ instanceId, variableName: name, error });
      }
      environmentChanged = true;
    }
    if (!environmentChanged) continue;
    agentInstances[instanceId] = { ...instance, environment };
    changed = true;
  }

  return changed ? { ...settings, agentSettings, agentInstances } : settings;
}
