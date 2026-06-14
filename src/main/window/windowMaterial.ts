import { release } from "node:os";

/**
 * Native "liquid glass" window materials.
 *
 * The opt-in translucent sidebar relies on an OS-composited blur behind the
 * window (macOS `NSVisualEffectView` vibrancy / Windows 11 DWM acrylic). This
 * module centralizes the capability check and the per-appearance opaque
 * background so the window constructor ({@link createMainWindow}) and the live
 * `setWindowChrome` IPC handler stay in agreement.
 *
 * macOS 26 "Liquid Glass" (`NSGlassEffectView`) is not exposed by Electron, so
 * the closest officially-supported material is `vibrancy: "sidebar"`, which the
 * OS already re-skins toward the Tahoe look.
 */

export type Appearance = "light" | "dark";

/**
 * Opaque window background per appearance. Mirrors the constants used by the
 * constructor first paint so toggling the material off restores the same color.
 */
export function opaqueWindowBackground(appearance: Appearance): string {
  return appearance === "dark" ? "#141416" : "#f1f1f4";
}

/**
 * Windows 11 22H2 (build 22621) is the first build with a stable DWM acrylic
 * system backdrop; earlier Windows builds and Windows 10 have no usable native
 * blur, so they fall back to the in-app CSS imitation.
 */
function isWindows11AcrylicCapable(): boolean {
  if (process.platform !== "win32") {
    return false;
  }
  const build = Number(release().split(".")[2] ?? "0");
  return Number.isFinite(build) && build >= 22621;
}

/** Whether the current OS can render a native blur material behind the window. */
export function supportsNativeWindowMaterial(): boolean {
  return process.platform === "darwin" || isWindows11AcrylicCapable();
}
