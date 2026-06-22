import { Trans, useLingui } from "@lingui/react/macro";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { DEFAULT_SEARCH_EXCLUDE } from "@/shared/searchExclude";
import { SearchExcludeBody } from "./SearchExcludeBody";
import { SettingsPage } from "./SettingsForm";

export function SearchSettings() {
  const { t } = useLingui();
  const useIgnoreFiles = useSharedSettings((s) => s.searchUseIgnoreFiles);
  const setUseIgnoreFiles = useSharedSettings((s) => s.setSearchUseIgnoreFiles);
  const exclude = useSharedSettings((s) => s.searchExclude);
  const setExclude = useSharedSettings((s) => s.setSearchExclude);

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
      <SearchExcludeBody
        useIgnoreFilesAnchorId="search.useIgnoreFiles"
        excludePatternsAnchorId="search.excludePatterns"
        useIgnoreFiles={useIgnoreFiles}
        useIgnoreFilesNote={
          <Trans>
            When enabled, search respects <code>.gitignore</code> entries.
          </Trans>
        }
        onUseIgnoreFilesChange={setUseIgnoreFiles}
        baseline={DEFAULT_SEARCH_EXCLUDE}
        value={exclude}
        onValueChange={setExclude}
      />
    </SettingsPage>
  );
}
