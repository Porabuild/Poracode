import { readDraftAsset } from "@/renderer/state/composerDrafts/readDraftAsset";
import { clientDraftPersistenceError } from "@/renderer/state/composerDrafts/persistenceError";
import { useEffect, useRef, useState } from "react";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import type { PromptSegment } from "@/shared/contracts";
import { resolveLocalImageDisplayUrl } from "@/shared/localImageDisplay";
import { fileNameFromPath, isImagePath, mimeForPath, toLocalFileUrl } from "@/shared/promptContent";
import {
  isClientDraftAsset,
  stageClientDraftAsset,
  retainClientDraftAsset,
  queueClientDraftAssetReclamation,
} from "@/renderer/state/composerDrafts/clientDraftDatabase";

export interface Attachment {
  id: string;
  path: string;
  name: string;
  mimeType?: string;
  isImage: boolean;
  /** The original authority of a legacy host-held path; independent of destination selection. */
  source?: { remoteServerId?: string | undefined; path?: string | undefined };
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
    (isClientDraftAsset(attachment.path) ? "" : imageUrlForPath?.(attachment.path)) ??
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
  if (attachment.previewUrl === undefined && attachment.uploading === undefined) return attachment;
  const { previewUrl: _previewUrl, uploading: _uploading, ...rest } = attachment;
  return rest;
}

export function storableAttachments(attachments: readonly Attachment[]): Attachment[] {
  return attachments
    .filter((attachment) => !attachment.uploading || isClientDraftAsset(attachment.path))
    .map(storableAttachment);
}

/** Attachment records for already-saved files (picker results, drops, drafts). */
export function attachmentsFromPaths(paths: readonly string[]): Attachment[] {
  return paths.map((path): Attachment => {
    const name = isClientDraftAsset(path)
      ? decodeURIComponent(fileNameFromPath(path))
      : fileNameFromPath(path);
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

export function useAttachments(
  options: {
    source?: Attachment["source"];
    /** Checkpoint immediately, including an attachment added just before navigation. */
    onDraftChange?: () => void;
  } = {},
) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const attachmentsRef = useRef<Attachment[]>([]);
  const assetLeasesRef = useRef(new Map<string, () => void>());
  // Object URLs belong to this live composer. Track ownership separately from
  // React state so a pending paste can still be released if the component goes
  // away before its state update commits.
  const ownedPreviewUrlsRef = useRef(new Set<string>());
  const pasteGenerationRef = useRef(0);
  const pendingUploadsRef = useRef(new Map<string, { ready: Promise<void>; retire(): void }>());

  function retireUpload(id: string) {
    pendingUploadsRef.current.get(id)?.retire();
    pendingUploadsRef.current.delete(id);
  }

  function retireAllUploads() {
    for (const id of pendingUploadsRef.current.keys()) retireUpload(id);
  }

  function updateAttachments(
    nextOrUpdater: Attachment[] | ((previous: Attachment[]) => Attachment[]),
  ) {
    const next =
      typeof nextOrUpdater === "function" ? nextOrUpdater(attachmentsRef.current) : nextOrUpdater;
    const retainedPaths = new Set(
      next
        .filter((attachment) => isClientDraftAsset(attachment.path))
        .map((attachment) => attachment.path),
    );
    for (const [path, release] of assetLeasesRef.current)
      if (!retainedPaths.has(path)) {
        release();
        queueClientDraftAssetReclamation([path]);
        assetLeasesRef.current.delete(path);
      }
    for (const path of retainedPaths)
      if (!assetLeasesRef.current.has(path))
        assetLeasesRef.current.set(path, retainClientDraftAsset(path));
    attachmentsRef.current = next;
    setAttachments(next);
    options.onDraftChange?.();
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
    const pendingUploads = pendingUploadsRef.current;
    const assetLeases = assetLeasesRef.current;
    return () => {
      for (const release of assetLeases.values()) release();
      assetLeases.clear();
      pasteGenerationRef.current += 1;
      for (const upload of pendingUploads.values()) upload.retire();
      pendingUploads.clear();
      // jsdom (tests) has no object-URL support. Inlined (rather than calling
      // releaseAllPreviewUrls) so the cleanup reads refs only and takes no
      // dependencies.
      for (const previewUrl of ownedPreviewUrls) {
        if (!ownedPreviewUrls.delete(previewUrl)) continue;
        if (typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(previewUrl);
      }
    };
  }, []);

  function trackImport(id: string, upload: Promise<void>) {
    let retire!: () => void;
    const retired = new Promise<void>((resolve) => {
      retire = resolve;
    });
    const ready = Promise.race([upload, retired]);
    pendingUploadsRef.current.set(id, { ready, retire });
    void ready.then(
      () => pendingUploadsRef.current.delete(id),
      () => pendingUploadsRef.current.delete(id),
    );
    return upload;
  }

  function addFiles(paths: string[]) {
    const generation = pasteGenerationRef.current;
    const newAttachments = attachmentsFromPaths(paths).map((attachment): Attachment => {
      if (isClientDraftAsset(attachment.path)) return attachment;
      const source = options.source ?? {};
      if (
        source.remoteServerId ||
        isRemoteSession() ||
        typeof readBridge()?.readClientDraftFile !== "function"
      )
        return { ...attachment, source };
      const originalPath = attachment.path;
      const mimeType = attachment.mimeType ?? "application/octet-stream";
      const imported = stageClientDraftAsset(async () => {
        const data = await readBridge().readClientDraftFile({ url: toLocalFileUrl(originalPath) });
        return new Blob([Uint8Array.from(data)], { type: mimeType });
      }, attachment.name);
      void trackImport(
        attachment.id,
        imported.saved.then(() => {
          if (pasteGenerationRef.current !== generation) return;
          updateAttachments((previous) =>
            previous.map((item) => {
              if (item.id !== attachment.id) return item;
              const { uploading: _uploading, previewUrl: _previewUrl, ...ready } = item;
              return ready;
            }),
          );
          hydrateClientPreviews(attachmentsRef.current);
        }),
      ).catch((error: unknown) => {
        if (pasteGenerationRef.current === generation)
          updateAttachments((previous) =>
            previous.map((item) => {
              if (item.id !== attachment.id) return item;
              const { uploading: _uploading, ...ready } = item;
              // Keep the reserved client reference and original native path;
              // readDraftAsset can retry the bounded import on explicit Send.
              return ready;
            }),
          );
        console.error("[poracode] failed to import selected draft file", error);
      });
      return {
        ...attachment,
        path: imported.path,
        source: { ...source, path: originalPath },
        uploading: true,
        ...(attachment.isImage
          ? { previewUrl: resolveLocalImageDisplayUrl(toLocalFileUrl(originalPath)) }
          : {}),
      };
    });
    updateAttachments((prev) => [...prev, ...newAttachments]);
    hydrateClientPreviews(newAttachments);
  }

  function addClipboardImage(file: File) {
    const id = crypto.randomUUID();
    return trackImport(id, uploadClipboardImage(file, id));
  }

  async function waitForUploads() {
    while (pendingUploadsRef.current.size > 0) {
      await Promise.all([...pendingUploadsRef.current.values()].map((upload) => upload.ready));
    }
  }

  async function uploadClipboardImage(file: File, id: string) {
    const pasteGeneration = pasteGenerationRef.current;
    const ext = file.type.split("/")[1]?.replace("svg+xml", "svg") ?? "png";
    const previewUrl = URL.createObjectURL(file);
    ownedPreviewUrlsRef.current.add(previewUrl);
    const usedNumbers = new Set(
      attachmentsRef.current
        .filter((a) => a.isImage && /^Image \d+\./.test(a.name))
        .map((a) => Number(a.name.match(/^Image (\d+)\./)?.[1])),
    );
    let n = 1;
    while (usedNumbers.has(n)) n++;
    const name = `Image ${n}.${ext}`;
    const local = stageClientDraftAsset(file, name);
    updateAttachments((prev) => [
      ...prev,
      {
        id,
        path: local.path,
        name,
        mimeType: file.type,
        isImage: true,
        previewUrl,
        uploading: true,
      },
    ]);
    try {
      await local.saved;
      if (pasteGeneration !== pasteGenerationRef.current) return;
      updateAttachments((previous) =>
        previous.map((attachment) => {
          if (attachment.id !== id) return attachment;
          const { uploading: _uploading, ...ready } = attachment;
          return ready;
        }),
      );
    } catch (error) {
      if (pasteGeneration === pasteGenerationRef.current) {
        // Preserve the preview and reserved path for a controlled retry.
        updateAttachments((previous) =>
          previous.map((attachment) => {
            if (attachment.id !== id) return attachment;
            const { uploading: _uploading, ...ready } = attachment;
            return ready;
          }),
        );
      }
      throw clientDraftPersistenceError(error);
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
        ...(options.source && !isClientDraftAsset(input.path) ? { source: options.source } : {}),
        selector: input.selector,
        sourceUrl: input.sourceUrl,
      },
    ]);
    hydrateClientPreviews(attachmentsRef.current);
  }

  function removeAttachment(id: string) {
    retireUpload(id);
    const removed = attachmentsRef.current.find((a) => a.id === id);
    if (removed?.previewUrl) releasePreviewUrl(removed.previewUrl);
    updateAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  function clearAll() {
    retireAllUploads();
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
    retireAllUploads();
    pasteGenerationRef.current += 1;
    releaseAllPreviewUrls();
    // A `previewUrl` arriving here points at an object URL owned by a previous
    // composer instance, which may already have revoked it — restored
    // attachments render from the durable `path` instead.
    updateAttachments(storableAttachments(saved));
    hydrateClientPreviews(storableAttachments(saved));
  }

  function hydrateClientPreviews(items: readonly Attachment[]) {
    const generation = pasteGenerationRef.current;
    for (const item of items) {
      if (!item.isImage || !isClientDraftAsset(item.path) || item.previewUrl) continue;
      void readDraftAsset(item)
        .then(({ blob }) => {
          if (
            generation !== pasteGenerationRef.current ||
            !attachmentsRef.current.some(
              (attachment) => attachment.id === item.id && !attachment.previewUrl,
            )
          )
            return;
          const previewUrl = URL.createObjectURL(blob);
          ownedPreviewUrlsRef.current.add(previewUrl);
          updateAttachments((previous) =>
            previous.map((attachment) =>
              attachment.id === item.id ? { ...attachment, previewUrl } : attachment,
            ),
          );
        })
        .catch((error: unknown) =>
          console.error("[poracode] failed to restore draft attachment", error),
        );
    }
  }

  /**
   * Take out the `remove` attachments and put back `add`, as undo and redo of
   * a restored draft do. Attachments added since then stay. `add` is a stored
   * copy, so it renders from the durable `path`.
   */
  function swap(remove: readonly Attachment[], add: readonly Attachment[]) {
    const removeIds = new Set(remove.map((attachment) => attachment.id));
    for (const id of removeIds) retireUpload(id);
    for (const attachment of attachmentsRef.current) {
      if (removeIds.has(attachment.id) && attachment.previewUrl) {
        releasePreviewUrl(attachment.previewUrl);
      }
    }
    updateAttachments((prev) => [
      ...prev.filter((attachment) => !removeIds.has(attachment.id)),
      ...storableAttachments(add),
    ]);
    hydrateClientPreviews(add);
  }

  return {
    attachments,
    getAttachments: () => attachmentsRef.current.filter((attachment) => !attachment.uploading),
    getDraftAttachments: () => storableAttachments(attachmentsRef.current),
    isUploading: attachments.some((attachment) => attachment.uploading),
    hasPendingUploads: () => attachmentsRef.current.some((attachment) => attachment.uploading),
    waitForUploads,
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
