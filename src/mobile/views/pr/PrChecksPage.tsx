import { useLingui } from "@lingui/react/macro";
import { PrChecksTab } from "@/renderer/views/PrReviewOverlay/parts/PrChecksTab";
import { usePr } from "./prContext";
import { PrPageHeader } from "./PrPageHeader";

export function PrChecksPage() {
  const { t } = useLingui();
  const pr = usePr();
  return (
    <>
      <PrPageHeader title={t`Checks`} onBack={pr.toOverview} backLabel={t`Back to overview`} />
      <div className="m-pr-scroll">
        <PrChecksTab cacheKey={pr.cacheKey} loading={pr.loading} />
      </div>
    </>
  );
}
