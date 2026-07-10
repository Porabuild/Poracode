import { Suspense, useEffect, useState } from "react";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { usePanelVisibility } from "./AppShell/parts/usePanelVisibility";
import {
  DeferredDevTerminalPanel,
  DeferredProjectAuxiliaryPanel,
} from "@/renderer/deferredFeatures";

export function MainRightPanel() {
  const terminalPosition = useSharedSettings((s) => s.terminalPosition);
  const { rightPanelOpen } = usePanelVisibility();
  const [enabled, setEnabled] = useState(rightPanelOpen);

  useEffect(() => {
    if (rightPanelOpen) setEnabled(true);
  }, [rightPanelOpen]);

  if (!enabled) return null;

  const isTerminalRight = terminalPosition === "right";

  return (
    <Suspense>
      {!isTerminalRight ? (
        <DeferredDevTerminalPanel />
      ) : (
        <DeferredProjectAuxiliaryPanel includeTerminal />
      )}
    </Suspense>
  );
}
