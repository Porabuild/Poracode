import { Trans, useLingui } from "@lingui/react/macro";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { DEFAULT_SEARCH_EXCLUDE } from "@/shared/searchExclude";
import { SearchExcludeBody } from "./SearchExcludeBody";
import { SettingsPage } from "./SettingsForm";
import { useScopedHostSettings, type SettingsHostTarget } from "./useScopedHostSettings";

export function SearchSettings(props: SettingsHostTarget) {
  const { t } = useLingui();
  const useIgnoreFiles = useSharedSettings((s) => s.searchUseIgnoreFiles);
  const setUseIgnoreFiles = useSharedSettings((s) => s.setSearchUseIgnoreFiles);
  const exclude = useSharedSettings((s) => s.searchExclude);
  const setExclude = useSharedSettings((s) => s.setSearchExclude);
  const host = useScopedHostSettings(props);
  const scopedIgnore = host.remote ? host.settings?.searchUseIgnoreFiles : useIgnoreFiles;
  const scopedExclude = host.remote ? host.settings?.searchExclude : exclude;

  return (
    <SettingsPage
      title={t`Search`}
      description={
        <Trans>
          Control which files appear in the @file mention search. Per-project overrides live in each
          project's settings.
        </Trans>
      }
    >
      {scopedIgnore !== undefined && scopedExclude !== undefined ? (
        <SearchExcludeBody
          useIgnoreFilesAnchorId="search.useIgnoreFiles"
          excludePatternsAnchorId="search.excludePatterns"
          useIgnoreFiles={scopedIgnore}
          useIgnoreFilesNote={
            <Trans>
              When enabled, search respects <code>.gitignore</code> entries.
            </Trans>
          }
          onUseIgnoreFilesChange={(next) =>
            host.remote ? host.update({ searchUseIgnoreFiles: next }) : setUseIgnoreFiles(next)
          }
          baseline={DEFAULT_SEARCH_EXCLUDE}
          value={scopedExclude}
          onValueChange={(next) =>
            host.remote ? host.update({ searchExclude: next }) : setExclude(next)
          }
        />
      ) : (
        <p role="status">
          <Trans>Settings unavailable</Trans>
        </p>
      )}
    </SettingsPage>
  );
}
