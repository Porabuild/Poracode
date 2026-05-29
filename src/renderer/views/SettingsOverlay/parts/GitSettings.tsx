import { startTransition } from "react";
import type { GitReviewMode } from "@/shared/contracts";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { Select } from "@/renderer/components/common";
import { SettingRow, SettingsPage } from "./SettingsForm";
import { gitReviewModeOptions } from "./settingsOptions";

export function GitSettings() {
  const gitReviewMode = useSharedSettings((state) => state.gitReviewMode);
  const setGitReviewMode = useSharedSettings((state) => state.setGitReviewMode);

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
    </SettingsPage>
  );
}
