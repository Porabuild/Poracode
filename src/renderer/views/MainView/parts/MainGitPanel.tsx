import { Suspense } from "react";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useKeepHeavyMountedForDisclosure } from "@/renderer/hooks/useKeepHeavyMountedForDisclosure";
import { PANEL_EXIT_DURATION_MS } from "@/renderer/components/layout/panelMotion";
import { usePanelVisibility } from "./AppShell/parts/usePanelVisibility";
import { DeferredProjectAuxiliaryPanel } from "@/renderer/deferredFeatures";

export function MainGitPanel() {
  const terminalPosition = useSharedSettings((s) => s.terminalPosition);
  const floatingDevice = usePanelStore(
    (s) => s.deviceWorkspaceThreadId !== null && s.deviceWorkspaceDetached,
  );
  const { gitPanelOpen } = usePanelVisibility();
  const { keepHeavy } = useKeepHeavyMountedForDisclosure(gitPanelOpen, {
    fallbackMs: PANEL_EXIT_DURATION_MS,
  });

  const isTerminalRight = terminalPosition === "right";

  if (isTerminalRight || (!gitPanelOpen && !keepHeavy && !floatingDevice)) {
    return null;
  }

  return (
    <Suspense>
      <DeferredProjectAuxiliaryPanel includeTerminal={false} visible={gitPanelOpen} />
    </Suspense>
  );
}
