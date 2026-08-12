import { useMediaQuery } from "@heroui/react";
import { DesktopPairing } from "./parts/DesktopPairing";
import { TouchPairing } from "./parts/TouchPairing";
import { usePairing } from "./usePairing";

/**
 * A coarse pointer means a phone or tablet — the only place a camera scan is
 * a real option. Desktop browsers get the URL form instead of a scan target
 * they cannot use.
 */
const CAMERA_POINTER_QUERY = "(pointer: coarse)";

/**
 * Full-screen pairing page for the browser client before any desktop is
 * paired — the unified-app successor to the retired PWA's first-launch
 * connections experience. The pairing transport is shared; the surface adapts
 * to the input modality.
 */
export function BrowserConnectionPage() {
  const pairing = usePairing();
  const cameraCapable = useMediaQuery(CAMERA_POINTER_QUERY);

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-background">
      {cameraCapable ? <TouchPairing pairing={pairing} /> : <DesktopPairing pairing={pairing} />}
    </div>
  );
}
