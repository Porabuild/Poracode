import { resolvePoracodeBaseDir } from "@/shared/poracodePaths";
import { canonicalHostPath } from "@/backend/ownership/hostRootPaths";
import { defaultInstallerPrefix } from "./installerPrefix";
import { readLegacyServiceProfile, readPreMigrationNightlyProfile } from "./cliLegacyProfile";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { isNightlyRelease } from "./cliReleaseVersion";

/**
 * Standalone nightly releases must not implicitly open a stable desktop's
 * profile. Explicit namespaces, including those saved in existing service
 * definitions, keep their old meaning across an upgrade.
 */
export function defaultCliProfileNamespace(
  version: string,
  env: NodeJS.ProcessEnv = process.env,
  home?: string,
): string {
  const explicit = env.PORACODE_BASE_DIR?.trim();
  if (explicit) return explicit;
  if (isNightlyRelease(version)) {
    const effectiveHome = home ?? homedir();
    const prefix = defaultInstallerPrefix({ env, home: effectiveHome });
    const stable = canonicalHostPath(resolvePoracodeBaseDir("stable", effectiveHome));
    const previous =
      readLegacyServiceProfile(prefix) ??
      readPreMigrationNightlyProfile(prefix, stable) ??
      (process.platform !== "win32" && !env.PORACODE_INSTALL_DIR?.trim()
        ? readPreMigrationNightlyProfile(join(effectiveHome, ".poracode", "server"), stable)
        : undefined);
    if (previous) return previous;
    return resolvePoracodeBaseDir("nightly", home);
  }
  return resolvePoracodeBaseDir(undefined, home);
}

export function legacyProfileNotice(
  version: string,
  selected: string,
  home = homedir(),
): string | undefined {
  if (!isNightlyRelease(version)) return undefined;
  const stable = resolvePoracodeBaseDir("stable", home);
  const nightly = resolvePoracodeBaseDir("nightly", home);
  if (canonicalHostPath(selected) === canonicalHostPath(stable)) {
    return `The existing nightly service still uses ${stable}. To use a separate nightly profile, pass --base-dir ${nightly} with a separate service prefix.`;
  }
  if (
    canonicalHostPath(selected) !== canonicalHostPath(nightly) ||
    existsSync(`${nightly}.host-v1`)
  )
    return undefined;
  if (!existsSync(`${stable}.host-v1`) && !existsSync(join(stable, "state.sqlite")))
    return undefined;
  return `An existing profile is available at ${stable}. Nightly now uses ${nightly}; to use the existing profile explicitly, pass --base-dir ${stable}.`;
}
