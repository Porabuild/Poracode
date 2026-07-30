const SENSITIVE_AGENT_SETTING_KEYS: Readonly<Record<string, ReadonlySet<string>>> = {
  cursor: new Set(["sdkApiKey"]),
};

export function isSensitiveAgentSetting(agentKind: string, key: string): boolean {
  return SENSITIVE_AGENT_SETTING_KEYS[agentKind]?.has(key) === true;
}

export function sensitiveAgentSettingKeys(agentKind: string): readonly string[] {
  return [...(SENSITIVE_AGENT_SETTING_KEYS[agentKind] ?? [])];
}
