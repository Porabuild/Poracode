import { spawn } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, posix, relative, resolve, win32 } from "node:path";
import { canonicalHostPath, resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { resolvePoracodeBaseDir } from "@/shared/poracodePaths";
import { readStandaloneRuntimeMarker } from "../../scripts/server-release-install.mjs";
import {
  defaultCliBinDirectory,
  defaultCliStorageRoot,
} from "../../packages/poracode-cli/lib/installPaths.mjs";
import { promptCli } from "./cliPrompts";
import { runServerService } from "./serverService";
import { refusePendingCliInstallMigration } from "./cliInstallMigrationJournal";
import { acquireServerUpgradeLock, type ServerUpgradeLock } from "./serverUpgradeLock";
import {
  readServiceRegistration,
  ServerServiceRefusedError,
  type ServerServiceRegistration,
} from "./serverServiceRegistration";
import {
  defaultProbeOwner,
  removeTuiCachesForVersions,
  resolveInstallerPrefix,
  SelfUpdateError,
} from "./installerPrefix";

/**
 * `poracode uninstall` for installs made by the one-line installers
 * (`website/public/install.sh`, `install.ps1`): removes the managed background
 * service registered for the prefix (its owner is stopped first), the
 * prefix's command link/shim, the TUI download caches of the versions it
 * installed, and the prefix itself — but never profile data, PATH entries it
 * did not create, or anything while another server for the profile runs.
 */
const INSTALLER_SHIM_MARKER = "rem poracode-installer-shim v1";
const INSTALLER_SHIM_LAUNCHER = /^"([^"\r\n]+)" %\*\s*$/mu;
const POSIX_LAUNCHER_SUFFIX = "/current/bin/poracode";
const WINDOWS_LAUNCHER_SUFFIX = "\\current\\bin\\poracode.cmd";
const MANAGED_PREFIX_ENTRIES = new Set([
  "current",
  "releases",
  "service-registration.json",
  "service-definition-v1.json",
  "service-launcher-v1.exe",
  "upgrade-journal.json",
  "upgrade.lock",
  "legacy-install-migration.json",
  ".legacy-migration",
]);

function refuseUnownedPrefixEntries(prefix: string): void {
  const unknown = readdirSync(prefix).filter((name) => !MANAGED_PREFIX_ENTRIES.has(name));
  if (unknown.length) {
    throw new SelfUpdateError(
      `The install prefix contains files not owned by the installer (${unknown.join(", ")}); move them before uninstalling.`,
    );
  }
}

/**
 * True when a command entry's launcher is `<prefix>/current/bin/poracode[.cmd]`
 * — the only target the installers write. The recorded target keeps the prefix
 * spelling the installer was given, which can cross a symlink or junction
 * (macOS `/tmp`, a symlinked home, a Windows junction), while `prefix` here is
 * canonical. After the exact match fails, both sides are realpath'ed without
 * following `current`, so a link aimed straight at `releases/<v>/bin/poracode`
 * or at a different prefix's alias stays unowned.
 */
export function launcherTargetsPrefix(
  launcher: string,
  prefix: string,
  platform: NodeJS.Platform,
): boolean {
  if (platform === "win32") {
    const expected = win32.join(prefix, "current", "bin", "poracode.cmd");
    if (launcher.toLowerCase() === expected.toLowerCase()) return true;
    if (!win32.isAbsolute(launcher) || !launcher.toLowerCase().endsWith(WINDOWS_LAUNCHER_SUFFIX)) {
      return false;
    }
    try {
      const written = launcher.slice(0, launcher.length - WINDOWS_LAUNCHER_SUFFIX.length);
      return realpathSync(written).toLowerCase() === realpathSync(prefix).toLowerCase();
    } catch {
      return false;
    }
  }
  const expected = posix.join(prefix, "current", "bin", "poracode");
  if (launcher === expected) return true;
  if (!posix.isAbsolute(launcher) || !launcher.endsWith(POSIX_LAUNCHER_SUFFIX)) return false;
  try {
    const written = launcher.slice(0, launcher.length - POSIX_LAUNCHER_SUFFIX.length);
    return realpathSync(written) === realpathSync(prefix);
  } catch {
    return false;
  }
}

/**
 * True when a `poracode.cmd` shim's text was written by the installer for
 * `prefix`: it carries the shim marker and either names the prefix literally
 * or launches `<prefix>\current\bin\poracode.cmd` through a junctioned spelling.
 */
export function installerShimTargetsPrefix(text: string, prefix: string, binDir?: string): boolean {
  if (!text.includes(INSTALLER_SHIM_MARKER)) return false;
  if (text.toLowerCase().includes(prefix.toLowerCase())) return true;
  const launcher = INSTALLER_SHIM_LAUNCHER.exec(text)?.[1];
  if (launcher && binDir && launcher.toLowerCase().startsWith("%~dp0")) {
    return launcherTargetsPrefix(win32.resolve(binDir, launcher.slice(5)), prefix, "win32");
  }
  return launcher !== undefined && launcherTargetsPrefix(launcher, prefix, "win32");
}

export interface UninstallCliOptions {
  readonly prefix?: string;
  readonly binDir?: string;
  readonly yes: boolean;
  readonly json: boolean;
}

/** Remove only command entries the installers created for this prefix. */
export function removeOwnedCommandLinks(input: {
  readonly prefix: string;
  readonly binDir?: string;
  readonly platform?: NodeJS.Platform;
  readonly env?: NodeJS.ProcessEnv;
  readonly home?: string;
}): string[] {
  const platform = input.platform ?? process.platform;
  const env = input.env ?? process.env;
  const removed: string[] = [];
  // The installers honor PORACODE_BIN_DIR; so does the uninstall.
  const binDir =
    input.binDir ??
    defaultCliBinDirectory({ env, platform, ...(input.home ? { home: input.home } : {}) });
  if (platform === "win32") {
    const shim = win32.join(binDir, "poracode.cmd");
    if (
      existsSync(shim) &&
      installerShimTargetsPrefix(readFileSync(shim, "utf8"), input.prefix, binDir)
    ) {
      unlinkSync(shim);
      removed.push(shim);
    }
    return removed;
  }
  const link = join(binDir, "poracode");
  try {
    if (
      lstatSync(link).isSymbolicLink() &&
      launcherTargetsPrefix(readlinkSync(link), input.prefix, platform)
    ) {
      unlinkSync(link);
      removed.push(link);
    }
  } catch {
    // No command entry to remove.
  }
  return removed;
}

/**
 * The TUI download cache keeps one entry per app version
 * (`<cache>/poracode/tui/<version>`). Uninstall drops the entries for every
 * release this prefix installed; versions come from each release's standalone
 * marker, so unrelated versions and unreadable or foreign entries stay.
 */
function removeInstalledTuiCaches(
  prefix: string,
  deps: {
    readonly env: NodeJS.ProcessEnv;
    readonly platform: NodeJS.Platform;
    readonly home: string;
  },
): string[] {
  const versions = new Set<string>();
  const releases = join(prefix, "releases");
  try {
    for (const name of readdirSync(releases)) {
      if (name.startsWith(".")) continue;
      const dir = join(releases, name);
      try {
        if (!lstatSync(dir).isDirectory()) continue;
        const version = readStandaloneRuntimeMarker(dir)?.version;
        if (version !== undefined) versions.add(version);
      } catch {
        // Foreign or unreadable release: no attributable cache entry.
      }
    }
  } catch {
    // No releases directory to inspect.
  }
  return removeTuiCachesForVersions(versions, deps);
}

/**
 * `cmd /s /c` command that removes `prefix` once nothing holds it: up to 30
 * attempts a second apart. `timeout /t` is unusable here because it exits at
 * once without a console stdin; `ping` is the stock delay. `rmdir /s` removes
 * the `current` junction without following it.
 */
export function windowsDeferredRemovalCommand(prefix: string): {
  readonly file: string;
  readonly args: readonly string[];
} {
  if (/["%^&|<>]/u.test(prefix)) {
    throw new SelfUpdateError(`Refusing to schedule removal of an unusual path: ${prefix}`);
  }
  const loop =
    `for /l %n in (1,1,30) do (rmdir /s /q "${prefix}" 2>nul & ` +
    `if not exist "${prefix}" exit /b 0 & ping -n 2 127.0.0.1 >nul)`;
  return { file: "cmd.exe", args: ["/d", "/s", "/c", `"${loop}"`] };
}

export interface SelfUninstallResult {
  readonly ok: true;
  readonly prefix: string;
  readonly removedService: string | null;
  readonly removedCommands: readonly string[];
  readonly removedCaches: readonly string[];
  readonly prefixRemoval: "removed" | "scheduled";
  readonly keptProfile: string;
}

export async function runSelfUninstall(
  options: UninstallCliOptions,
  deps: {
    readonly releaseRoot: string;
    readonly probeOwner?: () => Promise<unknown>;
    readonly confirm?: (question: string) => Promise<string>;
    readonly interactive?: boolean;
    readonly platform?: NodeJS.Platform;
    readonly env?: NodeJS.ProcessEnv;
    readonly home?: string;
    readonly profile?: string;
    readonly readRegistration?: (prefix: string) => ServerServiceRegistration | null;
    readonly removeService?: (
      profileNamespace: string,
      prefix: string,
      lock: ServerUpgradeLock,
    ) => Promise<unknown>;
  },
): Promise<SelfUninstallResult> {
  const install = resolveInstallerPrefix({
    ...(options.prefix !== undefined ? { explicitPrefix: options.prefix } : {}),
    releaseRoot: deps.releaseRoot,
  });
  refusePendingCliInstallMigration(install.prefix);
  const env = deps.env ?? process.env;
  const platform = deps.platform ?? process.platform;
  const storageRoot = defaultCliStorageRoot({
    env,
    platform,
    ...(deps.home ? { home: deps.home } : {}),
  });
  const cacheRoot = env.PORACODE_RUNTIME_CACHE_DIR?.trim()
    ? resolve(env.PORACODE_RUNTIME_CACHE_DIR.trim())
    : platform === "win32"
      ? win32.join(storageRoot, "runtime-cache")
      : join(storageRoot, "runtime-cache");
  if (existsSync(cacheRoot)) {
    const fromPrefix = relative(canonicalHostPath(install.prefix), canonicalHostPath(cacheRoot));
    if (
      !fromPrefix ||
      (!isAbsolute(fromPrefix) &&
        fromPrefix !== ".." &&
        !fromPrefix.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`))
    ) {
      throw new SelfUpdateError(
        `The shared runtime cache ${cacheRoot} is inside ${install.prefix}; move the cache or select a different prefix before uninstalling.`,
      );
    }
  }
  const probeOwner = deps.probeOwner ?? defaultProbeOwner;
  const profile =
    deps.profile ?? (process.env.PORACODE_BASE_DIR?.trim() || resolvePoracodeBaseDir());
  const readRegistration = deps.readRegistration ?? readServiceRegistration;
  const removeService =
    deps.removeService ??
    ((profileNamespace: string, prefix: string, lock: ServerUpgradeLock) =>
      runServerService(
        profileNamespace,
        {
          action: "uninstall",
          prefix,
          recover: false,
          json: false,
        },
        { existingLock: lock },
      ));
  // Safety preflight, run before the prompt and again after the confirmation:
  // an unusable or unfinished registration, or a server this uninstall may not
  // stop, refuses before anything is removed.
  const preflight = async (): Promise<ServerServiceRegistration | null> => {
    refuseUnownedPrefixEntries(install.prefix);
    let registration: ServerServiceRegistration | null;
    try {
      registration = readRegistration(install.prefix);
    } catch (error) {
      if (error instanceof ServerServiceRefusedError)
        throw new SelfUpdateError(`${error.message} Nothing was removed.`);
      throw error;
    }
    if (registration !== null && registration.state !== "installed") {
      throw new SelfUpdateError(
        `The background service for ${install.prefix} was not fully ${registration.state === "prepared" ? "installed" : "removed"}. ` +
          `Inspect it with poracode service status --prefix ${install.prefix}, finish with ` +
          `poracode service uninstall --prefix ${install.prefix} --recover, then run uninstall again. ` +
          "Nothing was removed.",
      );
    }
    if ((await probeOwner()) !== null) {
      // The registered service's own owner is expected to run; stopRegisteredOwner
      // still refuses before any effect for a foreign or desktop owner. Any other
      // running server for this profile blocks the uninstall.
      let managedProfile = false;
      try {
        managedProfile =
          registration?.profileNamespace === resolveHostRootPaths(profile).profileNamespace;
      } catch {
        // An unresolvable profile namespace can never match the registration.
      }
      if (!managedProfile) {
        throw new SelfUpdateError(
          "A Poracode server is running for this profile; stop it with poracode stop first.",
        );
      }
    }
    return registration;
  };
  let registration = await preflight();
  if (!options.yes) {
    const interactive =
      deps.interactive ?? (process.stdin.isTTY === true && process.stderr.isTTY === true);
    if (!interactive || options.json) {
      throw new SelfUpdateError("Pass --yes to uninstall from a script.");
    }
    const answer = await (deps.confirm ?? ((question: string) => promptCli(question)))(
      registration !== null
        ? `Remove Poracode and its background service from ${install.prefix}? Profile data is kept. Type "uninstall" to confirm: `
        : `Remove Poracode from ${install.prefix}? Profile data is kept. Type "uninstall" to confirm: `,
    );
    if (answer.trim() !== "uninstall")
      throw new SelfUpdateError("Uninstall cancelled; nothing was removed.");
    // A long confirmation leaves a window for a service or owner to appear.
    registration = await preflight();
  }
  const lock = acquireServerUpgradeLock({
    prefix: install.prefix,
    releaseId: basename(install.currentDir),
  });
  try {
    refusePendingCliInstallMigration(install.prefix);
    if (realpathSync(join(install.prefix, "current")) !== install.currentDir) {
      throw new SelfUpdateError(
        "The selected release changed before uninstall acquired its lock; retry.",
      );
    }
    registration = await preflight();
    let removedService: string | null = null;
    if (registration !== null) {
      try {
        await removeService(registration.profileNamespace, install.prefix, lock);
      } catch (error) {
        if (error instanceof ServerServiceRefusedError)
          throw new SelfUpdateError(
            `Could not remove the background service: ${error.message} Nothing else was removed.`,
          );
        throw error;
      }
      removedService = registration.registrationId;
    }
    // The service's owner should be gone now; anything still running keeps the
    // prefix (and the command link) in place.
    if ((await probeOwner()) !== null) {
      throw new SelfUpdateError(
        registration !== null
          ? "Removed the background service, but a Poracode server still runs for this profile; stop it with poracode stop, then run uninstall again."
          : "A Poracode server is running for this profile; stop it with poracode stop first.",
      );
    }
    refuseUnownedPrefixEntries(install.prefix);
    lock.assertHeld();
    const removedCommands = removeOwnedCommandLinks({
      prefix: install.prefix,
      ...(options.binDir !== undefined ? { binDir: options.binDir } : {}),
      platform,
      ...(deps.env ? { env: deps.env } : {}),
      ...(deps.home ? { home: deps.home } : {}),
    });
    const removedCaches = removeInstalledTuiCaches(install.prefix, {
      env: deps.env ?? process.env,
      platform,
      home: deps.home ?? homedir(),
    });
    let prefixRemoval: "removed" | "scheduled" = "removed";
    if (platform === "win32") {
      // This process runs the prefix's own node.exe, which Windows keeps locked;
      // a detached shell retries the removal until this CLI has exited.
      const command = windowsDeferredRemovalCommand(install.prefix);
      const child = spawn(command.file, command.args, {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        windowsVerbatimArguments: true,
      });
      child.unref();
      prefixRemoval = "scheduled";
    } else {
      rmSync(install.prefix, { recursive: true, force: true });
    }
    return {
      ok: true,
      prefix: install.prefix,
      removedService,
      removedCommands,
      removedCaches,
      prefixRemoval,
      keptProfile: profile,
    };
  } finally {
    lock.release();
  }
}

export async function runSelfUninstallCli(
  options: UninstallCliOptions,
  releaseRoot: string,
): Promise<void> {
  const result = await runSelfUninstall(options, { releaseRoot });
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (result.removedService !== null)
    process.stdout.write(`Removed the background service ${result.removedService}\n`);
  for (const command of result.removedCommands) process.stdout.write(`Removed ${command}\n`);
  for (const cache of result.removedCaches)
    process.stdout.write(`Removed the terminal UI cache ${cache}\n`);
  process.stdout.write(
    result.prefixRemoval === "removed"
      ? `Removed ${result.prefix}\n`
      : `${result.prefix} is removed once this command exits.\n`,
  );
  process.stdout.write(
    `Kept your profile data (${result.keptProfile} and its .host-v1 sibling) and any PATH entries.\n`,
  );
}
