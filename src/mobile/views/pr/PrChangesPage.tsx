import { useState } from "react";
import { useGitStore } from "@/renderer/state/gitStore";
import { PrDiffContent } from "@/renderer/views/PrReviewOverlay/parts/PrDiffContent";
import { DIFF_MODE, DiffModeToggle } from "../../components";
import { usePr } from "./prContext";
import { PrPageHeader } from "./PrPageHeader";

export function PrChangesPage() {
  const pr = usePr();
  const files = useGitStore((s) => s.prFiles[pr.cacheKey]);
  const rawDiff = useGitStore((s) => s.prDiffs[pr.cacheKey]);
  const [diffMode, setDiffMode] = useState<number>(DIFF_MODE.Unified);

  return (
    <>
      <PrPageHeader
        title="Changes"
        onBack={pr.toOverview}
        backLabel="Back to overview"
        actions={<DiffModeToggle mode={diffMode} onChange={setDiffMode} />}
      />
      <div className="m-git-overlay__body">
        <PrDiffContent
          files={files ?? []}
          rawDiff={rawDiff ?? ""}
          selectedFile={null}
          diffMode={diffMode}
          loading={pr.loading}
        />
      </div>
    </>
  );
}
