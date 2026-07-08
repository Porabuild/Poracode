export type MobileRuntimePlatform = "android" | "ios" | "web";

type CapacitorGlobal = {
  readonly Capacitor?: {
    readonly getPlatform?: () => string;
    readonly isNativePlatform?: () => boolean;
  };
};

export function getMobileRuntimePlatform(): MobileRuntimePlatform {
  const cap = (globalThis as CapacitorGlobal).Capacitor;
  const platform = cap?.getPlatform?.();
  if (platform === "android" || platform === "ios") return platform;

  if (typeof navigator !== "undefined") {
    if (/Android/i.test(navigator.userAgent)) return "android";
    if (
      /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    ) {
      return "ios";
    }
  }

  return "web";
}

export function isAndroidRuntime(): boolean {
  return getMobileRuntimePlatform() === "android";
}
