import { usePanelStore } from "@/renderer/state/panelStore";
import { BrowserDrawerShell } from "@/renderer/components/layout/BrowserDrawerShell";
import { BrowserPanel } from "./RightPanel/parts/BrowserPanel/BrowserPanel";

export function BrowserOverlay(props: { open: boolean }) {
  const { open } = props;
  const maximized = usePanelStore((s) => s.browserOverlayMaximized);
  const setBrowserOverlayOpen = usePanelStore((s) => s.setBrowserOverlayOpen);

  return (
    <BrowserDrawerShell
      open={open}
      maximized={maximized}
      onExited={() => setBrowserOverlayOpen(false)}
    >
      <BrowserPanel visible={open} />
    </BrowserDrawerShell>
  );
}
