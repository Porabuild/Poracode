import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { delimiter, join, win32 } from "node:path";
import { readStandaloneRuntimeMarker } from "../../scripts/server-release-install.mjs";
import { defaultInstallerPrefix, resolveInstallerPrefix } from "./installerPrefix";
import { installServiceRelease } from "./cliServiceInstall";
import { installerShimTargetsPrefix, launcherTargetsPrefix } from "./cliSelfUninstall";
import { defaultCliBinDirectory } from "../../packages/poracode-cli/lib/installPaths.mjs";
import { compareCliReleaseVersions } from "./cliReleaseVersion";

/** Install a command without replacing entries owned by another installation. */
export async function installCliCommand(input: {
  readonly releaseRoot: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly home?: string;
  readonly platform?: NodeJS.Platform;
  readonly installRelease?: typeof installServiceRelease;
}): Promise<{
  readonly command: string;
  readonly pathNeedsUpdate: boolean;
  readonly version: string;
}> {
  const env = input.env ?? process.env;
  const home = input.home ?? homedir();
  const platform = input.platform ?? process.platform;
  const prefix = defaultInstallerPrefix({ env, home, platform });
  const binDir = defaultCliBinDirectory({ env, home, platform });
  const command =
    platform === "win32" ? win32.join(binDir, "poracode.cmd") : join(binDir, "poracode");
  try {
    const stat = lstatSync(command);
    const owned =
      platform === "win32"
        ? stat.isFile() && installerShimTargetsPrefix(readFileSync(command, "utf8"), prefix, binDir)
        : stat.isSymbolicLink() && launcherTargetsPrefix(readlinkSync(command), prefix, platform);
    if (!owned)
      throw new Error(`${command} already belongs to another installation; it was not replaced.`);
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT"))
      throw error;
  }
  const version = readStandaloneRuntimeMarker(input.releaseRoot)?.version;
  if (!version) throw new Error("This CLI has no published standalone runtime to install.");
  if (!existsSync(join(prefix, "current"))) {
    await (input.installRelease ?? installServiceRelease)({
      prefix,
      version,
      releaseRoot: input.releaseRoot,
      env,
    });
  }
  const install = resolveInstallerPrefix({
    explicitPrefix: prefix,
    releaseRoot: input.releaseRoot,
  });
  const order = compareCliReleaseVersions(install.currentVersion, version);
  if (order === undefined || order < 0) {
    throw new Error(
      `The shared installation is older than this CLI. Run ${join(prefix, "current", "bin", "poracode")} update before installing the command.`,
    );
  }
  const launcher =
    platform === "win32"
      ? win32.join(prefix, "current", "bin", "poracode.cmd")
      : join(prefix, "current", "bin", "poracode");
  mkdirSync(binDir, { recursive: true });
  if (platform === "win32") {
    // The batch file contains only ASCII; %~dp0 carries a Unicode home path
    // through cmd.exe without relying on the active legacy code page.
    const relativeLauncher = win32.relative(binDir, launcher);
    if (
      !relativeLauncher ||
      win32.isAbsolute(relativeLauncher) ||
      /[^\x20-\x7e]|["%]/u.test(relativeLauncher)
    )
      throw new Error(
        "The custom install path cannot be represented safely in a Windows command shim.",
      );
    const shimLauncher = `%~dp0${relativeLauncher}`;
    try {
      writeFileSync(
        command,
        `@echo off\r\nsetlocal DisableDelayedExpansion\r\nrem poracode-installer-shim v1\r\n"${shimLauncher}" %*\r\n`,
        { flag: "wx" },
      );
    } catch (error) {
      if (
        !(error && typeof error === "object" && "code" in error && error.code === "EEXIST") ||
        !installerShimTargetsPrefix(readFileSync(command, "utf8"), install.prefix, binDir)
      )
        throw error;
    }
  } else {
    try {
      symlinkSync(launcher, command);
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST"))
        throw error;
      let owned = false;
      try {
        owned = launcherTargetsPrefix(readlinkSync(command), install.prefix, platform);
      } catch {
        /* foreign entry */
      }
      if (!owned)
        throw new Error(
          `${command} already belongs to another installation; it was not replaced.`,
          { cause: error },
        );
    }
  }
  const pathEntries = (env.PATH ?? "").split(platform === "win32" ? ";" : delimiter);
  return {
    command,
    version: install.currentVersion,
    pathNeedsUpdate: !pathEntries.some((entry) =>
      platform === "win32" ? entry.toLowerCase() === binDir.toLowerCase() : entry === binDir,
    ),
  };
}
