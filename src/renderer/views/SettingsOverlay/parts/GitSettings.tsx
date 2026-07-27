import { startTransition } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { GitReviewMode, PrCreateMode, PrMergeMethod } from "@/shared/contracts";
import { isRemoteSession } from "@/renderer/bridge";
import { PrAutomationSlider } from "@/renderer/components/git/PrAutomationSlider";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { Select } from "@/renderer/components/common";
import { SettingRow, SettingsPage } from "./SettingsForm";
import {
  gitReviewModeOptions,
  prCreateModeOptions,
  prMergeMethodOptions,
  useLocalizedOptions,
} from "./settingsOptions";

export function GitSettings() {
  const { t } = useLingui();
  const gitReviewMode = useSharedSettings((state) => state.gitReviewMode);
  const setGitReviewMode = useSharedSettings((state) => state.setGitReviewMode);
  const prCreateMode = useSharedSettings((state) => state.prCreateMode);
  const setPrCreateMode = useSharedSettings((state) => state.setPrCreateMode);
  const prAutomationDefault = useSharedSettings((state) => state.prAutomationDefault);
  const setPrAutomationDefault = useSharedSettings((state) => state.setPrAutomationDefault);
  const prMergeMethod = useSharedSettings((state) => state.prMergeMethod);
  const setPrMergeMethod = useSharedSettings((state) => state.setPrMergeMethod);

  const gitReviewOptions = useLocalizedOptions(gitReviewModeOptions);
  const prCreateOptions = useLocalizedOptions(prCreateModeOptions);
  const mergeMethodOptions = useLocalizedOptions(prMergeMethodOptions);
  const remote = isRemoteSession();

  return (
    <SettingsPage title={t`Git`}>
      {!remote && (
        <SettingRow
          anchorId="git.gitReviewMode"
          title={t`Git review mode`}
          description={<Trans>Open git review as a right-side panel or a full page.</Trans>}
        >
          <Select
            aria-label={t`Git review mode`}
            className="w-[160px] shrink-0"
            options={gitReviewOptions}
            value={gitReviewMode}
            onChange={(value) => {
              startTransition(() => {
                setGitReviewMode(value as GitReviewMode);
              });
            }}
          />
        </SettingRow>
      )}
      <SettingRow
        anchorId="git.defaultCreatePrAction"
        title={t`Default Create PR action`}
        description={
          <Trans>
            What the Create PR button does by default: open a dialog to edit the title and
            description first, or auto-generate them and create the PR in one click. You can also
            switch this from the button's menu.
          </Trans>
        }
      >
        <Select
          aria-label={t`Create PR action`}
          className="w-[160px] shrink-0"
          options={prCreateOptions}
          value={prCreateMode}
          onChange={(value) => {
            startTransition(() => {
              setPrCreateMode(value as PrCreateMode);
            });
          }}
        />
      </SettingRow>
      <SettingRow
        anchorId="git.defaultPrAutomation"
        title={t`Default PR automation`}
        description={
          <Trans>
            Choose what Poracode does for new pull requests: nothing, fix merge blockers, or fix and
            merge.
          </Trans>
        }
      >
        <PrAutomationSlider
          ariaLabel={t`Default PR automation`}
          className="w-[200px] shrink-0 px-2"
          value={prAutomationDefault}
          onChange={(next) => {
            startTransition(() => {
              setPrAutomationDefault(next);
            });
          }}
        />
      </SettingRow>
      <SettingRow
        anchorId="git.mergeMethod"
        title={t`Merge method`}
        description={
          <Trans>Choose how Poracode performs manual merges and automatic PR merges.</Trans>
        }
      >
        <Select
          aria-label={t`Merge method`}
          className="w-[160px] shrink-0"
          options={mergeMethodOptions}
          value={prMergeMethod}
          onChange={(value) => {
            startTransition(() => {
              setPrMergeMethod(value as PrMergeMethod);
            });
          }}
        />
      </SettingRow>
    </SettingsPage>
  );
}
