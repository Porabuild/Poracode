export type MobileRuntimePlatform = "android" | "ios" | "macos" | "web" | "windows";

export function getMobileRuntimePlatform(): MobileRuntimePlatform {
  if (typeof navigator !== "undefined") {
    if (/Windows/i.test(navigator.userAgent)) return "windows";
    if (/Android/i.test(navigator.userAgent)) return "android";
    if (
      /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    ) {
      return "ios";
    }
    if (/Macintosh|Mac OS X/i.test(navigator.userAgent)) return "macos";
  }

  return "web";
}

export function isAndroidRuntime(): boolean {
  return getMobileRuntimePlatform() === "android";
}

/**
 * Reflects the runtime platform onto <html data-mobile-platform> so the
 * stylesheet can scope platform-specific rules (e.g. the iOS input-zoom
 * workaround and the glass-surface alpha, which is tuned for iOS and reads
 * too transparent elsewhere).
 */
export function markMobilePlatformOnRoot(doc: Document = document): void {
  doc.documentElement.dataset.mobilePlatform = getMobileRuntimePlatform();
}
