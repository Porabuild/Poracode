import { Trans } from "@lingui/react/macro";
import type { NativeAgentSettingsPanelProps } from "@/renderer/views/SettingsOverlay/parts/agentRegistryNative";
import { useAgentSettingsHost } from "../settings/AgentSettingsHostContext";
import { ModelProvidersSettings } from "../settings/ModelProvidersSettings";
import { DeepSeekAdvancedSettings } from "./DeepSeekAdvancedSettings";

export function DeepSeekProviderSettings({
  agentKind,
  statuses,
  wslDistros,
}: NativeAgentSettingsPanelProps) {
  const settingsHost = useAgentSettingsHost();
  return (
    <>
      <ModelProvidersSettings
        agentKind={agentKind}
        statuses={statuses}
        description={
          <Trans>
            Configure Harness model providers for chat. Changes apply to new or restarted threads.
          </Trans>
        }
        onChanged={() => {
          void settingsHost
            .rediscoverAgents(wslDistros, { agentKinds: [agentKind] })
            .catch(() => {});
        }}
      />
      <DeepSeekAdvancedSettings agentKind={agentKind} />
    </>
  );
}
