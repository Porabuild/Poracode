import { spawn } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, win32 } from "node:path";
import { resolvePoracodeBaseDir } from "@/shared/poracodePaths";
import { readStandaloneRuntimeMarker } from "../../scripts/server-release-install.mjs";
import { promptCli } from "./cliPrompts";
import { SERVER_SERVICE_REGISTRATION_FILE } from "./serverServiceRegistration";
import {
  defaultProbeOwner,
  removeTuiCachesForVersions,
  resolveInstallerPrefix,
  SelfUpdateError,
} from "./installerPrefix";

/**
 * `poracode uninstall` for installs made by the one-line installers
 * (`website/public/install.sh`, `install.ps1`): removes the prefix's command
 * link/shim, the TUI download caches of the versions it installed, and the
 * prefix itself — but never profile data, PATH entries it did not create, or
 * anything while a server or managed service still uses the prefix.
 */
const INSTALLER_SHIM_MARKER = "rem poracode-installer-shim v1";

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
  const binDir = input.binDir ?? (env.PORACODE_BIN_DIR?.trim() || undefined);
  if (platform === "win32") {
    const localAppData =
      env.LOCALAPPDATA?.trim() || win32.join(input.home ?? homedir(), "AppData", "Local");
    const shim = win32.join(binDir ?? win32.join(localAppData, "Poracode", "bin"), "poracode.cmd");
    if (existsSync(shim)) {
      const text = readFileSync(shim, "utf8");
      if (
        text.includes(INSTALLER_SHIM_MARKER) &&
        text.toLowerCase().includes(input.prefix.toLowerCase())
      ) {
        unlinkSync(shim);
        removed.push(shim);
      }
    }
    return removed;
  }
  const link = join(binDir ?? join(input.home ?? homedir(), ".local", "bin"), "poracode");
  try {
    if (
      lstatSync(link).isSymbolicLink() &&
      readlinkSync(link) === join(input.prefix, "current", "bin", "poracode")
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
  },
): Promise<SelfUninstallResult> {
  const install = resolveInstallerPrefix({
    ...(options.prefix !== undefined ? { explicitPrefix: options.prefix } : {}),
    releaseRoot: deps.releaseRoot,
  });
  const probeOwner = deps.probeOwner ?? defaultProbeOwner;
  const assertUnused = async (): Promise<void> => {
    if (existsSync(join(install.prefix, SERVER_SERVICE_REGISTRATION_FILE))) {
      throw new SelfUpdateError(
        `A managed service uses ${install.prefix}; run poracode service uninstall --prefix ${install.prefix} first.`,
      );
    }
    if ((await probeOwner()) !== null) {
      throw new SelfUpdateError(
        "A Poracode server is running for this profile; stop it with poracode stop first.",
      );
    }
  };
  await assertUnused();
  if (!options.yes) {
    const interactive =
      deps.interactive ?? (process.stdin.isTTY === true && process.stderr.isTTY === true);
    if (!interactive || options.json) {
      throw new SelfUpdateError("Pass --yes to uninstall from a script.");
    }
    const answer = await (deps.confirm ?? ((question: string) => promptCli(question)))(
      `Remove Poracode from ${install.prefix}? Profile data is kept. Type "uninstall" to confirm: `,
    );
    if (answer.trim() !== "uninstall")
      throw new SelfUpdateError("Uninstall cancelled; nothing was removed.");
    // A long confirmation leaves a window for a service or owner to appear.
    await assertUnused();
  }
  const platform = deps.platform ?? process.platform;
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
    removedCommands,
    removedCaches,
    prefixRemoval,
    keptProfile: process.env.PORACODE_BASE_DIR?.trim() || resolvePoracodeBaseDir(),
  };
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
