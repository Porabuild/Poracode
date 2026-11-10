import { lstatSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { readStandaloneRuntimeMarker } from "../../scripts/server-release-install.mjs";
import { canonicalHostPath } from "@/backend/ownership/hostRootPaths";
import { acquireServerUpgradeLock } from "./serverUpgradeLock";
import { refusePendingCliInstallMigration } from "./cliInstallMigrationJournal";
import { writeCurrentSymlink } from "./serverNativeOverlay";

/** Installer-side current switch, fenced against service migration and upgrades. */
export function activateInstalledRelease(prefixInput: string, releaseInput: string): void {
  const prefix = canonicalHostPath(resolve(prefixInput));
  const release = realpathSync(resolve(releaseInput));
  if (
    dirname(release) !== realpathSync(join(prefix, "releases")) ||
    !lstatSync(releaseInput).isDirectory() ||
    !readStandaloneRuntimeMarker(release)
  ) {
    throw new Error("The selected release is not a direct self-contained release in this prefix.");
  }
  const lock = acquireServerUpgradeLock({ prefix, releaseId: basename(release) });
  try {
    lock.assertHeld();
    refusePendingCliInstallMigration(prefix);
    try {
      lstatSync(join(prefix, "service-registration.json"));
      throw new Error("A registered service must use poracode update to change releases.");
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT"))
        throw error;
    }
    try {
      if (!lstatSync(join(prefix, "current")).isSymbolicLink())
        throw new Error("The current entry is not a release link.");
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT"))
        throw error;
    }
    lock.assertHeld();
    writeCurrentSymlink(prefix, release);
  } finally {
    lock.release();
  }
}
