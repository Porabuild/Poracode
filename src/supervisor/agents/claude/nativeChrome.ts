import type { ProjectLocation } from "@/shared/contracts";

/** Native Claude browser access is separate from Poracode's Chrome MCP. */
export function claudeNativeChromeArgs(
  location: ProjectLocation,
  settings: Record<string, boolean | string> | undefined,
): string[] {
  return location.kind === "wsl" || settings?.chromeIntegration === false
    ? ["--no-chrome"]
    : ["--chrome"];
}

/** Explicit startup flags also work in SDK/headless mode. */
export function claudeSdkNativeChromeArgs(
  location: ProjectLocation,
  settings: Record<string, boolean | string> | undefined,
): Record<string, null> {
  return Object.fromEntries(
    claudeNativeChromeArgs(location, settings).map((flag) => [flag.slice(2), null]),
  );
}
