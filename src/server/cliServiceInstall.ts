import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  hostRuntimeTarget,
  installServerRelease,
  readStandaloneRuntimeMarker,
} from "../../scripts/server-release-install.mjs";
import { writeDirectoryLink } from "../../scripts/server-host-tools.mjs";
import { downloadVerifiedArchive, releaseDownloadBase } from "./cliSelfUpdate";
import { sha256OfFile } from "./cliArtifactDigest";
import { copyVerifiedRuntime, verifiedLauncherCache } from "./cliServiceRuntimeCache";
import { SelfUpdateError, VERSION_PATTERN } from "./installerPrefix";
import { acquireServerUpgradeLock } from "./serverUpgradeLock";
import {
  allocateReleaseDirectory,
  allocateUpgradeReleaseId,
  removeStagedReleaseDirectory,
} from "./serverUpgradeReleases";

/** Install a verified release for a service without depending on the npm cache. */
export async function installServiceRelease(input: {
  readonly prefix: string;
  readonly version: string;
  readonly releaseRoot?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly target?: string;
  readonly fetchImpl?: (
    url: string,
    init?: { headers?: Record<string, string> },
  ) => Promise<Response>;
}): Promise<void> {
  if (!VERSION_PATTERN.test(input.version))
    throw new SelfUpdateError("The running release has no valid version.");
  const env = input.env ?? process.env;
  const target = input.target ?? hostRuntimeTarget();
  const cached = await verifiedLauncherCache({
    env,
    version: input.version,
    target,
    ...(input.releaseRoot ? { releaseRoot: input.releaseRoot } : {}),
  });
  mkdirSync(input.prefix, { recursive: true, mode: 0o700 });
  const entries = readdirSync(input.prefix);
  const emptyReleases =
    entries.length === 1 &&
    entries[0] === "releases" &&
    lstatSync(join(input.prefix, "releases")).isDirectory() &&
    readdirSync(join(input.prefix, "releases")).length === 0;
  if (entries.length > 0 && !emptyReleases) {
    throw new SelfUpdateError(
      `${input.prefix} is not empty; it was not adopted as a managed installation.`,
    );
  }
  const work = mkdtempSync(join(input.prefix, ".service-install-"));
  try {
    const local = env.PORACODE_SERVER_TARBALL?.trim();
    const expected = env.PORACODE_SERVER_TARBALL_SHA256?.trim();
    let archive: string;
    if (cached) {
      archive = "";
    } else if (local || expected) {
      if (!local || !expected || !/^[a-f0-9]{64}$/u.test(expected)) {
        throw new SelfUpdateError(
          "PORACODE_SERVER_TARBALL and its lowercase SHA256 must be set together.",
        );
      }
      archive = join(work, "runtime.tar.gz");
      copyFileSync(local, archive);
      if ((await sha256OfFile(archive)) !== expected)
        throw new SelfUpdateError("Checksum mismatch for the local runtime archive.");
    } else {
      archive = await downloadVerifiedArchive({
        base: releaseDownloadBase(env),
        version: input.version,
        target,
        directory: work,
        ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
      });
    }
    const lock = acquireServerUpgradeLock({
      prefix: input.prefix,
      releaseId: `install-${input.version}`,
    });
    try {
      // Never replace an unknown, concurrent or interrupted installation.
      for (const name of ["current", "service-registration.json", "upgrade-journal.json"]) {
        try {
          lstatSync(join(input.prefix, name));
          throw new SelfUpdateError(
            `${input.prefix} already contains ${name}; inspect it before installing a service release.`,
          );
        } catch (error) {
          if (error instanceof SelfUpdateError) throw error;
          if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT"))
            throw error;
        }
      }
      const release = allocateReleaseDirectory(input.prefix, allocateUpgradeReleaseId());
      try {
        if (cached) {
          copyVerifiedRuntime(cached.root, release);
          if ((await sha256OfFile(join(release, "lib", "server.cjs"))) !== cached.entrySha256) {
            throw new SelfUpdateError(
              "The npm runtime changed while it was being copied; nothing was published.",
            );
          }
        } else
          installServerRelease({
            tarball: archive,
            releaseDir: release,
            destination: release,
            hostTarget: target,
          });
        const marker = readStandaloneRuntimeMarker(release);
        if (!marker || marker.version !== input.version || marker.target !== target) {
          throw new SelfUpdateError(
            "The verified archive does not match the running release and platform.",
          );
        }
        lock.assertHeld();
        // Unlike an update, bootstrap has no right to replace a concurrent link.
        writeDirectoryLink(join(input.prefix, "current"), release);
      } catch (error) {
        removeStagedReleaseDirectory(input.prefix, release);
        throw error;
      }
    } finally {
      lock.release();
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
