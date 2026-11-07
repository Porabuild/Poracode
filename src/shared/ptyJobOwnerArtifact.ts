import { createHash } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import { join } from "node:path";
import {
  PTY_JOB_OWNER_MAX_BYTES,
  ptyJobOwnerManifestSchema,
  type PtyJobOwnerTarget,
} from "./contracts/ptyJobOwner.ts";
import { readBoundedRuntimeFileSync } from "./readBoundedRuntimeFile.ts";
import { isWindowsGuiExecutable } from "./windowsGuiExecutable.ts";

export function readPtyJobOwnerArtifact(root: string, target: PtyJobOwnerTarget) {
  const manifestPath = join(root, "manifest.json");
  if (!lstatSync(manifestPath).isFile() || realpathSync.native(manifestPath) !== manifestPath)
    throw new Error("Invalid PTY job owner manifest custody.");
  const manifest = ptyJobOwnerManifestSchema.parse(
    JSON.parse(readBoundedRuntimeFileSync(manifestPath, 16_384).toString("utf8")),
  );
  const artifact = manifest.targets[target];
  if (!artifact) throw new Error(`No staged PTY job owner for ${target}. Rebuild this runtime.`);
  const path = join(root, artifact.relativePath);
  if (!lstatSync(path).isFile() || realpathSync.native(path) !== path)
    throw new Error("Invalid PTY job owner artifact custody.");
  const bytes = readBoundedRuntimeFileSync(path, PTY_JOB_OWNER_MAX_BYTES);
  if (
    bytes.length !== artifact.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== artifact.sha256 ||
    !isWindowsGuiExecutable(bytes, target, PTY_JOB_OWNER_MAX_BYTES)
  )
    throw new Error("PTY job owner content or native GUI executable shape differs.");
  return { path, target, manifest, artifact, bytes };
}
