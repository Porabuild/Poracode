import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ProjectLocation } from "@/shared/contracts";
import {
  deployFilesToWslTempBase,
  removeWslStagedPath,
  resolveWslHelpersDir,
} from "../../wsl/wslDeploy";

export interface StagedLaunchHelper {
  path: string;
  cleanup?: () => Promise<void>;
}

/**
 * Resolve a bundled standalone helper, deploying a private copy for WSL
 * launches. Adapter argv builders await this; the WSL copy runs in the
 * per-distro staging worker, so a stalled distro never blocks the supervisor
 * control loop. Callers own the returned cleanup, which removes the staged
 * copy through the same worker.
 */
export async function stageLaunchHelper(
  location: ProjectLocation,
  name: string,
  prefix: string,
): Promise<StagedLaunchHelper> {
  const helpers = resolveWslHelpersDir();
  const source = helpers ? join(helpers, name) : "";
  if (!source || !existsSync(source)) throw new Error(`Poracode helper ${name} is unavailable`);
  if (location.kind !== "wsl") return { path: source };
  const deployed = await deployFilesToWslTempBase(
    location.distro,
    `poracode-${prefix}-${randomUUID()}`,
    [{ src: source, relDest: name }],
  );
  if (!deployed) throw new Error(`Poracode helper ${name} could not be deployed to WSL`);
  return {
    path: `${deployed.linuxBaseDir}/${name}`,
    cleanup: () => removeWslStagedPath(location.distro, deployed.linuxBaseDir),
  };
}
