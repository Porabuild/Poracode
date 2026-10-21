import { createHash } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import { join } from "node:path";
import {
  SERVICE_LAUNCHER_MAX_BYTES,
  serviceLauncherManifestSchema,
  type ServiceLauncherTarget,
} from "./contracts/serverServiceLauncher.ts";
import { readBoundedRuntimeFileSync } from "./readBoundedRuntimeFile.ts";
import { isWindowsGuiExecutable } from "./windowsGuiExecutable.ts";

// Shared by release assembly and the local service installer. Return the exact
// verified bytes so a subsequent copy does not reopen a changed source path.
export function readServiceLauncherArtifact(root: string, target: ServiceLauncherTarget) {
  const path = join(root, "manifest.json");
  if (!lstatSync(path).isFile() || realpathSync.native(path) !== path)
    throw new Error("Invalid service launcher manifest custody.");
  const manifest = serviceLauncherManifestSchema.parse(
    JSON.parse(readBoundedRuntimeFileSync(path, 16_384).toString("utf8")),
  );
  const artifact = manifest.targets[target];
  if (!artifact) throw new Error(`No staged service launcher for ${target}.`);
  const file = join(root, artifact.relativePath);
  if (!lstatSync(file).isFile() || realpathSync.native(file) !== file)
    throw new Error("Invalid service launcher artifact custody.");
  const bytes = readBoundedRuntimeFileSync(file, SERVICE_LAUNCHER_MAX_BYTES);
  if (
    bytes.length !== artifact.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== artifact.sha256 ||
    !isWindowsGuiExecutable(bytes, target, SERVICE_LAUNCHER_MAX_BYTES)
  )
    throw new Error("Service launcher content or native GUI executable shape differs.");
  return { path: file, target, manifest, artifact, bytes };
}
