import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { getSettingsSectionLabel, isDesktopSettingsSection } from "./settingsSections";

/** Route-derived narrow-layout chrome: home, a pushed subscreen, or a thread. */
export type Chrome =
  | { readonly layout: "home" }
  | {
      readonly layout: "subscreen";
      readonly title: MessageDescriptor;
      readonly backTo: "/threads" | "/settings" | "/settings/desktop";
    }
  | { readonly layout: "thread" }
  | { readonly layout: "fullscreen" };

/** Pure mapping from the current route path to the narrow-shell chrome. */
export function getChrome(pathname: string): Chrome {
  if (pathname.startsWith("/thread/")) return { layout: "thread" };
  if (
    pathname.startsWith("/workspace/") ||
    pathname.startsWith("/pr/") ||
    pathname.startsWith("/terminal/")
  ) {
    // These render their own full-screen chrome (own header + back button), so
    // the shell shows no top bar at all.
    return { layout: "fullscreen" };
  }
  if (pathname === "/settings/desktop") {
    return { layout: "subscreen", title: msg`Desktop Settings`, backTo: "/settings" };
  }
  const sectionMatch = /^\/settings\/(.+)$/.exec(pathname);
  if (sectionMatch?.[1]) {
    const id = decodeURIComponent(sectionMatch[1]);
    // Device sections are listed flat on the Settings screen; only desktop-syncing
    // sections sit behind the Desktop Settings subscreen.
    return {
      layout: "subscreen",
      title: getSettingsSectionLabel(id) ?? msg`Settings`,
      backTo: isDesktopSettingsSection(id) ? "/settings/desktop" : "/settings",
    };
  }
  // These are pushed straight from the home header's quick menu.
  if (pathname === "/usage") {
    return { layout: "subscreen", title: msg`Usage`, backTo: "/threads" };
  }
  if (pathname === "/browser") {
    return { layout: "subscreen", title: msg`Browser`, backTo: "/threads" };
  }
  if (pathname === "/ports") {
    return { layout: "subscreen", title: msg`Ports`, backTo: "/threads" };
  }
  if (pathname === "/projects") {
    return { layout: "subscreen", title: msg`Projects`, backTo: "/threads" };
  }
  if (pathname === "/settings") {
    return { layout: "subscreen", title: msg`Settings`, backTo: "/threads" };
  }
  if (pathname === "/new") {
    return { layout: "subscreen", title: msg`New thread`, backTo: "/threads" };
  }
  if (pathname === "/desktops") {
    return { layout: "subscreen", title: msg`Connections`, backTo: "/threads" };
  }
  return { layout: "home" };
}
