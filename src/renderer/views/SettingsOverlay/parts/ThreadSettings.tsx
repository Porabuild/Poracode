import { startTransition } from "react";
import { NumberField } from "@heroui/react";
import type { ThreadRemoveAction } from "@/shared/contracts";
import { isRemoteSession } from "@/renderer/bridge";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { Select } from "@/renderer/components/common";
import { SettingRow, SettingsPage } from "./SettingsForm";
import { threadRemoveActionOptions } from "./settingsOptions";

export function ThreadSettings() {
  const staleThreadUnloadMinutes = useSharedSettings((state) => state.staleThreadUnloadMinutes);
  const setStaleThreadUnloadMinutes = useSharedSettings(
    (state) => state.setStaleThreadUnloadMinutes,
  );
  const autoArchiveDoneAfterDays = useSharedSettings((state) => state.autoArchiveDoneAfterDays);
  const setAutoArchiveDoneAfterDays = useSharedSettings(
    (state) => state.setAutoArchiveDoneAfterDays,
  );
  const threadRemoveAction = useSharedSettings((state) => state.threadRemoveAction);
  const setThreadRemoveAction = useSharedSettings((state) => state.setThreadRemoveAction);
  // Idle unloading and launch-time auto-archive run on the desktop; a remote
  // session's copy of these values is never read, so hide the rows there.
  const remote = isRemoteSession();

  return (
    <SettingsPage title="Threads">
      {!remote && (
        <SettingRow
          title="Unload idle threads after"
          description="Hidden resumable threads are swept every 5 minutes and unloaded after this idle age."
        >
          <NumberField
            aria-label="Unload idle threads after (minutes)"
            className="w-[160px] shrink-0"
            minValue={0}
            step={10}
            value={staleThreadUnloadMinutes}
            onChange={(value) => {
              if (value === undefined || Number.isNaN(value)) return;
              startTransition(() => {
                setStaleThreadUnloadMinutes(Math.max(0, Math.floor(value)));
              });
            }}
          >
            <NumberField.Group>
              <NumberField.DecrementButton />
              <NumberField.Input />
              <NumberField.IncrementButton />
            </NumberField.Group>
          </NumberField>
        </SettingRow>
      )}

      {!remote && (
        <SettingRow
          title="Auto-archive done threads after"
          description="Threads marked done that have not been touched for this many days are archived automatically on app launch. Set to 0 to disable."
        >
          <NumberField
            aria-label="Auto-archive done threads after (days)"
            className="w-[160px] shrink-0"
            minValue={0}
            maxValue={3650}
            step={1}
            value={autoArchiveDoneAfterDays}
            onChange={(value) => {
              if (Number.isNaN(value)) return;
              startTransition(() => {
                setAutoArchiveDoneAfterDays(Math.max(0, Math.floor(value)));
              });
            }}
          >
            <NumberField.Group>
              <NumberField.DecrementButton />
              <NumberField.Input />
              <NumberField.IncrementButton />
            </NumberField.Group>
          </NumberField>
        </SettingRow>
      )}

      <SettingRow
        title="Default thread removal"
        description="Action for the quick-remove button on sidebar threads."
      >
        <Select
          aria-label="Default thread removal"
          className="w-[160px] shrink-0"
          options={threadRemoveActionOptions}
          value={threadRemoveAction}
          onChange={(value) => {
            startTransition(() => {
              setThreadRemoveAction(value as ThreadRemoveAction);
            });
          }}
        />
      </SettingRow>
    </SettingsPage>
  );
}
