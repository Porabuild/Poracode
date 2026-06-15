import { nativeTheme } from "electron";
import { release } from "node:os";

/**
 * Native "liquid glass" window materials.
 *
 * The opt-in translucent sidebar relies on an OS-composited blur behind the
 * window (macOS `NSVisualEffectView` vibrancy / Windows 11 DWM acrylic). On
 * macOS these can only be revealed when the window is *created* transparent —
 * an opaque window cannot be made transparent at runtime — so the material is
 * applied once in {@link createMainWindow} and toggling the setting requires a
 * relaunch. This module centralizes the OS capability check and native-theme sync.
 *
 * macOS 26 "Liquid Glass" (`NSGlassEffectView`) is not exposed by Electron, so
 * the closest officially-supported material is `vibrancy: "sidebar"`, which the
 * OS already re-skins toward the Tahoe look.
 */

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

/**
 * Mirrors the app appearance onto the native theme so an active vibrancy/acrylic
 * material renders in the matching light/dark variant. Without this it follows
 * the OS appearance (e.g. a light app over a dark OS shows a dark frosted sidebar).
 */
export function syncNativeThemeForMaterial(appearance: "light" | "dark"): void {
  nativeTheme.themeSource = appearance;
}
