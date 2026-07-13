import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import { net, protocol } from "electron";
import type { ProjectLocation } from "@/shared/contracts";
import type { PoracodePaths } from "@/shared/poracodePaths";
import { getProjectFsPath } from "@/shared/wsl";

function sanitizeAttachmentPathPart(value: string): string {
  return value.replace(/[<>:"/\\|?*]/g, "-");
}

function getThreadAttachmentDir(paths: PoracodePaths, threadId: string): string {
  return join(paths.attachmentsDir, sanitizeAttachmentPathPart(threadId).slice(0, 12));
}

export function saveClipboardImageFile(
  paths: PoracodePaths,
  payload: { threadId: string; data: Uint8Array; extension: string },
): string {
  const threadDir = getThreadAttachmentDir(paths, payload.threadId);
  mkdirSync(threadDir, { recursive: true });
  const namePrefix = sanitizeAttachmentPathPart(payload.threadId).slice(0, 8);
  const fileName = `${namePrefix}-${Date.now()}.${payload.extension || "png"}`;
  const filePath = join(threadDir, fileName);
  writeFileSync(filePath, Buffer.from(payload.data));
  return filePath;
}

/** Write raw image bytes to a user-chosen absolute path (download "Save as…"). */
export function writeImageFile(filePath: string, data: Uint8Array): void {
  writeFileSync(filePath, Buffer.from(data));
}

export function saveHandoffContextFile(
  paths: PoracodePaths,
  payload: { threadId: string; content: string },
): string {
  const threadDir = getThreadAttachmentDir(paths, payload.threadId);
  mkdirSync(threadDir, { recursive: true });
  const filePath = join(threadDir, "handoff-context.md");
  writeFileSync(filePath, payload.content, "utf-8");
  return filePath;
}

export function deleteThreadAttachments(paths: PoracodePaths, threadId: string): void {
  rmSync(getThreadAttachmentDir(paths, threadId), { recursive: true, force: true });
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
      const raw = decodeURIComponent(new URL(request.url).pathname);
      const { pathToFileURL } = require("node:url") as typeof import("node:url");
      const filePath =
        process.platform === "win32" && /^\/[A-Za-z]:/.test(raw) ? raw.slice(1) : raw;
      if (filePath.includes("\0")) {
        return new Response("invalid path", { status: 400 });
      }
      const normalized = resolve(filePath);
      return net.fetch(pathToFileURL(normalized).href);
    });
  }
}
