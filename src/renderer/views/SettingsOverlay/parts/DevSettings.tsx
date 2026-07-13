import { startTransition } from "react";
import { Switch } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { SettingRow, SettingsPage } from "./SettingsForm";

export function DevSettings() {
  const { t } = useLingui();
  const disableCliHookPlugin = useSharedSettings((state) => state.disableCliHookPlugin);
  const setDisableCliHookPlugin = useSharedSettings((state) => state.setDisableCliHookPlugin);

  return (
    <SettingsPage
      title={t`Dev`}
      description={t`Development-only overrides. Only visible in the PORACODE DEV build.`}
    >
      <SettingRow
        anchorId="dev.disableCliHookPlugin"
        title={t`Disable CLI hook plugin (L1)`}
        description={t`Drops incoming hook envelopes on the supervisor so agents fall back to L2 (OSC 9;4 progress) without touching install or iTerm2 notifications. Takes effect on the next hook event — no restart needed.`}
      >
        <Switch
          isSelected={disableCliHookPlugin}
          onChange={(selected) => {
            startTransition(() => {
              setDisableCliHookPlugin(selected);
            });
          }}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch>
      </SettingRow>
    </SettingsPage>
  );
}
