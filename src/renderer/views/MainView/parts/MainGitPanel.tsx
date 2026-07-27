import { Suspense, useEffect, useState } from "react";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { usePanelVisibility } from "./AppShell/parts/usePanelVisibility";
import { DeferredProjectAuxiliaryPanel } from "@/renderer/deferredFeatures";

export function MainGitPanel() {
  const terminalPosition = useSharedSettings((s) => s.terminalPosition);
  const { gitPanelOpen } = usePanelVisibility();
  const [enabled, setEnabled] = useState(gitPanelOpen);

  useEffect(() => {
    if (gitPanelOpen) setEnabled(true);
  }, [gitPanelOpen]);

  if (!enabled) return null;

  const isTerminalRight = terminalPosition === "right";

  if (isTerminalRight) {
    return null;
  }

  return (
    <Suspense>
      <DeferredProjectAuxiliaryPanel includeTerminal={false} visible={gitPanelOpen} />
    </Suspense>
  );
}
