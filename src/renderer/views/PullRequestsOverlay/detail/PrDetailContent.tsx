import { useLingui } from "@lingui/react/macro";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { LightballTabs } from "@/renderer/components/common";
import { PrCompactDetail } from "../compact/PrCompactDetail";
import { usePrDetailNav } from "./prDetailNav";
import { PrReadOnlyNotice } from "./PrReadOnlyNotice";
import { PrTabPanels } from "./PrTabPanels";
import { PrTitleBlock } from "./PrTitleBlock";
import { usePrDetailTabs } from "./usePrDetailTabs";

/**
 * Title block, tab strip and the open tab. Mounted with the review's key, so its
 * local state starts fresh for each review while the data hooks above it stay alive.
 * The compact layout has its own page (one scroll, bottom tab bar).
 */
export function PrDetailContent() {
  const compact = useCompactLayout();
  return compact ? <PrCompactDetail /> : <PrDesktopDetail />;
}

function PrDesktopDetail() {
  const { t } = useLingui();
  const { setTab } = usePrDetailNav();
  const { tabs, active, guideAvailable } = usePrDetailTabs({ compact: false });
  return (
    <div className="@container flex h-full min-h-0 flex-col">
      <PrReadOnlyNotice suppressLoading className="shrink-0 px-6 pt-2 text-xs text-muted" />
      <PrTitleBlock />
      <div className="flex shrink-0 justify-start overflow-x-auto px-6 pb-2">
        <LightballTabs
          tabs={tabs}
          active={active}
          onChange={setTab}
          ariaLabel={t`Pull request sections`}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden" role="tabpanel">
        <PrTabPanels active={active} guideAvailable={guideAvailable} />
      </div>
    </div>
  );
}
