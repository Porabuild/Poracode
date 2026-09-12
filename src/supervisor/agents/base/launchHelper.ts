import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { ProjectLocation } from "@/shared/contracts";
import { toWslUncPath } from "@/shared/wsl";
import { deployFilesToWslTempBase, resolveWslHelpersDir } from "../../wsl/wslDeploy";

/** Resolve a bundled standalone helper, deploying a private copy for WSL launches. */
export function stageLaunchHelper(
  location: ProjectLocation,
  name: string,
  prefix: string,
): {
  path: string;
  cleanup?: () => void;
} {
  const helpers = resolveWslHelpersDir();
  const source = helpers ? join(helpers, name) : "";
  if (!source || !existsSync(source)) throw new Error(`Poracode helper ${name} is unavailable`);
  if (location.kind !== "wsl") return { path: source };
  const deployed = deployFilesToWslTempBase(location.distro, `poracode-${prefix}-${randomUUID()}`, [
    { src: source, relDest: name },
  ]);
  if (!deployed) throw new Error(`Poracode helper ${name} could not be deployed to WSL`);
  return {
    path: `${deployed.linuxBaseDir}/${name}`,
    cleanup: () =>
      rmSync(toWslUncPath(location.distro, deployed.linuxBaseDir), {
        recursive: true,
        force: true,
      }),
  };
}
