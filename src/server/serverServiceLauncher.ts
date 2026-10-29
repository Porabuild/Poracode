import { join } from "node:path";
import type { ServiceLauncherTarget } from "@/shared/contracts/serverServiceLauncher";
import { readServiceLauncherArtifact } from "@/shared/serverServiceLauncherArtifact";
import { ServerServiceRefusedError } from "./serverServiceRegistration";

// Release resources are immutable. This reader never installs, repairs or
// replaces a helper; prefix custody belongs to the explicitly fenced installer.
export function readServiceLauncher(releaseDir: string, architecture = process.arch) {
  if (architecture !== "x64" && architecture !== "arm64")
    throw new ServerServiceRefusedError(
      "No native Windows service launcher supports this architecture.",
    );
  const target: ServiceLauncherTarget = `win32-${architecture}`;
  const root = join(releaseDir, "resources", "service-launcher");
  try {
    return readServiceLauncherArtifact(root, target);
  } catch {
    throw new ServerServiceRefusedError(
      `The selected installed release has no usable ${target} service launcher. Use a matching qualified artifact; existing files were preserved.`,
    );
  }
}
