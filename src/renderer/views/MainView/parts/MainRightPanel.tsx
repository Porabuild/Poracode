import { Suspense, useEffect, useState } from "react";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useBottomTerminalVisible, usePanelVisibility } from "./AppShell/parts/usePanelVisibility";
import { BottomPanelDockContainer } from "./RightPanel/parts/PanelDock/BottomPanelDockContainer";
import {
  DeferredDevTerminalPanel,
  DeferredProjectAuxiliaryPanel,
} from "@/renderer/deferredFeatures";

export function MainRightPanel() {
  const terminalPosition = useSharedSettings((s) => s.terminalPosition);
  const { rightPanelOpen } = usePanelVisibility();
  const terminalVisible = useBottomTerminalVisible();
  const [enabled, setEnabled] = useState(rightPanelOpen);

  useEffect(() => {
    if (rightPanelOpen) setEnabled(true);
  }, [rightPanelOpen]);

  if (!enabled) return null;

  const isTerminalRight = terminalPosition === "right";

  if (isTerminalRight && !rightPanelOpen) return null;

  return (
    <Suspense>
      {!isTerminalRight ? (
        <BottomPanelDockContainer terminalVisible={terminalVisible}>
          <DeferredDevTerminalPanel />
        </BottomPanelDockContainer>
      ) : (
        <DeferredProjectAuxiliaryPanel includeTerminal visible={rightPanelOpen} />
      )}
    </Suspense>
  );
}
