import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
} from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { defaultCliStorageRoot } from "../../packages/poracode-cli/lib/installPaths.mjs";
import { readStandaloneRuntimeMarker } from "../../scripts/server-release-install.mjs";
import { readInstalledServiceRelease, readServiceRegistration } from "./serverServiceRegistration";
import { acquireServerUpgradeLock, type ServerUpgradeLock } from "./serverUpgradeLock";

/** lsof's exit 1 with no output means there are no open files under the tree. */
function noOpenFiles(directory: string): boolean {
  try {
    const output = execFileSync("lsof", ["-t", "+D", directory], {
      encoding: "utf8",
      timeout: 10_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return output.trim() === "";
  } catch (error) {
    return (
      !!error &&
      typeof error === "object" &&
      "status" in error &&
      error.status === 1 &&
      "stdout" in error &&
      String(error.stdout).trim() === "" &&
      "stderr" in error &&
      String(error.stderr).trim() === ""
    );
  }
}

function contains(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`));
}

/** Move old tooling out of the profile only when no process or service still needs its path. */
export function relocateLegacyTooling(input: {
  readonly home: string;
  readonly prefix: string;
  readonly env: NodeJS.ProcessEnv;
  readonly isIdle?: (directory: string) => boolean;
  readonly readRegistration?: typeof readServiceRegistration;
}): { readonly moved: readonly string[]; readonly retained: readonly string[] } {
  const storage = defaultCliStorageRoot({ env: input.env, home: input.home });
  const legacy = join(input.home, ".poracode");
  const oldServer = join(legacy, "server");
  const oldRuntime = join(legacy, "runtime");
  const registration = (input.readRegistration ?? readServiceRegistration)(input.prefix);
  const moved: string[] = [];
  const retained: string[] = [];
  const idle = input.isIdle ?? noOpenFiles;
  for (const [source, name] of [
    [oldServer, "server"],
    [oldRuntime, "runtime"],
  ] as const) {
    if (!existsSync(source)) continue;
    const stat = lstatSync(source);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      retained.push(source);
      continue;
    }
    if (registration?.configPath && contains(realpathSync(source), registration.configPath)) {
      retained.push(source);
      continue;
    }
    let sourceLock: ServerUpgradeLock | undefined;
    if (name === "server") {
      let known = false;
      try {
        const selected = readInstalledServiceRelease(source);
        known = !!readStandaloneRuntimeMarker(selected.releaseDir);
        if (known)
          sourceLock = acquireServerUpgradeLock({
            prefix: selected.prefix,
            releaseId: selected.releaseId,
          });
      } catch {
        /* preserve foreign data */
        known = false;
      }
      let oldRegistration = null;
      try {
        oldRegistration = readServiceRegistration(source);
      } catch {
        known = false;
      }
      if (!known || oldRegistration) {
        sourceLock?.release();
        retained.push(source);
        continue;
      }
    } else {
      // Do not reclassify an unrelated directory merely because it is named runtime.
      const versions = readdirSync(source);
      if (
        !versions.length ||
        !versions.every((version) => {
          try {
            const versionDir = join(source, version);
            if (!lstatSync(versionDir).isDirectory()) return false;
            const targets = readdirSync(versionDir);
            return (
              targets.length > 0 &&
              targets.every((target) => {
                const dir = join(versionDir, target);
                const markerPath = join(dir, ".poracode-runtime.json");
                const markerStat = lstatSync(markerPath);
                if (!markerStat.isFile() || markerStat.size > 16_384) return false;
                const marker: unknown = JSON.parse(readFileSync(markerPath, "utf8"));
                const runtime = readStandaloneRuntimeMarker(dir);
                return (
                  lstatSync(dir).isDirectory() &&
                  !!marker &&
                  typeof marker === "object" &&
                  "formatVersion" in marker &&
                  marker.formatVersion === 1 &&
                  "version" in marker &&
                  marker.version === version &&
                  "target" in marker &&
                  marker.target === target &&
                  "tarballSha256" in marker &&
                  typeof marker.tarballSha256 === "string" &&
                  /^[a-f0-9]{64}$/u.test(marker.tarballSha256) &&
                  "entrySha256" in marker &&
                  typeof marker.entrySha256 === "string" &&
                  /^[a-f0-9]{64}$/u.test(marker.entrySha256) &&
                  runtime?.version === version &&
                  runtime.target === target
                );
              })
            );
          } catch {
            return false;
          }
        })
      ) {
        retained.push(source);
        continue;
      }
    }
    const destination = join(storage, "legacy", name);
    if (existsSync(destination) || !idle(source)) {
      sourceLock?.release();
      retained.push(source);
      continue;
    }
    try {
      mkdirSync(join(storage, "legacy"), { recursive: true, mode: 0o700 });
      sourceLock?.assertHeld();
      renameSync(source, destination);
      // If a process entered during the move, restore its old path when free.
      if (!idle(destination) && !existsSync(source)) {
        renameSync(destination, source);
        retained.push(source);
      } else {
        moved.push(destination);
      }
    } catch {
      retained.push(source);
    } finally {
      sourceLock?.release();
    }
  }
  return { moved, retained };
}
