import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";
import { windowsProjectLocationInWslDistro } from "../../wsl/projectLocation";

export async function resolveAgentProjectLocation(
  location: ProjectLocation,
  executionEnvironment?: ThreadConfig["executionEnvironment"],
  signal?: AbortSignal,
): Promise<ProjectLocation> {
  if (
    process.platform !== "win32" ||
    location.kind !== "windows" ||
    executionEnvironment?.kind !== "wsl"
  ) {
    return location;
  }
  // Legacy threads whose config pins a WSL distro keep resuming inside that
  // distro, where their provider session logs live. New threads never receive
  // the pin, so they run natively on the Windows host.
  return windowsProjectLocationInWslDistro(location, executionEnvironment.distro, signal);
}

export const WSL_HOST_BROWSER_ENV = { BROWSER: 'cmd.exe /c start ""' } as const;
