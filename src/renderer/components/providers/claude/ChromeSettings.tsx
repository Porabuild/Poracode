import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { toast } from "@heroui/react";
import { ToggleSwitch } from "@/renderer/components/common";
import { flushSharedSettings, useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { SettingRow } from "@/renderer/views/SettingsOverlay/parts/SettingsForm";
import { friendlyError } from "@/shared/messages";

export function ClaudeChromeSettings({ agentKind }: { agentKind: string }) {
  const { t } = useLingui();
  const stored = useSharedSettings((state) => state.agentSettings[agentKind]?.chromeIntegration);
  const setAgentSetting = useSharedSettings((state) => state.setAgentSetting);
  const [isSaving, setIsSaving] = useState(false);
  const value = stored !== false;

  async function save(next: boolean) {
    if (next === value) return;
    setIsSaving(true);
    setAgentSetting(agentKind, "chromeIntegration", next);
    try {
      await flushSharedSettings({ requireSuccess: true });
    } catch (error) {
      setAgentSetting(agentKind, "chromeIntegration", value);
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
        isDisabled={isSaving}
        onChange={(next) => void save(next)}
      />
    </SettingRow>
  );
}
