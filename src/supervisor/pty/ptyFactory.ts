import { existsSync, lstatSync } from "node:fs";
import { dirname, join, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node-pty";
import { readPtyJobOwnerArtifact } from "@/shared/ptyJobOwnerArtifact";
import { resolveWslHelpersDir } from "../wsl/wslDeploy";
import type { TerminalPtyFactory } from "./managedPty";
import { WindowsPty } from "./windowsPty";

/** Trusted composition paths; never read from a provider config or public request. */
interface PtyAssets {
  bundleDirectory?: string;
  resourcesDirectory?: string;
}

export function createSupervisorPtyFactory(assets: PtyAssets = {}): TerminalPtyFactory {
  return (command, args, options, location, controlled) => {
    if (!controlled || process.platform !== "win32") return spawn(command, args, options);
    if (location.kind === "wsl" || /^(?:wsl|wsl\.exe)$/iu.test(win32.basename(command)))
      throw new Error(
        "Controlled WSL terminal execution cannot yet confirm Linux-child retirement. Use a terminal client in the selected distro, or explicitly select a native provider profile.",
      );
    if (location.kind !== "windows" || !["x64", "arm64"].includes(process.arch))
      throw new Error(
        "Controlled Windows terminal execution requires a native Windows project and an x64 or arm64 runtime.",
      );
    const helpers = resolveWslHelpersDir();
    const resources = assets.resourcesDirectory ?? (helpers ? dirname(helpers) : undefined);
    if (!resources)
      throw new Error(
        "Windows PTY owner resources are not configured. Rebuild or reinstall the selected runtime.",
      );
    let owner: ReturnType<typeof readPtyJobOwnerArtifact>;
    try {
      owner = readPtyJobOwnerArtifact(
        join(resources, "pty-job-owner"),
        process.arch === "arm64" ? "win32-arm64" : "win32-x64",
      );
    } catch (cause) {
      throw new Error(
        "The selected runtime's Windows PTY owner is unavailable or incompatible. Rebuild or reinstall that runtime; no provider was started.",
        { cause },
      );
    }
    const directory =
      assets.bundleDirectory ??
      (typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url)));
    const brokerPath = join(
      directory.replace(/([\\/])app\.asar([\\/])/u, "$1app.asar.unpacked$2"),
      "ptyBroker.cjs",
    );
    if (!existsSync(brokerPath) || !lstatSync(brokerPath).isFile())
      throw new Error(
        "The selected runtime's PTY broker is missing. Rebuild or reinstall that runtime.",
      );
    return new WindowsPty(command, args, options, { helperPath: owner.path, brokerPath });
  };
}
