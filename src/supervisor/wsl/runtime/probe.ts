import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseNodeMajor } from "../../runtime/pinnedNode";
import { batchWslCommandsAsync, getWslCommand } from "../../agents/base";

const execFileAsync = promisify(execFile);

export type LinuxArch = "x64" | "arm64";

export interface NodeProbeOptions {
  useBridge?: boolean;
  signal?: AbortSignal;
}

/**
 * Run `command -v node && node --version` through the user's login shell.
 * Login shells source `.bashrc`/`.zshrc` which load nvm/fnm, so this
 * surfaces the user's nvm-default node even when /bin/sh's PATH wouldn't
 * find it. Returns null when no node is found.
 */
export async function probeUserNode(
  distro: string,
  options?: NodeProbeOptions,
): Promise<{ nodePath: string; version: string } | null> {
  const commands = ["command -v node", "node --version 2>/dev/null"];
  const [pathResult, versionResult] =
    options?.useBridge === false
      ? await batchWslCommandsForBootstrap(distro, commands, options?.signal)
      : await batchWslCommandsAsync(distro, commands);

  const nodePath = (pathResult?.stdout ?? "").trim();
  const versionRaw = (versionResult?.stdout ?? "").trim();
  if (!nodePath || !nodePath.startsWith("/")) return null;
  if (!versionRaw.startsWith("v")) return null;
  const version = versionRaw.slice(1).split(/\s/)[0] ?? "";
  if (!parseNodeMajor(version)) return null;
  return { nodePath, version };
}

export async function probeDistroArch(
  distro: string,
  useBridge: boolean,
  signal?: AbortSignal,
): Promise<LinuxArch | null> {
  const [archResult] =
    useBridge === false
      ? await batchWslCommandsForBootstrap(distro, ["uname -m"], signal)
      : await batchWslCommandsAsync(distro, ["uname -m"]);
  const out = (archResult?.stdout ?? "").trim();
  if (out === "x86_64" || out === "amd64") return "x64";
  if (out === "aarch64" || out === "arm64") return "arm64";
  return null;
}

export async function batchWslCommandsForBootstrap(
  distro: string,
  commands: string[],
  signal?: AbortSignal,
): Promise<{ ok: boolean; stdout: string }[]> {
  const sep = "---PORACODE_BOOTSTRAP_BATCH_SEP---";
  const script = commands.map((cmd) => `(${cmd}) 2>/dev/null; printf '\\n${sep}\\n'`).join("\n");
  try {
    const { stdout } = await execFileAsync(
      getWslCommand(),
      ["-d", distro, "--", "/bin/bash", "-l", "-i", "-c", script],
      {
        encoding: "utf8",
        windowsHide: true,
        timeout: 15_000,
        ...(signal ? { signal } : {}),
      },
    );
    const parts = stdout.split(sep);
    return commands.map((_, index) => {
      const raw = (parts[index] ?? "").trim();
      return { ok: raw.length > 0, stdout: raw };
    });
  } catch {
    return commands.map(() => ({ ok: false, stdout: "" }));
  }
}

export async function resolveWslHomeDirectoryForBootstrap(
  distro: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(
      getWslCommand(),
      ["-d", distro, "--", "sh", "-lc", 'printf %s "$HOME"'],
      {
        encoding: "utf8",
        windowsHide: true,
        timeout: 5_000,
        ...(signal ? { signal } : {}),
      },
    );
    const home = (stdout ?? "")
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .findLast((line) => line.length > 0);
    return home;
  } catch {
    return undefined;
  }
}
