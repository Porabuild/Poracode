import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { toast } from "@heroui/react";
import { ToggleSwitch } from "@/renderer/components/common";
import {
  useAgentSettingsHost,
  useHostAgentSettingValues,
  useHostSettingsReady,
} from "@/renderer/components/providers/settings/AgentSettingsHostContext";
import { SettingRow } from "@/renderer/views/SettingsOverlay/parts/SettingsForm";
import { friendlyError } from "@/shared/messages";

export function ClaudeChromeSettings({ agentKind }: { agentKind: string }) {
  const { t } = useLingui();
  const settingsHost = useAgentSettingsHost();
  const stored = useHostAgentSettingValues(agentKind)?.chromeIntegration;
  const ready = useHostSettingsReady();
  const [isSaving, setIsSaving] = useState(false);
  const value = stored !== false;

  async function save(next: boolean) {
    if (next === value || !ready) return;
    setIsSaving(true);
    try {
      await settingsHost.saveAgentSettings(
        agentKind,
        { chromeIntegration: next },
        { requireSuccess: true },
      );
    } catch (error) {
      toast.danger(friendlyError(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <SettingRow
      className="border-t border-border/10 pt-3"
      title={t`Claude in Chrome`}
      description={
        <Trans>
          Use your Claude browser extension in Chrome, Brave, or other supported browsers. Applies
          to new or restarted chats; unavailable in WSL.
        </Trans>
      }
    >
      <ToggleSwitch
        aria-label={t`Claude in Chrome`}
        isSelected={value}
        size="sm"
        isDisabled={isSaving || !ready}
        onChange={(next) => void save(next)}
      />
    </SettingRow>
  );
}
