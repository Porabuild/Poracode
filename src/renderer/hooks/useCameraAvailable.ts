import { useEffect, useState } from "react";

/**
 * Whether this browser could plausibly run the live QR scanner.
 *
 * Two things make scanning outright impossible, and both are knowable without
 * touching the camera: no `getUserMedia`, or an insecure context. The latter is
 * the common one — a desktop reached over plain `http://<lan-ip>` is not a secure
 * context, so the camera can never open there no matter what hardware exists.
 *
 * Beyond that we stay optimistic. `enumerateDevices` only proves the *absence* of
 * a camera when it returns a populated list with no video input; Safari reports an
 * empty list until permission is granted, so an empty result says nothing and must
 * not hide the scan route. A device that turns out to be unusable is handled by
 * the scanner itself, which explains why and offers the other routes — a better
 * outcome than silently hiding the primary action.
 */
export function useCameraAvailable(): boolean {
  const [available, setAvailable] = useState(() => canRequestCamera());

  useEffect(() => {
    if (!available) return;
    let cancelled = false;
    void navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => {
        if (cancelled || devices.length === 0) return;
        if (!devices.some((device) => device.kind === "videoinput")) setAvailable(false);
      })
      .catch(() => {
        // Enumeration is a refinement, not a gate; leave the verdict as it stands.
      });
    return () => {
      cancelled = true;
    };
  }, [available]);

  return available;
}

function canRequestCamera(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  return window.isSecureContext !== false && Boolean(navigator.mediaDevices?.getUserMedia);
}
