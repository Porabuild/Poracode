import { useState } from "react";
import { ChangesTab } from "../changes/ChangesTab";
import { PrGuidePanel } from "../guide/PrGuidePanel";
import { SummaryTab } from "../summary/SummaryTab";
import { TimelineTab } from "../timeline/TimelineTab";
import type { PrTab } from "./prDetailNav";

/**
 * The open tab. The guide keeps its stop, instructions and writer choice while the
 * reviewer follows a stop's file link, so it stays mounted (hidden) once opened.
 */
export function PrTabPanels(props: { active: PrTab; guideAvailable: boolean }) {
  const { active, guideAvailable } = props;
  const [guideOpened, setGuideOpened] = useState(false);
  if (active === "guide" && !guideOpened) setGuideOpened(true);
  return (
    <>
      {active === "summary" ? <SummaryTab /> : null}
      {active === "timeline" ? <TimelineTab /> : null}
      {active === "changes" ? <ChangesTab /> : null}
      {guideOpened && guideAvailable ? (
        <div className={active === "guide" ? "h-full" : "hidden"}>
          <PrGuidePanel />
        </div>
      ) : null}
    </>
  );
}
