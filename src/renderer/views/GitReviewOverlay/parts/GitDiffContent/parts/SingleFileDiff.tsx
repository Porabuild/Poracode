import { useEffect, useState } from "react";
import { DiffFile, DiffView } from "@git-diff-view/react";
import { Trans } from "@lingui/react/macro";
import type { Project } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import {
  buildInWorker,
  diffFileFromBundle,
  extractDiffNames,
  getLang,
  useDiffTheme,
} from "../../diffBuildClient";

export function SingleFileDiff(props: {
  project: Project;
  filePath: string;
  staged: boolean;
  diffMode: number;
  refreshKey: number;
}) {
  const { project, filePath, staged, diffMode, refreshKey } = props;
  const theme = useDiffTheme();
  const [diffFile, setDiffFile] = useState<DiffFile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setDiffFile(null);

    async function load() {
      try {
        const result = await readBridge().getGitDiff({
          projectLocation: project.location,
          filePath,
          staged,
        });
        if (cancelled) return;
        const { oldName, newName } = extractDiffNames(result.diff);
        const results = await buildInWorker([
          {
            key: `single:${filePath}`,
            diff: result.diff,
            oldName,
            newName,
            fileLang: getLang(newName || filePath),
          },
        ]);
        if (cancelled) return;
        const r = results[0];
        if (r?.bundle) setDiffFile(diffFileFromBundle(r.data, r.bundle));
      } catch {
        /* empty */
      }
      if (!cancelled) setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [filePath, staged, project.id, project.location, refreshKey]);

  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-[var(--content-background)] px-4">
      {loading && (
        <div className="flex items-center justify-center py-8 text-sm text-muted">
          <Trans>Loading diff...</Trans>
        </div>
      )}
      {!loading && !diffFile && (
        <div className="flex items-center justify-center py-8 text-sm text-muted">
          <Trans>No changes to display</Trans>
        </div>
      )}
      {diffFile && (
        <div className="space-y-4">
          <div className="rounded border border-border">
            <DiffView
              diffFile={diffFile}
              diffViewMode={diffMode}
              diffViewTheme={theme}
              diffViewFontSize={12}
              diffViewHighlight={true}
              diffViewWrap={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}
