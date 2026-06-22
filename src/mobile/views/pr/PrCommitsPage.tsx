import { useLingui } from "@lingui/react/macro";
import { PrCommitsTab } from "@/renderer/views/PrReviewOverlay/parts/PrCommitsTab";
import { usePr } from "./prContext";
import { PrPageHeader } from "./PrPageHeader";

export function PrCommitsPage() {
  const { t } = useLingui();
  const pr = usePr();
  return (
    <>
      <PrPageHeader title={t`Commits`} onBack={pr.toOverview} backLabel={t`Back to overview`} />
      <div className="m-pr-scroll">
        <PrCommitsTab cacheKey={pr.cacheKey} prKey={pr.prKey} loading={pr.loading} />
      </div>
    </>
  );
}
