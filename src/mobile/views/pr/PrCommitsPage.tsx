import { useLingui } from "@lingui/react/macro";
import { PrCommitsTab } from "@/renderer/views/PrReviewOverlay/parts/PrCommitsTab";
import { usePr } from "./prContext";
import { PrSubPage } from "./PrSubPage";

export function PrCommitsPage() {
  const { t } = useLingui();
  const pr = usePr();
  return (
    <PrSubPage title={t`Commits`} className="m-pr-scroll">
      <PrCommitsTab cacheKey={pr.cacheKey} prKey={pr.prKey} loading={pr.loading} />
    </PrSubPage>
  );
}
