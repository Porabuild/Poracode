import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { net, protocol } from "electron";
import type { ProjectLocation } from "@/shared/contracts";
import type { LightcodePaths } from "@/shared/lightcodePaths";
import { getProjectFsPath } from "@/shared/wsl";

function sanitizeAttachmentPathPart(value: string): string {
  return value.replace(/[<>:"/\\|?*]/g, "-");
}

function getThreadAttachmentDir(paths: LightcodePaths, threadId: string): string {
  return join(paths.attachmentsDir, sanitizeAttachmentPathPart(threadId).slice(0, 12));
}

export function saveClipboardImageFile(
  paths: LightcodePaths,
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
  paths: LightcodePaths,
  payload: { threadId: string; content: string },
): string {
  const threadDir = getThreadAttachmentDir(paths, payload.threadId);
  mkdirSync(threadDir, { recursive: true });
  const filePath = join(threadDir, "handoff-context.md");
  writeFileSync(filePath, payload.content, "utf-8");
  return filePath;
}

export function deleteThreadAttachments(paths: LightcodePaths, threadId: string): void {
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
  return join(rootPath, ...payload.path.split("/").filter(Boolean));
}

export function registerLocalFileProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "lightcode-local",
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
    },
  ]);
}

export function installLocalFileProtocolHandler(): void {
  protocol.handle("lightcode-local", (request) => {
    const raw = decodeURIComponent(new URL(request.url).pathname);
    const { pathToFileURL } = require("node:url") as typeof import("node:url");
    const filePath = process.platform === "win32" && /^\/[A-Za-z]:/.test(raw) ? raw.slice(1) : raw;
    return net.fetch(pathToFileURL(filePath).href);
  });
}
