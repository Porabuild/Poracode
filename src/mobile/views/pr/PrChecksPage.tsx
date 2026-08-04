import { useLingui } from "@lingui/react/macro";
import { PrChecksTab } from "@/renderer/views/PrReviewOverlay/parts/PrChecksTab";
import { usePr } from "./prContext";
import { PrSubPage } from "./PrSubPage";

export function PrChecksPage() {
  const { t } = useLingui();
  const pr = usePr();
  return (
    <PrSubPage title={t`Checks`} className="m-pr-scroll">
      <PrChecksTab cacheKey={pr.cacheKey} loading={pr.loading} projectId={pr.project.id} />
    </PrSubPage>
  );
}
