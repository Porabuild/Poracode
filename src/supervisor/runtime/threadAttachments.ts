import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { PromptSegment, ProjectLocation } from "@/shared/contracts";
import { isSafeSshHost } from "@/shared/ssh";
import { quotePosixShellArg } from "../agents/base/shellBasics";
import type { WslBridgeClient, WslLocation } from "../wsl/bridge/client";

const wslAttachmentDirCache = new Map<string, { home: string; linuxDir: string }>();
const sshAttachmentDirCache = new Map<string, string>();
let wslAttachmentBridgeClient: WslBridgeClient | undefined;

export function setWslAttachmentBridgeClient(client: WslBridgeClient | undefined): void {
  wslAttachmentBridgeClient = client;
}

function attachmentLocation(
  distro: string,
  linuxDir: string,
): Extract<ProjectLocation, { kind: "wsl" }> {
  return {
    kind: "wsl",
    distro,
    linuxPath: linuxDir,
    uncPath: `\\\\wsl.localhost\\${distro}\\`,
  };
}

async function resolveWslAttachmentDirs(
  client: WslBridgeClient,
  distro: string,
): Promise<{ home: string; linuxDir: string }> {
  const cached = wslAttachmentDirCache.get(distro);
  if (cached) {
    return cached;
  }

  const rootLocation: WslLocation = {
    kind: "wsl",
    distro,
    linuxPath: "/",
    uncPath: `\\\\wsl.localhost\\${distro}\\`,
  };
  const { home } = await client.home(rootLocation);
  const linuxDir = `${home}/.lightcode/attachments`;
  const location = attachmentLocation(distro, linuxDir);
  await client.mkdir(location, linuxDir, { recursive: true });

  const entry = { home, linuxDir };
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

export async function rewriteSegmentsForWsl(
  segments: PromptSegment[],
  location: ProjectLocation,
  options?: { preserveImageAttachments?: boolean },
): Promise<PromptSegment[]> {
  if (location.kind !== "wsl" && location.kind !== "ssh") {
    return segments;
  }

  const client = wslAttachmentBridgeClient;
  if (location.kind === "wsl" && !client) return segments;

  let dirs: { home: string; linuxDir: string } | undefined;
  let sshDir: string | undefined;
  const rewritten: PromptSegment[] = [];
  for (const segment of segments) {
    if ((segment.kind !== "attachment" && segment.kind !== "file") || !segment.path) {
      rewritten.push(segment);
      continue;
    }
    if (options?.preserveImageAttachments && isImageAttachmentSegment(segment)) {
      rewritten.push(segment);
      continue;
    }

    if (location.kind === "ssh") {
      // Copy any file that exists on THIS machine to the remote. The local host
      // may be Windows (drive paths) or macOS/Linux (POSIX paths), so we can't
      // gate on a Windows-drive shape here; an already-remote path simply won't
      // exist locally and is left untouched.
      if (!existsSync(segment.path)) {
        rewritten.push(segment);
        continue;
      }
      sshDir ??= resolveSshAttachmentDir(location);
      const fileName = basename(segment.path);
      const destination = `${sshDir}/${fileName}`;
      try {
        rewritten.push(
          copyFileToSsh(location, segment.path, destination)
            ? { ...segment, path: destination }
            : segment,
        );
      } catch (error) {
        console.warn(`[ssh-attach] failed to copy ${segment.path} -> ${destination}:`, error);
        rewritten.push(segment);
      }
      continue;
    }

    if (!client) {
      rewritten.push(segment);
      continue;
    }

    // WSL runs only on Windows, so local attachments are always drive paths;
    // anything else is already a WSL/UNC path that must not be rewritten.
    if (!/^[A-Za-z]:[\\/]/.test(segment.path)) {
      rewritten.push(segment);
      continue;
    }

    dirs ??= await resolveWslAttachmentDirs(client, location.distro);
    const fileName = basename(segment.path);
    const linuxPath = `${dirs.linuxDir}/${fileName}`;
    const bridgeLocation = attachmentLocation(location.distro, dirs.linuxDir);
    try {
      const content = await readFile(segment.path);
      await client.rm(bridgeLocation, linuxPath, { force: true });
      await client.writeNewFile(bridgeLocation, linuxPath, content);
    } catch (error) {
      console.warn(`[wsl-attach] failed to copy ${segment.path} -> ${linuxPath}:`, error);
      rewritten.push(segment);
      continue;
    }
    rewritten.push({ ...segment, path: linuxPath });
  }
  return rewritten;
}
