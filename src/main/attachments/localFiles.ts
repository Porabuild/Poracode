import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, normalize, resolve } from "node:path";
import { net, protocol } from "electron";
import type { ProjectLocation } from "@/shared/contracts";
import type { PoracodePaths } from "@/shared/poracodePaths";
import { resolveLocalFileUrlPath } from "@/shared/promptContent";
import { getProjectFsPath } from "@/shared/wsl";
import {
  getThreadAttachmentDir,
  sanitizeAttachmentPathPart,
} from "@/host/attachments/attachmentStorage";

async function writeUniqueAttachmentFile(
  directory: string,
  stem: string,
  extension: string,
  data: Uint8Array | string,
): Promise<string> {
  for (let attempt = 1; ; attempt += 1) {
    const suffix = attempt === 1 ? "" : ` (${attempt})`;
    const filePath = join(directory, `${stem}${suffix}${extension}`);
    try {
      await writeFile(filePath, data, { flag: "wx" });
      return filePath;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
}

/**
 * Orders every operation that touches one thread's attachment directory.
 *
 * Saves are async, so two writes racing into the same directory could otherwise
 * interleave their `mkdir`/`writeFile` turns and both claim the same target
 * name. Chaining each operation onto the previous one for the same resolved
 * directory serializes them. Operations on different thread directories never
 * wait on each other, and entries are dropped once their tail settles,
 * including after a failure (a rejection propagates to its own caller without
 * poisoning the chain). Directory deletion is not part of this queue: the
 * backend composition's reclaimer owns removal of a deleted thread's directory
 * from the committed DB seam, and a detached directory can only be resurrected
 * as an ordinary backlog orphan, never clobbering a live thread's files.
 */
const threadDirectoryTails = new Map<string, Promise<void>>();

async function withThreadDirectoryOrder<T>(
  directory: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = threadDirectoryTails.get(directory) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((finish) => {
    release = finish;
  });
  const tail = previous.catch(() => undefined).then(() => current);
  threadDirectoryTails.set(directory, tail);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (threadDirectoryTails.get(directory) === tail) {
      threadDirectoryTails.delete(directory);
    }
  }
}

export async function saveClipboardImageFile(
  paths: PoracodePaths,
  payload: { threadId: string; data: Uint8Array; extension: string },
): Promise<string> {
  const threadDir = getThreadAttachmentDir(paths, payload.threadId);
  return withThreadDirectoryOrder(threadDir, async () => {
    await mkdir(threadDir, { recursive: true });
    const namePrefix = sanitizeAttachmentPathPart(payload.threadId).slice(0, 8);
    const stem = `${namePrefix}-${Date.now()}`;
    return writeUniqueAttachmentFile(
      threadDir,
      stem,
      `.${payload.extension || "png"}`,
      payload.data,
    );
  });
}

/** Write raw image bytes to a user-chosen absolute path (download "Save as…"). */
export async function writeImageFile(filePath: string, data: Uint8Array): Promise<void> {
  await writeFile(filePath, data);
}

/** Read image bytes addressed by the desktop-only local-file protocol. */
export async function readLocalImageFile(url: string): Promise<Uint8Array> {
  if (!/^(?:poracode|lightcode)-local:\/\//.test(url)) {
    throw new Error("Unsupported local image URL");
  }
  const filePath = resolveLocalFileUrlPath(url);
  if (filePath.includes("\0")) {
    throw new Error("Invalid local image path");
  }
  return readFile(resolve(filePath));
}

/**
 * Persist a provider-handoff summary under the thread's attachment directory.
 *
 * The filename carries a timestamp because a thread can now switch provider in
 * place more than once: a fixed name would let a later handoff rewrite the file
 * an earlier user message still points at, so scrolling back would show context
 * that was never actually sent. Old summaries are removed with the rest of the
 * thread's attachments when the thread is deleted.
 */
export async function saveHandoffContextFile(
  paths: PoracodePaths,
  payload: { threadId: string; content: string },
): Promise<string> {
  const threadDir = getThreadAttachmentDir(paths, payload.threadId);
  return withThreadDirectoryOrder(threadDir, async () => {
    await mkdir(threadDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return writeUniqueAttachmentFile(threadDir, `handoff-context-${stamp}`, ".md", payload.content);
  });
}

export function resolveProjectFsPath(payload: {
  projectLocation: ProjectLocation;
  path?: string;
}): string {
  const rootPath = getProjectFsPath(payload.projectLocation);
  if (!payload.path) {
    return rootPath;
  }
  const resolved = normalize(join(rootPath, ...payload.path.split("/").filter(Boolean)));
  const normalizedRoot = normalize(rootPath);
  const sep = process.platform === "win32" ? "\\" : "/";
  const rootPrefix = normalizedRoot.endsWith(sep) ? normalizedRoot : normalizedRoot + sep;
  if (resolved !== normalizedRoot && !resolved.startsWith(rootPrefix)) {
    throw new Error("Path escapes the project root");
  }
  return resolved;
}

const LOCAL_FILE_PROTOCOL_SCHEMES = ["poracode-local", "lightcode-local"] as const;

export function registerLocalFileProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged(
    LOCAL_FILE_PROTOCOL_SCHEMES.map((scheme) => ({
      scheme,
      // `standard: true` is required so Chromium can load cached ACP registry
      // icons in CSS `mask-image` (ProviderIcon external glyphs). With
      // `standard: false` the scheme behaves like `file://` and mask sources
      // fail cross-origin from the renderer document.
      privileges: {
        standard: true,
        secure: true,
        corsEnabled: true,
        supportFetchAPI: true,
        stream: true,
      },
    })),
  );
}

export function installLocalFileProtocolHandler(): void {
  for (const scheme of LOCAL_FILE_PROTOCOL_SCHEMES) {
    protocol.handle(scheme, (request) => {
      const { pathToFileURL } = require("node:url") as typeof import("node:url");
      const filePath = resolveLocalFileUrlPath(request.url);
      if (filePath.includes("\0")) {
        return new Response("invalid path", { status: 400 });
      }
      const normalized = resolve(filePath);
      return net.fetch(pathToFileURL(normalized).href);
    });
  }
}
