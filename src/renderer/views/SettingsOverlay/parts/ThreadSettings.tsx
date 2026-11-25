import { startTransition, useState } from "react";
import { NumberField } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ThreadRemoveAction } from "@/shared/contracts";
import type { FollowUpBehavior } from "@/shared/settings";
import { isMac, isRemoteSession } from "@/renderer/bridge";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  setConfirmThreadDelete,
  shouldConfirmThreadDelete,
} from "@/renderer/state/threadDeletePreference";
import { Select, ToggleSwitch } from "@/renderer/components/common";
import { SettingRow, SettingsPage } from "./SettingsForm";
import { useScopedHostSettings, type SettingsHostTarget } from "./useScopedHostSettings";
import { ResourceAdmissionSettings } from "./ResourceAdmissionSettings";
import {
  followUpBehaviorOptions,
  threadRemoveActionOptions,
  useLocalizedOptions,
} from "./settingsOptions";

export function ThreadSettings(props: SettingsHostTarget) {
  const { t } = useLingui();
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
  const autoMarkDoneOnPrMerge = useSharedSettings((state) => state.autoMarkDoneOnPrMerge);
  const setAutoMarkDoneOnPrMerge = useSharedSettings((state) => state.setAutoMarkDoneOnPrMerge);
  const followUpBehavior = useSharedSettings((state) => state.followUpBehavior);
  const setFollowUpBehavior = useSharedSettings((state) => state.setFollowUpBehavior);
  const [confirmThreadDelete, setConfirmThreadDeleteState] = useState(shouldConfirmThreadDelete);
  const host = useScopedHostSettings(props);
  // Idle unloading is a local renderer lifecycle policy. Archiving is host housekeeping.
  const remote = isRemoteSession() || host.remote;
  const archiveDays = host.remote
    ? host.settings?.autoArchiveDoneAfterDays
    : remote
      ? undefined
      : autoArchiveDoneAfterDays;
  const followUp = host.remote ? host.settings?.followUpBehavior : followUpBehavior;

  const followUpBehaviorOpts = useLocalizedOptions(followUpBehaviorOptions);
  const threadRemoveActionOpts = useLocalizedOptions(threadRemoveActionOptions);
  const followUpShortcut = isMac() ? t`Cmd+Enter` : t`Ctrl+Enter`;

  return (
    <SettingsPage title={t`Threads`}>
      {followUp !== undefined ? (
        <SettingRow
          anchorId="threads.followUpBehavior"
          title={t`Follow-up behavior`}
          description={
            <Trans>
              Choose whether chat messages sent while an agent is working steer the current response
              or queue for the next response. {followUpShortcut} uses the opposite action.
            </Trans>
          }
        >
          <Select
            aria-label={t`Follow-up behavior`}
            className="w-[160px] shrink-0"
            options={followUpBehaviorOpts}
            value={followUp}
            onChange={(value) => {
              startTransition(() => {
                if (host.remote) host.update({ followUpBehavior: value as FollowUpBehavior });
                else setFollowUpBehavior(value as FollowUpBehavior);
              });
            }}
          />
        </SettingRow>
      ) : (
        <p role="status">
          <Trans>Settings unavailable</Trans>
        </p>
      )}

      {!remote && (
        <SettingRow
          anchorId="threads.unloadIdleThreadsAfter"
          title={t`Unload idle threads after`}
          description={
            <Trans>
              Hidden resumable threads are swept every 5 minutes and unloaded after this idle age.
            </Trans>
          }
        >
          <NumberField
            aria-label={t`Unload idle threads after (minutes)`}
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

      {archiveDays !== undefined && (
        <SettingRow
          anchorId="threads.autoArchiveDoneAfter"
          title={t`Auto-archive done threads after`}
          description={
            <Trans>
              Threads marked done that have not been touched for this many days are archived
              automatically on app launch. Set to 0 to disable.
            </Trans>
          }
        >
          <NumberField
            aria-label={t`Auto-archive done threads after (days)`}
            className="w-[160px] shrink-0"
            minValue={0}
            maxValue={3650}
            step={1}
            value={archiveDays}
            onChange={(value) => {
              if (Number.isNaN(value)) return;
              startTransition(() => {
                const next = Math.max(0, Math.floor(value));
                if (host.remote) host.update({ autoArchiveDoneAfterDays: next });
                else setAutoArchiveDoneAfterDays(next);
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
          anchorId="threads.markDoneOnPrMerge"
          title={t`Mark done when the pull request merges`}
          description={
            <Trans>
              Worktree threads are marked done as soon as Poracode sees their pull request merge.
              Threads mid-turn wait until the turn finishes.
            </Trans>
          }
        >
          <ToggleSwitch
            aria-label={t`Mark done when the pull request merges`}
            isSelected={autoMarkDoneOnPrMerge}
            onChange={(selected) => {
              startTransition(() => {
                setAutoMarkDoneOnPrMerge(selected);
              });
            }}
          />
        </SettingRow>
      )}

      {!remote && (
        <SettingRow
          anchorId="threads.defaultThreadRemoval"
          title={t`Default thread removal`}
          description={<Trans>Action for the quick-remove button on sidebar threads.</Trans>}
        >
          <Select
            aria-label={t`Default thread removal`}
            className="w-[160px] shrink-0"
            options={threadRemoveActionOpts}
            value={threadRemoveAction}
            onChange={(value) => {
              startTransition(() => {
                setThreadRemoveAction(value as ThreadRemoveAction);
              });
            }}
          />
        </SettingRow>
      )}

      {!remote && (
        <SettingRow
          anchorId="threads.confirmThreadDelete"
          title={t`Confirm before deleting threads`}
          description={<Trans>Show a confirmation before permanently deleting a thread.</Trans>}
        >
          <ToggleSwitch
            aria-label={t`Confirm before deleting threads`}
            isSelected={confirmThreadDelete}
            onChange={(selected) => {
              setConfirmThreadDelete(selected);
              setConfirmThreadDeleteState(shouldConfirmThreadDelete());
            }}
          />
        </SettingRow>
      )}

      {/* Host execution-slot bounds are absent from the remote settings wire, so an
          ordinary remote session cannot edit the paired host's policy; hide them
          there instead of pretending a local edit reaches the host. */}
      {!remote && <ResourceAdmissionSettings />}
    </SettingsPage>
  );
}
