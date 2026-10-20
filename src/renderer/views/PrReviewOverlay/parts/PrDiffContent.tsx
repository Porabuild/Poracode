import type { PrFile } from "@/shared/contracts";
import { compareFilesByDirThenName } from "@/renderer/utils/gitHelpers";
import { DiffCardList, type DiffCardEntry } from "@/renderer/components/diff/DiffCardList";
import { useDiffTheme } from "../../GitReviewOverlay/parts/diffBuildClient";
import { splitUnifiedDiff } from "@/shared/reviewDiff";

export function PrDiffContent(props: {
  files: PrFile[];
  rawDiff: string;
  selectedFile: string | null;
  diffMode: number;
  loading: boolean;
}) {
  const { files, rawDiff, selectedFile, diffMode, loading } = props;
  const theme = useDiffTheme();
  const fileDiffs = splitUnifiedDiff(rawDiff);

  const entries: DiffCardEntry[] = files
    .toSorted((a, b) => compareFilesByDirThenName({ path: a.path }, { path: b.path }))
    .map((f) => ({
      path: f.path,
      patch: fileDiffs.get(f.path) ?? "",
      additions: f.additions,
      deletions: f.deletions,
    }));

  return (
    <DiffCardList
      entries={entries}
      visiblePath={selectedFile}
      diffMode={diffMode}
      theme={theme}
      loading={loading}
    />
  );
}
