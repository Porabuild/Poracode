import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative } from "node:path";
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
  const linuxDir = `${home}/.poracode/attachments`;
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

/** A segment that carries a filesystem path eligible for copy/rewrite. */
function isRewritableFileSegment(
  segment: PromptSegment,
): segment is Extract<PromptSegment, { kind: "attachment" | "file" }> {
  return (segment.kind === "attachment" || segment.kind === "file") && Boolean(segment.path);
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
    if (!isRewritableFileSegment(segment)) {
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

const WORKSPACE_ATTACHMENT_DIR = ".poracode";
const WORKSPACE_ATTACHMENT_SUBDIR = "attachments";

function isInsideDir(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * Copies any attachment/file segment that lives outside `projectDir` into
 * `<projectDir>/.poracode/attachments` and rewrites its path there. Some agents
 * (e.g. Command Code) sandbox file reads to their working directory, so a
 * picker screenshot in `~/.poracode/attachments` is otherwise unreadable. The
 * copied files self-ignore via a `.poracode/.gitignore` so they never show up
 * in `git status`. Paths already inside the workspace are left untouched.
 */
export async function rewriteSegmentsForWorkspace(
  segments: PromptSegment[],
  projectDir: string,
): Promise<PromptSegment[]> {
  const attachmentsDir = join(projectDir, WORKSPACE_ATTACHMENT_DIR, WORKSPACE_ATTACHMENT_SUBDIR);
  let prepared = false;
  const rewritten: PromptSegment[] = [];
  for (const segment of segments) {
    if (!isRewritableFileSegment(segment)) {
      rewritten.push(segment);
      continue;
    }
    if (!isAbsolute(segment.path) || isInsideDir(segment.path, projectDir)) {
      rewritten.push(segment);
      continue;
    }
    try {
      if (!prepared) {
        await mkdir(attachmentsDir, { recursive: true });
        const gitignorePath = join(projectDir, WORKSPACE_ATTACHMENT_DIR, ".gitignore");
        if (!existsSync(gitignorePath)) {
          await writeFile(gitignorePath, "*\n");
        }
        prepared = true;
      }
      const dest = join(attachmentsDir, basename(segment.path));
      await copyFile(segment.path, dest);
      rewritten.push({ ...segment, path: dest });
    } catch (error) {
      console.warn(
        `[workspace-attach] failed to copy ${segment.path} -> ${attachmentsDir}:`,
        error,
      );
      rewritten.push(segment);
    }
  }
  return rewritten;
}
