import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { PromptSegment, ProjectLocation } from "@/shared/contracts";
import type { WslBridgeClient, WslLocation } from "../wsl/bridge/client";

const wslAttachmentDirCache = new Map<string, { home: string; linuxDir: string }>();
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
  if (location.kind !== "wsl") {
    return segments;
  }

  const client = wslAttachmentBridgeClient;
  if (!client) return segments;

  let dirs: { home: string; linuxDir: string } | undefined;
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
