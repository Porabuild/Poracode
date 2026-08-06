import { useLingui } from "@lingui/react/macro";
import type { WorktreeStorageMode } from "@/shared/contracts";
import { updateProjectWorktreeLocation } from "@/renderer/actions/projectActions";
import { useProject } from "@/renderer/state/useThread";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { Select } from "@/renderer/components/common";
import {
  DEFAULT_WORKTREE_PATH,
  WorktreeBaseFolderField,
} from "@/renderer/views/SettingsOverlay/parts/WorktreeBaseFolderField";
import {
  projectWorktreeLocationOptions,
  useLocalizedOptions,
} from "@/renderer/views/SettingsOverlay/parts/settingsOptions";

export function ProjectWorktreeLocation(props: { projectId: string }) {
  const { t } = useLingui();
  const project = useProject(props.projectId);
  const globalMode = useSharedSettings((s) => s.worktreeStorageMode);
  const globalNativeBase = useSharedSettings((s) => s.worktreeBasePath);
  const globalWslBase = useSharedSettings((s) => s.wslWorktreeBasePath);
  const options = useLocalizedOptions(projectWorktreeLocationOptions);

  if (!project) return null;

  const override = project.worktreeLocation;
  const isWsl = project.location.kind === "wsl";
  // Effective mode = the project's override, falling back to the global setting.
  const mode: WorktreeStorageMode = override?.mode ?? globalMode;
  // Path shown when the project sets no custom base: the global setting's base
  // (the value this field "resets" to), or the built-in default.
  const inheritedBase = (isWsl ? globalWslBase : globalNativeBase).trim() || DEFAULT_WORKTREE_PATH;

  /**
   * Persist the override, collapsing to "inherit" (no override) whenever the
   * project matches the global mode and sets no custom base.
   */
  function persist(nextMode: WorktreeStorageMode, basePath: string | undefined) {
    if (nextMode === globalMode && !basePath) {
      updateProjectWorktreeLocation(project!.id, undefined);
      return;
    }
    updateProjectWorktreeLocation(project!.id, {
      mode: nextMode,
      ...(basePath ? { basePath } : {}),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{t`Worktree location`}</p>
          <p className="text-xs text-muted">
            {t`Override where this project's worktrees are created. Applies to worktrees created from now on.`}
          </p>
        </div>
        <Select
          aria-label={t`Worktree location`}
          className="w-[200px] shrink-0"
          options={options}
          value={mode}
          // Keep any custom base when staying in "Custom" mode; drop it otherwise.
          onChange={(value) =>
            persist(
              value as WorktreeStorageMode,
              value === "global" ? override?.basePath : undefined,
            )
          }
        />
      </div>

      {mode === "global" ? (
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{t`Base folder`}</p>
            <p className="text-xs text-muted">
              {isWsl
                ? t`Worktree root for this project (a Linux path). Reset to use the global setting.`
                : t`Folder that holds this project's worktrees. Reset to use the global setting.`}
            </p>
          </div>
          <WorktreeBaseFolderField
            isWsl={isWsl}
            value={override?.basePath ?? ""}
            defaultPath={inheritedBase}
            onChange={(value) => persist("global", value.trim() || undefined)}
          />
        </div>
      ) : null}
    </div>
  );
}
