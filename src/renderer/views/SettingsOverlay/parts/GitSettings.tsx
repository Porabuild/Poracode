import { startTransition } from "react";
import type { GitReviewMode, PrCreateMode } from "@/shared/contracts";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { Select } from "@/renderer/components/common";
import { SettingRow, SettingsPage } from "./SettingsForm";
import { gitReviewModeOptions, prCreateModeOptions } from "./settingsOptions";

export function GitSettings() {
  const gitReviewMode = useSharedSettings((state) => state.gitReviewMode);
  const setGitReviewMode = useSharedSettings((state) => state.setGitReviewMode);
  const prCreateMode = useSharedSettings((state) => state.prCreateMode);
  const setPrCreateMode = useSharedSettings((state) => state.setPrCreateMode);

  return (
    <SettingsPage title="Git">
      <SettingRow
        title="Git review mode"
        description="Open git review as a right-side panel or a full page."
      >
        <Select
          aria-label="Git review mode"
          className="w-[160px] shrink-0"
          options={gitReviewModeOptions}
          value={gitReviewMode}
          onChange={(value) => {
            startTransition(() => {
              setGitReviewMode(value as GitReviewMode);
            });
          }}
        />
      </SettingRow>
      <SettingRow
        title="Create PR action"
        description="Open a dialog to edit the PR title and description first, or auto-generate them and create the PR in one click."
      >
        <Select
          aria-label="Create PR action"
          className="w-[160px] shrink-0"
          options={prCreateModeOptions}
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
