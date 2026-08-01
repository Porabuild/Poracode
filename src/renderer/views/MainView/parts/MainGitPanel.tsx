import { Suspense } from "react";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { usePanelVisibility } from "./AppShell/parts/usePanelVisibility";
import { DeferredProjectAuxiliaryPanel } from "@/renderer/deferredFeatures";

export function MainGitPanel() {
  const terminalPosition = useSharedSettings((s) => s.terminalPosition);
  const { gitPanelOpen } = usePanelVisibility();

  const isTerminalRight = terminalPosition === "right";

  if (isTerminalRight || !gitPanelOpen) {
    return null;
  }

  return (
    <Suspense>
      <DeferredProjectAuxiliaryPanel includeTerminal={false} visible={gitPanelOpen} />
    </Suspense>
  );
}
