import { useLingui } from "@lingui/react/macro";
import { PrConversationTab } from "@/renderer/views/PrReviewOverlay/parts/PrConversationTab";
import { usePr } from "./prContext";
import { PrSubPage } from "./PrSubPage";

export function PrConversationPage() {
  const { t } = useLingui();
  const pr = usePr();
  return (
    <PrSubPage title={t`Conversation`} className="m-git-overlay__body">
      <PrConversationTab
        cacheKey={pr.cacheKey}
        projectLocation={pr.projectLocation}
        prNumber={pr.prNumber}
        loading={pr.loading}
        onPosted={pr.reload}
      />
    </PrSubPage>
  );
}
