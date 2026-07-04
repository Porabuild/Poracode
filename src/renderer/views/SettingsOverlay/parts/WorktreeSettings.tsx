import { startTransition } from "react";
import { useLingui } from "@lingui/react/macro";
import type { WorktreeStorageMode } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { buildWslProjectDistrosKey } from "@/renderer/state/projectKeys";
import { Select } from "@/renderer/components/common";
import { SettingRow, SettingsPage } from "./SettingsForm";
import { useLocalizedOptions, worktreeStorageModeOptions } from "./settingsOptions";
import { WorktreeBaseFolderField } from "./WorktreeBaseFolderField";

export function WorktreeSettings() {
  const { t } = useLingui();
  const storageMode = useSharedSettings((s) => s.worktreeStorageMode);
  const setStorageMode = useSharedSettings((s) => s.setWorktreeStorageMode);
  const basePath = useSharedSettings((s) => s.worktreeBasePath);
  const setBasePath = useSharedSettings((s) => s.setWorktreeBasePath);
  const wslBasePath = useSharedSettings((s) => s.wslWorktreeBasePath);
  const setWslBasePath = useSharedSettings((s) => s.setWslWorktreeBasePath);
  const hasWslProject = useAppStore((s) => Boolean(buildWslProjectDistrosKey(s.projects)));

  const isGlobal = storageMode === "global";
  const modeOptions = useLocalizedOptions(worktreeStorageModeOptions);

  return (
    <SettingsPage
      title={t`Worktrees`}
      description={t`Where Poracode creates git worktrees for new branches. Changes apply to worktrees created from now on; existing worktrees stay where they are.`}
    >
      <SettingRow
        anchorId="worktrees.storageLocation"
        title={t`Storage location`}
        description={t`Use one global folder, or nest worktrees inside each project at .poracode/worktrees.`}
      >
        <Select
          aria-label={t`Worktree storage location`}
          className="w-[200px] shrink-0"
          options={modeOptions}
          value={storageMode}
          onChange={(value) => startTransition(() => setStorageMode(value as WorktreeStorageMode))}
        />
      </SettingRow>

      {isGlobal ? (
        <SettingRow
          anchorId="worktrees.baseFolder"
          title={t`Base folder`}
          description={t`Folder that holds all worktrees. Tip: a Dev Drive here speeds up builds.`}
        >
          <WorktreeBaseFolderField isWsl={false} value={basePath} onChange={setBasePath} />
        </SettingRow>
      ) : null}

      {isGlobal && hasWslProject ? (
        <SettingRow
          anchorId="worktrees.wslBaseFolder"
          title={t`WSL base folder`}
          description={t`Worktree root for WSL projects (a Linux path).`}
        >
          <WorktreeBaseFolderField isWsl value={wslBasePath} onChange={setWslBasePath} />
        </SettingRow>
      ) : null}
    </SettingsPage>
  );
}
