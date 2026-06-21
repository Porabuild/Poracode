import { PrCommitsTab } from "@/renderer/views/PrReviewOverlay/parts/PrCommitsTab";
import { usePr } from "./prContext";
import { PrPageHeader } from "./PrPageHeader";

export function PrCommitsPage() {
  const pr = usePr();
  return (
    <>
      <PrPageHeader title="Commits" onBack={pr.toOverview} backLabel="Back to overview" />
      <div className="m-pr-scroll">
        <PrCommitsTab cacheKey={pr.cacheKey} prKey={pr.prKey} loading={pr.loading} />
      </div>
    </>
  );
}
