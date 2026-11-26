import {
  extractClaudeProfileInstanceId,
  parseClaudeProfileInstanceConfig,
} from "@/shared/contracts";
import type { NativeAgentSettingsPanelProps } from "@/renderer/views/SettingsOverlay/parts/agentRegistryNative";
import { useHostAgentInstance } from "@/renderer/components/providers/settings/AgentSettingsHostContext";
import {
  ClaudeProfileProviderSettings,
  ClaudeProfileSettings,
} from "../settings/ClaudeProfileSettings";
import { ClaudeContextWindowSettings } from "./ContextWindowSettings";
import { ClaudeChromeSettings } from "./ChromeSettings";

export function ClaudeAgentSettingsPanel(props: NativeAgentSettingsPanelProps) {
  const instanceId = extractClaudeProfileInstanceId(props.agentKind);
  const instance = useHostAgentInstance(instanceId);
  const localProfile =
    instance?.driver === "claude" &&
    (() => {
      try {
        return parseClaudeProfileInstanceConfig(instance.config).local !== undefined;
      } catch {
        return false;
      }
    })();
  return (
    <>
      <ClaudeChromeSettings agentKind={props.agentKind} />
      {localProfile ? null : (
        <ClaudeContextWindowSettings agentKind={props.agentKind} wslDistros={props.wslDistros} />
      )}
      {instanceId === undefined ? (
        <ClaudeProfileSettings
          statuses={props.statuses}
          suggestionStatuses={props.hostStatuses}
          workspaceIsClientDevice={props.workspaceIsClientDevice}
          onOpenProfile={props.onOpenProfile}
        />
      ) : (
        <ClaudeProfileProviderSettings key={props.agentKind} instanceId={instanceId} />
      )}
    </>
  );
}
