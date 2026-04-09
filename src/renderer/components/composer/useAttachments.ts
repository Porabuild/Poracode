import { useState } from "react";
import { readBridge } from "../../bridge";
import type { PromptSegment } from "../../../shared/contracts";

/**
 * Convert an absolute filesystem path to a lightcode-local:// URL
 * that the custom protocol handler in main can resolve.
 * Windows backslashes are normalized to forward slashes.
 */
export function toLocalFileUrl(absolutePath: string): string {
  const normalized = absolutePath.replaceAll("\\", "/");
  return `lightcode-local:///${normalized}`;
}

export interface Attachment {
  id: string;
  path: string;
  name: string;
  mimeType?: string;
  isImage: boolean;
}

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "avif",
]);

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  avif: "image/avif",
  pdf: "application/pdf",
  txt: "text/plain",
  json: "application/json",
  md: "text/markdown",
};

function getExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function inferMimeType(name: string): string | undefined {
  return MIME_BY_EXT[getExtension(name)];
}

function isImageExtension(name: string): boolean {
  return IMAGE_EXTENSIONS.has(getExtension(name));
}

export function fileNameFromPath(path: string): string {
  const sep = path.lastIndexOf("/");
  const bsep = path.lastIndexOf("\\");
  const lastSep = Math.max(sep, bsep);
  return lastSep >= 0 ? path.slice(lastSep + 1) : path;
}

export function useAttachments() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  function addFiles(paths: string[]) {
    const newAttachments = paths.map((path): Attachment => {
      const name = fileNameFromPath(path);
      const mimeType = inferMimeType(name);
      return {
        id: crypto.randomUUID(),
        path,
        name,
        ...(mimeType ? { mimeType } : {}),
        isImage: isImageExtension(name),
      };
    });
    setAttachments((prev) => [...prev, ...newAttachments]);
  }

  async function addClipboardImage(file: File, threadId: string) {
    const buffer = await file.arrayBuffer();
    const ext = file.type.split("/")[1]?.replace("svg+xml", "svg") ?? "png";
    const path = await readBridge().saveClipboardImage({
      threadId,
      data: new Uint8Array(buffer),
      extension: ext,
    });
    setAttachments((prev) => {
      // Find the next available image number (fills gaps from removals)
      const usedNumbers = new Set(
        prev
          .filter((a) => a.isImage && /^Image \d+\./.test(a.name))
          .map((a) => Number(a.name.match(/^Image (\d+)\./)?.[1])),
      );
      let n = 1;
      while (usedNumbers.has(n)) n++;
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          path,
          name: `Image ${n}.${ext}`,
          mimeType: file.type,
          isImage: true,
        },
      ];
    });
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  function clearAll() {
    setAttachments([]);
  }

  function toSegments(): PromptSegment[] {
    return attachments.map((a) => ({
      kind: "attachment" as const,
      path: a.path,
      ...(a.mimeType ? { mimeType: a.mimeType } : {}),
    }));
  }

  function restore(saved: Attachment[]) {
    setAttachments(saved);
  }

  return { attachments, addFiles, addClipboardImage, removeAttachment, clearAll, toSegments, restore };
}
