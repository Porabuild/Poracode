import { useRef } from "react";
import { usePrAskChat } from "../detail/prAskChat";
import { usePrDetailNav, type PrTab } from "../detail/prDetailNav";
import { PrFlowProvider } from "../detail/prFlow";
import { PrTabPanels } from "../detail/PrTabPanels";
import { usePrDetailTabs } from "../detail/usePrDetailTabs";
import { PrCompactBottomBar } from "./PrCompactBottomBar";
import { PrTitleBlock } from "../detail/PrTitleBlock";

/**
 * The compact (mobile PWA) detail page. The page header carries Back, `#number`
 * and the review's actions; below it the whole review is ONE scroll (title block,
 * then the open tab); the bottom row floats over it with Ask, the tabs and the
 * primary action.
 */
export function PrCompactDetail() {
  const { setTab } = usePrDetailNav();
  const chat = usePrAskChat();
  const { tabs, active, guideAvailable } = usePrDetailTabs({ compact: true });
  const scroller = useRef<HTMLDivElement | null>(null);
  // A tab starts at its top; the page scroller is shared, so the previous tab's offset is dropped.
  function changeTab(tab: PrTab) {
    setTab(tab);
    if (scroller.current) scroller.current.scrollTop = 0;
  }
  // The chat page covers this page while it is open; this page stays mounted underneath.
  const covered = chat.open;

  return (
    <PrFlowProvider value={{ flow: true, scrollRoot: scroller }}>
      <section className="relative h-full min-h-0">
        <div ref={scroller} className="m-pr-scroll h-full overflow-y-auto">
          <PrTitleBlock />
          <div role="tabpanel">
            <PrTabPanels active={active} guideAvailable={guideAvailable} />
          </div>
        </div>
        <PrCompactBottomBar tabs={tabs} active={active} onChange={changeTab} covered={covered} />
      </section>
    </PrFlowProvider>
  );
}
