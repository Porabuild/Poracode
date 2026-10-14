import type { BrowserDeviceEmulation } from "./ipc/procedures/browser";

/** One equality rule governs both native emission and renderer invalidation. */
export function browserDeviceEmulationEqual(
  a: BrowserDeviceEmulation | undefined,
  b: BrowserDeviceEmulation | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.deviceScaleFactor === b.deviceScaleFactor &&
    a.scale === b.scale &&
    a.mobile === b.mobile &&
    a.touch === b.touch &&
    a.preset === b.preset
  );
}
