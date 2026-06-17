import { startTransition } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { GitReviewMode, PrCreateMode } from "@/shared/contracts";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { Select } from "@/renderer/components/common";
import { SettingRow, SettingsPage } from "./SettingsForm";
import { gitReviewModeOptions, prCreateModeOptions, useLocalizedOptions } from "./settingsOptions";

export function GitSettings() {
  const { t } = useLingui();
  const gitReviewMode = useSharedSettings((state) => state.gitReviewMode);
  const setGitReviewMode = useSharedSettings((state) => state.setGitReviewMode);
  const prCreateMode = useSharedSettings((state) => state.prCreateMode);
  const setPrCreateMode = useSharedSettings((state) => state.setPrCreateMode);

  const gitReviewOptions = useLocalizedOptions(gitReviewModeOptions);
  const prCreateOptions = useLocalizedOptions(prCreateModeOptions);

  return (
    <SettingsPage title={t`Git`}>
      <SettingRow
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
      <SettingRow
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
    </SettingsPage>
  );
}
