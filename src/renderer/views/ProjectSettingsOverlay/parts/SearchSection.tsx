import { Trans, useLingui } from "@lingui/react/macro";
import { updateProjectSearchSettingsEverywhere } from "@/renderer/actions/projectGroupActions";
import { useProject } from "@/renderer/state/useThread";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { DEFAULT_SEARCH_EXCLUDE } from "@/shared/searchExclude";
import { SearchExcludeBody } from "@/renderer/views/SettingsOverlay/parts/SearchExcludeBody";
import {
  PROJECT_SETTINGS_SCROLL_CLASS,
  ProjectScopeHeading,
  SharedValueDiff,
} from "./ProjectEnvironmentScope";

export function SearchSection(props: { projectId: string }) {
  const { t } = useLingui();
  const project = useProject(props.projectId);
  const globalUseIgnoreFiles = useSharedSettings((s) => s.searchUseIgnoreFiles);
  const globalExclude = useSharedSettings((s) => s.searchExclude);

  if (!project) return null;

  const settings = project.searchSettings ?? {};
  const projectExclude = settings.exclude ?? {};
  const overridesIgnoreFiles = settings.useIgnoreFiles !== undefined;
  const effectiveUseIgnoreFiles = settings.useIgnoreFiles ?? globalUseIgnoreFiles;

  const baseline: Record<string, boolean> = { ...DEFAULT_SEARCH_EXCLUDE, ...globalExclude };

  function update(next: typeof settings) {
    const empty =
      next.useIgnoreFiles === undefined &&
      (!next.exclude || Object.keys(next.exclude).length === 0);
    updateProjectSearchSettingsEverywhere(project!.id, empty ? undefined : next);
  }

  return (
    <div className={PROJECT_SETTINGS_SCROLL_CLASS}>
      <div className="mx-auto max-w-[720px]">
        <h1 className="mb-2 text-lg font-semibold text-foreground">
          <Trans>Search</Trans>
        </h1>
        <p className="mb-6 text-xs text-muted">
          <Trans>Project-specific overrides on top of the global search settings.</Trans>
        </p>
        <ProjectScopeHeading projectId={project.id} scope="shared" />
        <SharedValueDiff
          projectId={project.id}
          setting={t`Search`}
          read={(row) => row.searchSettings ?? null}
          onApplyEverywhere={() =>
            updateProjectSearchSettingsEverywhere(project.id, project.searchSettings)
          }
        />

        <SearchExcludeBody
          useIgnoreFiles={effectiveUseIgnoreFiles}
          useIgnoreFilesNote={
            overridesIgnoreFiles ? (
              <Trans>Overriding the global setting for this project.</Trans>
            ) : (
              <Trans>
                Inheriting the global setting (currently {globalUseIgnoreFiles ? t`on` : t`off`}).
              </Trans>
            )
          }
          onUseIgnoreFilesChange={(value) => update({ ...settings, useIgnoreFiles: value })}
          useIgnoreFilesResetAction={
            overridesIgnoreFiles ? (
              <button
                type="button"
                className="text-xs text-muted underline-offset-2 hover:underline"
                onClick={() => update({ ...settings, useIgnoreFiles: undefined })}
              >
                <Trans>reset</Trans>
              </button>
            ) : undefined
          }
          baseline={baseline}
          value={projectExclude}
          onValueChange={(next) => update({ ...settings, exclude: next })}
        />
      </div>
    </div>
  );
}
