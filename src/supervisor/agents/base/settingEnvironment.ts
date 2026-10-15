import type { AgentSettingDef } from "@/shared/contracts";

/** Resolve declared settings against the caller's platform scope (host or execution target). */
export function agentSettingsEnvironment(
  definitions: readonly AgentSettingDef[],
  values: Record<string, boolean | string> | undefined,
  platform: NodeJS.Platform,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const definition of definitions) {
    if (definition.platforms && !definition.platforms.includes(platform)) continue;
    const value = values?.[definition.key] ?? definition.default;
    if (definition.type === "toggle") {
      if (value) Object.assign(env, definition.env);
    } else {
      env[definition.envVar] = String(value);
    }
  }
  return env;
}
