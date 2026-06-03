import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { PromptSegment, ProjectLocation } from "@/shared/contracts";
import { isSafeSshHost } from "@/shared/ssh";
import { getWslCommand, resolveWslHomeDirectory } from "../agents/base";
import { quotePosixShellArg } from "../agents/base/shellBasics";
import { spawnSync } from "node:child_process";

const wslAttachmentDirCache = new Map<string, { uncDir: string; linuxDir: string }>();
const sshAttachmentDirCache = new Map<string, string>();

function resolveWslAttachmentDirs(distro: string): { uncDir: string; linuxDir: string } {
  const cached = wslAttachmentDirCache.get(distro);
  if (cached) {
    return cached;
  }

  const homeDir = resolveWslHomeDirectory(distro);
  const linuxDir = homeDir ? `${homeDir}/.lightcode/attachments` : undefined;
  if (!linuxDir) {
    throw new Error(`Unable to resolve home for WSL distro "${distro}"`);
  }

  spawnSync(getWslCommand(), ["-d", distro, "--", "mkdir", "-p", linuxDir], { timeout: 5000 });
  const uncDir = `\\\\wsl.localhost\\${distro}${linuxDir.replace(/\//g, "\\")}`;
  const entry = { uncDir, linuxDir };
  wslAttachmentDirCache.set(distro, entry);
  return entry;
}

function resolveSshAttachmentDir(location: Extract<ProjectLocation, { kind: "ssh" }>): string {
  const cached = sshAttachmentDirCache.get(location.host);
  if (cached) {
    return cached;
  }
  if (!isSafeSshHost(location.host)) {
    throw new Error("Invalid SSH host.");
  }
  const result = spawnSync(
    "ssh",
    [
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=10",
      "-T",
      location.host,
      "sh",
      "-lc",
      'mkdir -p "$HOME/.lightcode/attachments" && printf %s "$HOME/.lightcode/attachments"',
    ],
    { encoding: "utf8", timeout: 5000, windowsHide: true },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || "Unable to prepare SSH attachments directory.");
  }
  const remoteDir = result.stdout.trim();
  sshAttachmentDirCache.set(location.host, remoteDir);
  return remoteDir;
}

function copyFileToSsh(
  location: Extract<ProjectLocation, { kind: "ssh" }>,
  sourcePath: string,
  remotePath: string,
): boolean {
  const payload = readFileSync(sourcePath).toString("base64");
  const result = spawnSync(
    "ssh",
    [
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=10",
      "-T",
      location.host,
      "sh",
      "-lc",
      `base64 -d > ${quotePosixShellArg(remotePath)}`,
    ],
    { input: payload, encoding: "utf8", timeout: 15_000, windowsHide: true },
  );
  return result.status === 0;
}

function isImageAttachmentSegment(segment: PromptSegment): boolean {
  if (segment.kind !== "attachment") {
    return false;
  }
  return (
    segment.mimeType?.startsWith("image/") === true ||
    /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(segment.path)
  );
}

export function rewriteSegmentsForWsl(
  segments: PromptSegment[],
  location: ProjectLocation,
  options?: { preserveImageAttachments?: boolean },
): PromptSegment[] {
  if (location.kind !== "wsl" && location.kind !== "ssh") {
    return segments;
  }

  let dirs: { uncDir: string; linuxDir: string } | undefined;
  let sshDir: string | undefined;
  return segments.map((segment) => {
    if ((segment.kind !== "attachment" && segment.kind !== "file") || !segment.path) {
      return segment;
    }
    if (options?.preserveImageAttachments && isImageAttachmentSegment(segment)) {
      return segment;
    }

    if (location.kind === "ssh") {
      // Copy any file that exists on THIS machine to the remote. The local host
      // may be Windows (drive paths) or macOS/Linux (POSIX paths), so we can't
      // gate on a Windows-drive shape here; an already-remote path simply won't
      // exist locally and is left untouched.
      if (!existsSync(segment.path)) {
        return segment;
      }
      sshDir ??= resolveSshAttachmentDir(location);
      const fileName = basename(segment.path);
      const destination = `${sshDir}/${fileName}`;
      try {
        return copyFileToSsh(location, segment.path, destination)
          ? { ...segment, path: destination }
          : segment;
      } catch (error) {
        console.warn(`[ssh-attach] failed to copy ${segment.path} -> ${destination}:`, error);
        return segment;
      }
    }

    // WSL runs only on Windows, so local attachments are always drive paths;
    // anything else is already a WSL/UNC path that must not be rewritten.
    if (!/^[A-Za-z]:[\\/]/.test(segment.path)) {
      return segment;
    }

    dirs ??= resolveWslAttachmentDirs(location.distro);
    mkdirSync(dirs.uncDir, { recursive: true });

    const fileName = basename(segment.path);
    const destination = join(dirs.uncDir, fileName);
    try {
      copyFileSync(segment.path, destination);
    } catch (error) {
      console.warn(`[wsl-attach] failed to copy ${segment.path} -> ${destination}:`, error);
      return segment;
    }
    return { ...segment, path: `${dirs.linuxDir}/${fileName}` };
  });
}
