import { hasElectronHostBridge } from "./clientRuntime";

/** A focused, single-chat client. Runtime and provider behavior stay shared. */
export function isChatSidebarSurface(): boolean {
  return (
    import.meta.env.VITE_PORACODE_BUILD_TARGET === "extension" ||
    (typeof window !== "undefined" &&
      !hasElectronHostBridge() &&
      new URLSearchParams(window.location.search).get("surface") === "chat-sidebar")
  );
}
