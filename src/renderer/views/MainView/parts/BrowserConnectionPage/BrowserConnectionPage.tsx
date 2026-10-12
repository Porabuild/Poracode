import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { DesktopPairing } from "./parts/DesktopPairing";
import { TouchPairing } from "./parts/TouchPairing";
import { usePairing } from "./usePairing";

/**
 * The browser has separate compact and desktop presentations. Viewport width
 * picks the presentation; camera availability inside the compact presentation
 * decides whether scanning can actually be offered.
 */
export function BrowserConnectionPage() {
  const pairing = usePairing();
  const compactLayout = useCompactLayout();

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-background">
      {compactLayout ? <TouchPairing pairing={pairing} /> : <DesktopPairing pairing={pairing} />}
    </div>
  );
}
