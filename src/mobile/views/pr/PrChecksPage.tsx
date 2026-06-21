import { PrChecksTab } from "@/renderer/views/PrReviewOverlay/parts/PrChecksTab";
import { usePr } from "./prContext";
import { PrPageHeader } from "./PrPageHeader";

export function PrChecksPage() {
  const pr = usePr();
  return (
    <>
      <PrPageHeader title="Checks" onBack={pr.toOverview} backLabel="Back to overview" />
      <div className="m-pr-scroll">
        <PrChecksTab cacheKey={pr.cacheKey} loading={pr.loading} />
      </div>
    </>
  );
}
