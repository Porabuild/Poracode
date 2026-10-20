import { Trans } from "@lingui/react/macro";
import type { NativeAgentSettingsPanelProps } from "@/renderer/views/SettingsOverlay/parts/agentRegistryNative";
import { readBridge } from "@/renderer/bridge";
import { ModelProvidersSettings } from "../settings/ModelProvidersSettings";

export function DeepSeekProviderSettings({
  agentKind,
  statuses,
  wslDistros,
}: NativeAgentSettingsPanelProps) {
  return (
    <ModelProvidersSettings
      agentKind={agentKind}
      statuses={statuses}
      description={
        <Trans>
          Configure Harness model providers for chat. Changes apply to new or restarted threads.
        </Trans>
      }
      onChanged={() => {
        void readBridge()
          .refreshAgentStatuses(wslDistros, { agentKinds: [agentKind] })
          .catch(() => {});
      }}
    />
  );
}
