import { useState, type ReactNode } from "react";
import type { PrChecksStatus } from "@/renderer/utils/prStatus";
import { PrTabsPill, type PrTabCounts, type PrTabKey } from "./PrTabsPill";

export type { PrTabKey } from "./PrTabsPill";

export function PrTabs(props: {
  active: PrTabKey;
  onChange: (key: PrTabKey) => void;
  counts: PrTabCounts;
  checksStatus?: PrChecksStatus | undefined;
  conversationPanel: ReactNode;
  commitsPanel: ReactNode;
  checksPanel: ReactNode;
  changesPanel: ReactNode;
  guidePanel?: ReactNode;
  /** When true, suppress the standalone pill row (e.g. when the pill is already in the header on lg+). */
  pillInHeaderBreakpoint?: "lg" | "md" | "always" | "never";
}) {
  const {
    active,
    onChange,
    counts,
    checksStatus,
    conversationPanel,
    commitsPanel,
    checksPanel,
    changesPanel,
    guidePanel,
    pillInHeaderBreakpoint = "lg",
  } = props;

  const effectiveActive = active === "guide" && !guidePanel ? "conversation" : active;
  // The guide keeps its stop, instructions, and writer choice while the reviewer follows a stop's
  // file link, so it stays mounted (hidden) once opened.
  const [guideOpened, setGuideOpened] = useState(false);
  if (effectiveActive === "guide" && !guideOpened) setGuideOpened(true);
  const panel =
    effectiveActive === "conversation"
      ? conversationPanel
      : effectiveActive === "commits"
        ? commitsPanel
        : effectiveActive === "checks"
          ? checksPanel
          : effectiveActive === "guide"
            ? null
            : changesPanel;

  // When the pill is rendered inline in the header at a given container size,
  // the standalone row hides at that size to avoid the duplicate. "always"
  // means the header always has the pill; "never" means the header never does
  // (standalone always shown).
  const standaloneVisibility =
    pillInHeaderBreakpoint === "always"
      ? "hidden"
      : pillInHeaderBreakpoint === "never"
        ? "flex"
        : pillInHeaderBreakpoint === "md"
          ? "flex @2xl:hidden"
          : "flex @4xl:hidden";

  return (
    <div className="@container flex h-full min-h-0 w-full flex-col">
      <div className={`shrink-0 overflow-x-auto px-3 py-1 ${standaloneVisibility}`}>
        <div className="flex min-w-max flex-1 justify-center">
          <PrTabsPill
            active={effectiveActive}
            onChange={onChange}
            counts={counts}
            checksStatus={checksStatus}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden" role="tabpanel">
        {panel}
        {guideOpened && guidePanel ? (
          <div className={effectiveActive === "guide" ? "h-full" : "hidden"}>{guidePanel}</div>
        ) : null}
      </div>
    </div>
  );
}
