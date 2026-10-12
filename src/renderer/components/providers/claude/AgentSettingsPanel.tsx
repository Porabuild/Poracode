import { extractClaudeProfileInstanceId } from "@/shared/contracts";
import type { NativeAgentSettingsPanelProps } from "@/renderer/views/SettingsOverlay/parts/agentRegistryNative";
import {
  ClaudeProfileProviderSettings,
  ClaudeProfileSettings,
} from "../settings/ClaudeProfileSettings";
import { ClaudeContextWindowSettings } from "./ContextWindowSettings";

export function ClaudeAgentSettingsPanel(props: NativeAgentSettingsPanelProps) {
  const instanceId = extractClaudeProfileInstanceId(props.agentKind);
  return (
    <>
      <ClaudeContextWindowSettings agentKind={props.agentKind} wslDistros={props.wslDistros} />
      {instanceId === undefined ? (
        <ClaudeProfileSettings onOpenProfile={props.onOpenProfile} />
      ) : (
        <ClaudeProfileProviderSettings key={props.agentKind} instanceId={instanceId} />
      )}
    </>
  );
}
