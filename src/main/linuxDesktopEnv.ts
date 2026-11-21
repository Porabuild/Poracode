interface CommandLineLike {
  appendSwitch(switchName: string, value?: string): void;
  hasSwitch?: (switchName: string) => boolean;
}

export interface LinuxDesktopSwitchOptions {
  readonly platform?: NodeJS.Platform;
  readonly env?: NodeJS.ProcessEnv;
  readonly useMockKeychain?: boolean;
  readonly commandLine: CommandLineLike;
}

const HYPRLAND_OR_OMARCHY_PATTERN = /\b(?:hyprland|omarchy)\b/iu;

/**
 * Detect Hyprland / Omarchy desktop sessions from freedesktop environment
 * variables. Matches both single values (`Hyprland`) and colon-separated lists
 * (`Hyprland:wlroots`).
 */
export function isHyprlandOrOmarchySession(env: NodeJS.ProcessEnv = process.env): boolean {
  const candidates = [env.XDG_CURRENT_DESKTOP, env.XDG_SESSION_DESKTOP, env.DESKTOP_SESSION];
  return candidates.some(
    (value) => typeof value === "string" && HYPRLAND_OR_OMARCHY_PATTERN.test(value),
  );
}

/**
 * Configure Chromium/Electron switches for modern Linux Wayland desktops
 * (including Omarchy 4.5 / Hyprland on x86_64 and aarch64):
 * - Enable GlobalShortcutsPortal so global shortcuts route through xdg-desktop-portal.
 * - Default ozone-platform-hint to `auto` so Wayland sessions run natively (crisp
 *   fractional scaling) while X11 sessions stay on X11, preserving explicit user overrides.
 * - Pin `password-store=gnome-libsecret` on Hyprland/Omarchy unless the user explicitly
 *   chose another store or mock keychain is active, preventing Electron safeStorage from
 *   falling back to unencrypted `basic_text` when neither GNOME nor KDE is detected.
 */
export function configureLinuxDesktopSwitches({
  platform = process.platform,
  env = process.env,
  useMockKeychain = false,
  commandLine,
}: LinuxDesktopSwitchOptions): void {
  if (platform !== "linux") return;

  const hasSwitch = (switchName: string) =>
    typeof commandLine.hasSwitch === "function" && commandLine.hasSwitch(switchName);

  commandLine.appendSwitch("enable-features", "GlobalShortcutsPortal");

  if (
    !hasSwitch("ozone-platform") &&
    !hasSwitch("ozone-platform-hint") &&
    !env.ELECTRON_OZONE_PLATFORM_HINT?.trim()
  ) {
    commandLine.appendSwitch("ozone-platform-hint", "auto");
  }

  if (
    !useMockKeychain &&
    !hasSwitch("use-mock-keychain") &&
    !hasSwitch("password-store") &&
    isHyprlandOrOmarchySession(env)
  ) {
    commandLine.appendSwitch("password-store", "gnome-libsecret");
  }
}
