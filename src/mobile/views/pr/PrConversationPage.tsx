import { PrConversationTab } from "@/renderer/views/PrReviewOverlay/parts/PrConversationTab";
import { usePr } from "./prContext";
import { PrPageHeader } from "./PrPageHeader";

export function PrConversationPage() {
  const pr = usePr();
  return (
    <>
      <PrPageHeader title="Conversation" onBack={pr.toOverview} backLabel="Back to overview" />
      <div className="m-git-overlay__body">
        <PrConversationTab
          cacheKey={pr.cacheKey}
          projectLocation={pr.projectLocation}
          prNumber={pr.prNumber}
          loading={pr.loading}
          onPosted={pr.reload}
        />
      </div>
    </>
  );
}
