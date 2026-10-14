import { useEffect, useRef, useState } from "react";
import { readBridge } from "@/renderer/bridge";
import { readManagedLoopbackImageSession } from "@/renderer/state/managedLoopbackImages";
import type { PromptSegment } from "@/shared/contracts";
import { resolveLocalImageDisplayUrl } from "@/shared/localImageDisplay";
import { fileNameFromPath, isImagePath, mimeForPath, toLocalFileUrl } from "@/shared/promptContent";

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
  /** Local preview whose durable host path is still being uploaded. Never serialized. */
  uploading?: boolean;
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

/**
 * Copy of an attachment that can outlive the live composer (draft saves,
 * submit-failure snapshots). `previewUrl` is an object URL owned by the live
 * hook instance and revoked when that composer clears or unmounts, so a
 * stashed copy must render from the durable `path` instead of the ephemeral
 * blob.
 */
export function storableAttachment(attachment: Attachment): Attachment {
  if (attachment.previewUrl === undefined) return attachment;
  const { previewUrl: _previewUrl, ...rest } = attachment;
  return rest;
}

export function storableAttachments(attachments: readonly Attachment[]): Attachment[] {
  return attachments.filter((attachment) => !attachment.uploading).map(storableAttachment);
}

/** Attachment records for already-saved files (picker results, drops, drafts). */
export function attachmentsFromPaths(paths: readonly string[]): Attachment[] {
  return paths.map((path): Attachment => {
    const name = fileNameFromPath(path);
    const mimeType = mimeForPath(name);
    return {
      id: crypto.randomUUID(),
      path,
      name,
      ...(mimeType ? { mimeType } : {}),
      isImage: isImagePath(name, mimeType),
    };
  });
}

export type SaveClipboardImage = (input: {
  threadId: string;
  data: Uint8Array;
  extension: string;
}) => Promise<string>;

export function useAttachments(options: { saveClipboardImage?: SaveClipboardImage } = {}) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const attachmentsRef = useRef<Attachment[]>([]);
  // Object URLs belong to this live composer. Track ownership separately from
  // React state so a pending paste can still be released if the component goes
  // away before its state update commits.
  const ownedPreviewUrlsRef = useRef(new Set<string>());
  const pasteGenerationRef = useRef(0);

  function updateAttachments(
    nextOrUpdater: Attachment[] | ((previous: Attachment[]) => Attachment[]),
  ) {
    const next =
      typeof nextOrUpdater === "function" ? nextOrUpdater(attachmentsRef.current) : nextOrUpdater;
    attachmentsRef.current = next;
    setAttachments(next);
  }

  function releasePreviewUrl(previewUrl: string) {
    if (!ownedPreviewUrlsRef.current.delete(previewUrl)) return;
    if (typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(previewUrl);
  }

  function releaseAllPreviewUrls() {
    for (const previewUrl of ownedPreviewUrlsRef.current) {
      releasePreviewUrl(previewUrl);
    }
  }

  useEffect(() => {
    // The set object itself is never reassigned (only mutated), so capturing
    // the reference still observes every URL owned at unmount time.
    const ownedPreviewUrls = ownedPreviewUrlsRef.current;
    return () => {
      pasteGenerationRef.current += 1;
      // jsdom (tests) has no object-URL support. Inlined (rather than calling
      // releaseAllPreviewUrls) so the cleanup reads refs only and takes no
      // dependencies.
      for (const previewUrl of ownedPreviewUrls) {
        if (!ownedPreviewUrls.delete(previewUrl)) continue;
        if (typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(previewUrl);
      }
    };
  }, []);

  function addFiles(paths: string[]) {
    const newAttachments = attachmentsFromPaths(paths);
    updateAttachments((prev) => [...prev, ...newAttachments]);
  }

  async function addClipboardImage(file: File, threadId: string) {
    const pasteGeneration = pasteGenerationRef.current;
    const ext = file.type.split("/")[1]?.replace("svg+xml", "svg") ?? "png";
    const id = crypto.randomUUID();
    const previewUrl = URL.createObjectURL(file);
    ownedPreviewUrlsRef.current.add(previewUrl);
    const usedNumbers = new Set(
      attachmentsRef.current
        .filter((a) => a.isImage && /^Image \d+\./.test(a.name))
        .map((a) => Number(a.name.match(/^Image (\d+)\./)?.[1])),
    );
    let n = 1;
    while (usedNumbers.has(n)) n++;
    updateAttachments((prev) => [
      ...prev,
      {
        id,
        path: "",
        name: `Image ${n}.${ext}`,
        mimeType: file.type,
        isImage: true,
        previewUrl,
        uploading: true,
      },
    ]);
    const imageSession = options.saveClipboardImage ? null : readManagedLoopbackImageSession();
    try {
      const buffer = await file.arrayBuffer();
      if (pasteGeneration !== pasteGenerationRef.current) return;
      const path = await (options.saveClipboardImage ?? readBridge().saveClipboardImage)({
        threadId,
        data: new Uint8Array(buffer),
        extension: ext,
      });
      if (pasteGeneration !== pasteGenerationRef.current) return;
      if (imageSession && readManagedLoopbackImageSession() === imageSession) {
        await imageSession.admitUploadedImage(path, {
          bytes: new Uint8Array(buffer),
          contentType: file.type,
        });
        if (pasteGeneration !== pasteGenerationRef.current) return;
      }
      updateAttachments((prev) => {
        if (pasteGeneration !== pasteGenerationRef.current) {
          releasePreviewUrl(previewUrl);
          return prev;
        }
        return prev.map((attachment) => {
          if (attachment.id !== id) return attachment;
          const { uploading: _uploading, ...ready } = attachment;
          return { ...ready, path };
        });
      });
    } catch (error) {
      if (pasteGeneration === pasteGenerationRef.current) {
        releasePreviewUrl(previewUrl);
        updateAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
      }
      throw error;
    }
  }

  function addPicked(input: {
    path: string;
    name: string;
    mimeType: string;
    selector: string;
    sourceUrl: string;
  }) {
    updateAttachments((prev) => [
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
    const removed = attachmentsRef.current.find((a) => a.id === id);
    if (removed?.previewUrl) releasePreviewUrl(removed.previewUrl);
    updateAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  function clearAll() {
    pasteGenerationRef.current += 1;
    releaseAllPreviewUrls();
    if (attachmentsRef.current.length > 0) updateAttachments([]);
  }

  function toSegments(): PromptSegment[] {
    return attachmentsRef.current
      .filter((a) => !a.uploading)
      .map((a) => ({
        kind: "attachment" as const,
        path: a.path,
        ...(a.mimeType ? { mimeType: a.mimeType } : {}),
      }));
  }

  function restore(saved: Attachment[]) {
    pasteGenerationRef.current += 1;
    releaseAllPreviewUrls();
    // A `previewUrl` arriving here points at an object URL owned by a previous
    // composer instance, which may already have revoked it — restored
    // attachments render from the durable `path` instead.
    updateAttachments(storableAttachments(saved));
  }

  /**
   * Take out the `remove` attachments and put back `add`, as undo and redo of
   * a restored draft do. Attachments added since then stay. `add` is a stored
   * copy, so it renders from the durable `path`.
   */
  function swap(remove: readonly Attachment[], add: readonly Attachment[]) {
    const removeIds = new Set(remove.map((attachment) => attachment.id));
    for (const attachment of attachmentsRef.current) {
      if (removeIds.has(attachment.id) && attachment.previewUrl) {
        releasePreviewUrl(attachment.previewUrl);
      }
    }
    updateAttachments((prev) => [
      ...prev.filter((attachment) => !removeIds.has(attachment.id)),
      ...storableAttachments(add),
    ]);
  }

  return {
    attachments,
    getAttachments: () => attachmentsRef.current.filter((attachment) => !attachment.uploading),
    isUploading: attachments.some((attachment) => attachment.uploading),
    hasPendingUploads: () => attachmentsRef.current.some((attachment) => attachment.uploading),
    addFiles,
    addClipboardImage,
    addPicked,
    removeAttachment,
    clearAll,
    toSegments,
    restore,
    swap,
  };
}
