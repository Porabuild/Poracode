import { useState } from "react";
import { readBridge } from "@/renderer/bridge";
import type { PromptSegment } from "@/shared/contracts";
import { resolveLocalImageDisplayUrl } from "@/shared/localImageDisplay";
import { fileNameFromPath, isImagePath, toLocalFileUrl } from "@/shared/promptContent";

export interface Attachment {
  id: string;
  path: string;
  name: string;
  mimeType?: string;
  isImage: boolean;
  /** Optional CSS selector when this attachment was produced by the browser element picker. */
  selector?: string;
  /** Optional source page URL for picker attachments. */
  sourceUrl?: string;
  /**
   * Object URL of the pasted bytes. `path` may live on a remote desktop (the
   * paste is uploaded there), so composer previews render from this local copy
   * instead of fetching the saved file back.
   */
  previewUrl?: string;
}

/**
 * Renderable URL for an image attachment. Prefers the local pasted bytes
 * (`previewUrl`), then a caller-supplied remote resolver (the paired desktop's
 * image endpoint when `path` lives on another machine), then the local-file
 * protocol.
 */
export function attachmentImageUrl(
  attachment: Pick<Attachment, "path" | "previewUrl">,
  imageUrlForPath?: (path: string) => string,
): string {
  return (
    attachment.previewUrl ??
    imageUrlForPath?.(attachment.path) ??
    resolveLocalImageDisplayUrl(toLocalFileUrl(attachment.path))
  );
}

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

export type SaveClipboardImage = (input: {
  threadId: string;
  data: Uint8Array;
  extension: string;
}) => Promise<string>;

export function useAttachments(options: { saveClipboardImage?: SaveClipboardImage } = {}) {
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
        isImage: isImagePath(name, mimeType),
      };
    });
    setAttachments((prev) => [...prev, ...newAttachments]);
  }

  async function addClipboardImage(file: File, threadId: string) {
    const buffer = await file.arrayBuffer();
    const ext = file.type.split("/")[1]?.replace("svg+xml", "svg") ?? "png";
    const path = await (options.saveClipboardImage ?? readBridge().saveClipboardImage)({
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
          previewUrl: URL.createObjectURL(file),
        },
      ];
    });
  }

  function addPicked(input: {
    path: string;
    name: string;
    mimeType: string;
    selector: string;
    sourceUrl: string;
  }) {
    setAttachments((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        path: input.path,
        name: input.name,
        mimeType: input.mimeType,
        isImage: isImagePath(input.name, input.mimeType),
        selector: input.selector,
        sourceUrl: input.sourceUrl,
      },
    ]);
  }

  function removeAttachment(id: string) {
    const removed = attachments.find((a) => a.id === id);
    if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  function clearAll() {
    for (const a of attachments) {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    }
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

  return {
    attachments,
    addFiles,
    addClipboardImage,
    addPicked,
    removeAttachment,
    clearAll,
    toSegments,
    restore,
  };
}
