import type { ReactNode } from "react";
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
    pillInHeaderBreakpoint = "lg",
  } = props;

  const panel =
    active === "conversation"
      ? conversationPanel
      : active === "commits"
        ? commitsPanel
        : active === "checks"
          ? checksPanel
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
      <div className={`shrink-0 justify-center px-5 py-1 ${standaloneVisibility}`}>
        <PrTabsPill
          active={active}
          onChange={onChange}
          counts={counts}
          checksStatus={checksStatus}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden" role="tabpanel">
        {panel}
      </div>
    </div>
  );
}
