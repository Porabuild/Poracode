import { storableAttachments } from "@/renderer/components/composer/useAttachments";
import { readDraftAsset } from "@/renderer/state/composerDrafts/readDraftAsset";
import { clientDraftPersistenceError } from "@/renderer/state/composerDrafts/persistenceError";
import { getRemoteBridgeClient } from "@/renderer/browser/remoteBridge";
import { RemoteClientError } from "@/shared/remote/clientErrors";
import { msg } from "@lingui/core/macro";
import { i18n } from "@/renderer/i18n/i18n";
import type { Project, PromptSegment, Thread } from "@/shared/contracts";
import { mimeForPath, fileNameFromPath, toLocalFileUrl } from "@/shared/promptContent";
import { readBridge } from "@/renderer/bridge";
import { entityHost, hostHandle, isSameHost } from "@/renderer/state/entityHost";
import {
  composerDraftStorage,
  draftContentSchema,
  type DraftCheckpoint,
  type DraftKind,
} from "@/renderer/state/composerDraftStorage";
import type { DraftContent } from "@/renderer/state/slices/types";
import {
  isClientDraftAsset,
  readClientDraftAsset,
  preserveClientSubmission,
  ClientSubmissionAlreadyPendingError,
  readClientSubmission,
  claimClientSubmission,
  updateClientSubmission,
  discardClientSubmission,
  queueClientDraftAssetReclamation,
  subscribeClientDraftSubmissions,
  type ClientDraftSubmission,
} from "@/renderer/state/composerDrafts/clientDraftDatabase";
import { isRemoteCommandOutcomeUncertainError } from "./threadCommandOutcomeActions";
import { materializeCrossHostThreadMentions } from "./crossHostThreadMention";

export interface DraftSubmission {
  id: string;
  checkpoint: DraftCheckpoint;
  segments: PromptSegment[];
  isTargetCurrent: () => boolean;
}

const storageError = clientDraftPersistenceError;

/** Only called for a captured Send/Launch/Queue/Steer intent, never on selection. */
export async function materializeDraftSegments(
  target: Project | Thread,
  segments: readonly PromptSegment[],
  attachmentThreadId: string,
  isTargetCurrent: () => boolean = () => true,
): Promise<PromptSegment[]> {
  if (!isTargetCurrent()) throw new Error(i18n._(msg`Remote server not found.`));
  const targetOwner = entityHost(target);
  if (target.remoteServerId && !targetOwner) throw new Error(i18n._(msg`Remote server not found.`));
  const boundTarget = targetOwner ? null : getRemoteBridgeClient();
  const assertTargetStillCurrent = () => {
    if (
      !isTargetCurrent() ||
      (targetOwner && !targetOwner.isCurrent()) ||
      (boundTarget && getRemoteBridgeClient() !== boundTarget)
    ) {
      throw new Error(i18n._(msg`Remote server not found.`));
    }
  };
  const uploadBytes = async (fileName: string, data: Uint8Array<ArrayBuffer>): Promise<string> => {
    assertTargetStillCurrent();
    const path = targetOwner
      ? await targetOwner.withClient((client) => {
          assertTargetStillCurrent();
          return client.uploadAttachment({
            threadId: attachmentThreadId,
            fileName,
            data,
          });
        })
      : boundTarget
        ? await boundTarget.uploadAttachment({
            threadId: attachmentThreadId,
            fileName,
            data,
          })
        : await readBridge().saveClipboardImage({
            threadId: attachmentThreadId,
            extension: /\.([a-z0-9]{1,16})$/i.exec(fileName)?.[1]?.toLowerCase() ?? "bin",
            data,
          });
    assertTargetStillCurrent();
    return path;
  };
  const copied = new Map<string, { path: string; mimeType: string }>();
  for (const segment of segments) {
    if (
      segment.kind !== "attachment" ||
      !isClientDraftAsset(segment.path) ||
      copied.has(segment.path)
    )
      continue;
    const asset = await readClientDraftAsset(segment.path).catch((error: unknown) => {
      throw storageError(error);
    });
    const data = new Uint8Array(await asset.blob.arrayBuffer());
    const path = await uploadBytes(asset.name, data);
    copied.set(segment.path, { path, mimeType: asset.mimeType });
  }
  const uploadedSegments = segments.map((segment) =>
    segment.kind === "attachment" && copied.has(segment.path)
      ? { ...segment, ...copied.get(segment.path)! }
      : segment,
  );
  return materializeCrossHostThreadMentions({
    target,
    segments: uploadedSegments,
    uploadBytes,
  });
}

/** Import legacy paths only after Send, using their original authority. */
async function importLegacyAttachments(
  content: DraftContent,
  target: Project | Thread,
): Promise<Extract<PromptSegment, { kind: "attachment" }>[]> {
  const targetOwner = entityHost(target);
  return Promise.all(
    content.attachments.map(
      async (attachment): Promise<Extract<PromptSegment, { kind: "attachment" }>> => {
        if (isClientDraftAsset(attachment.path)) {
          await readDraftAsset(attachment).catch((error: unknown) => {
            throw storageError(error);
          });
          return {
            kind: "attachment",
            path: attachment.path,
            ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
          };
        }
        if (!attachment.source)
          return {
            kind: "attachment",
            path: attachment.path,
            ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
          };
        const sourceOwner = hostHandle(attachment.source.remoteServerId);
        if (attachment.source.remoteServerId && !sourceOwner)
          throw new Error(i18n._(msg`Remote server not found.`));
        if (sourceOwner && targetOwner && isSameHost(sourceOwner, targetOwner))
          return {
            kind: "attachment",
            path: attachment.path,
            ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
          };
        if (!sourceOwner && !target.remoteServerId && !attachment.source.remoteServerId)
          return {
            kind: "attachment",
            path: attachment.path,
            ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
          };
        if (!attachment.isImage)
          throw new Error(
            i18n._(
              msg`Reattach this file on this device before sending it to another environment.`,
            ),
          );
        const sourceClient = sourceOwner ? null : getRemoteBridgeClient();
        const request = `/api/files/image?${new URLSearchParams({ path: attachment.path })}`;
        const { bytes } = sourceOwner
          ? await sourceOwner.withClient((client) =>
              client.fetchTicketedImageBytes(request, AbortSignal.timeout(60_000)),
            )
          : sourceClient
            ? await sourceClient.fetchTicketedImageBytes(request, AbortSignal.timeout(60_000))
            : {
                bytes: await readBridge().readLocalImageFile({
                  url: toLocalFileUrl(attachment.path),
                }),
              };
        // Stage legacy images locally too: a failed send or later switch keeps the same bytes.
        const { stageClientDraftAsset } =
          await import("@/renderer/state/composerDrafts/clientDraftDatabase");
        const staged = stageClientDraftAsset(
          new Blob([Uint8Array.from(bytes)], {
            type: attachment.mimeType ?? mimeForPath(attachment.name) ?? "image/png",
          }),
          attachment.name || fileNameFromPath(attachment.path),
        );
        await staged.saved;
        return {
          kind: "attachment",
          path: staged.path,
          ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
        };
      },
    ),
  );
}

export async function preserveDraftSubmission(input: {
  kind: DraftKind;
  ownerId: string;
  target: Project | Thread;
  content: DraftContent;
  segments: readonly PromptSegment[];
  intent: string;
  configuration: unknown;
}): Promise<DraftSubmission> {
  const capturedOwner = entityHost(input.target);
  const capturedBridge = capturedOwner ? null : getRemoteBridgeClient();
  const isTargetCurrent = () =>
    capturedOwner
      ? capturedOwner.isCurrent()
      : !input.target.remoteServerId &&
        !entityHost(input.target) &&
        getRemoteBridgeClient() === capturedBridge;
  const storage = composerDraftStorage();
  if (!storage) throw storageError();
  let checkpoint: DraftCheckpoint;
  try {
    checkpoint = await storage.checkpoint(input.kind, input.ownerId, input.content);
  } catch (error) {
    console.error("[poracode] draft submission persistence failed", error);
    throw storageError(error);
  }
  const target = JSON.stringify([input.target.remoteServerId ?? "managed", input.target.id]);
  const fingerprint = JSON.stringify({
    content: checkpoint.content,
    target,
    ownerId: input.target.id,
    intent: input.intent,
    configuration: input.configuration,
  });
  const id = crypto.randomUUID();
  const originalPaths = new Map(
    input.content.attachments.map((attachment) => [attachment.path, attachment]),
  );
  if (!isTargetCurrent()) throw new Error(i18n._(msg`Remote server not found.`));
  const imported = await importLegacyAttachments(checkpoint.content, input.target);
  if (!isTargetCurrent()) throw new Error(i18n._(msg`Remote server not found.`));
  const replacements = new Map(
    checkpoint.content.attachments.map((attachment, index) => [attachment.path, imported[index]!]),
  );
  const segments = input.segments.map((segment) =>
    segment.kind === "attachment" && originalPaths.has(segment.path)
      ? replacements.get(segment.path)!
      : segment,
  );
  const record: ClientDraftSubmission = {
    formatVersion: 1,
    id,
    draftId: checkpoint.draftId,
    scope: JSON.stringify([input.kind, input.ownerId]),
    revision: checkpoint.revision,
    target,
    fingerprint,
    state: "prepared",
    content: {
      checkpoint,
      segments,
      intent: input.intent,
      configuration: input.configuration,
      recoveryContent: {
        segments: checkpoint.content.segments.map((segment) =>
          segment.kind === "attachment" && replacements.has(segment.path)
            ? replacements.get(segment.path)!
            : segment,
        ),
        attachments: checkpoint.content.attachments.map((attachment, index) => ({
          ...attachment,
          path: imported[index]!.path,
        })),
      },
    },
    assets: [
      ...new Set(
        segments.flatMap((segment) =>
          segment.kind === "attachment" && isClientDraftAsset(segment.path) ? [segment.path] : [],
        ),
      ),
    ],
  };
  try {
    await preserveClientSubmission(record);
  } catch (error) {
    if (error instanceof ClientSubmissionAlreadyPendingError)
      throw new Error(
        i18n._(
          msg`Couldn't confirm this command with the host. It may still have been applied — check the thread before trying again.`,
        ),
        { cause: error },
      );
    console.error("[poracode] draft submission persistence failed", error);
    throw storageError(error);
  }
  return { id, checkpoint, segments, isTargetCurrent };
}

export async function dispatchDraftSubmission<T>(
  submission: DraftSubmission,
  run: () => Promise<T>,
): Promise<T> {
  if (!submission.isTargetCurrent()) throw new Error(i18n._(msg`Remote server not found.`));
  await claimClientSubmission(submission.id).catch((error: unknown) => {
    throw storageError(error);
  });
  try {
    if (!submission.isTargetCurrent()) throw new Error(i18n._(msg`Remote server not found.`));
    return await run();
  } catch (error) {
    const uncertain = isRemoteCommandOutcomeUncertainError(error);
    await updateClientSubmission(submission.id, uncertain ? "uncertain" : "failed").catch(
      () => undefined,
    );
    throw error;
  }
}

export function clientDraftRetirementError(cause: unknown, requestMayHaveCommitted = true) {
  return new RemoteClientError(
    i18n._(
      msg`The host accepted this message, but local recovery cleanup failed. Check the thread before retrying.`,
    ),
    409,
    "client_draft_retirement_failed",
    { cause, requestMayHaveCommitted },
  );
}

export async function acceptDraftSubmission(
  submission: Omit<DraftSubmission, "isTargetCurrent">,
  onRetire?: () => void,
): Promise<boolean> {
  try {
    await updateClientSubmission(submission.id, "accepted");
    const storage = composerDraftStorage();
    const acknowledged = (await storage?.acknowledge(submission.checkpoint, onRetire)) ?? false;
    const record = await readClientSubmission(submission.id);
    await discardClientSubmission(submission.id);
    if (record) queueClientDraftAssetReclamation(record.assets);
    return acknowledged;
  } catch (error) {
    throw clientDraftRetirementError(error);
  }
}

export async function acceptClientSubmissionById(
  id: string,
  onRetire?: () => void,
): Promise<boolean> {
  const record = await readClientSubmission(id);
  if (!record || record.state !== "accepted") return false;
  const envelope = record.content as { checkpoint: DraftCheckpoint; segments: PromptSegment[] };
  return acceptDraftSubmission(
    { id, checkpoint: envelope.checkpoint, segments: envelope.segments },
    onRetire,
  );
}

export async function settleClientSubmission(
  id: string | undefined,
  state: "accepted" | "failed" | "uncertain",
) {
  if (!id || typeof indexedDB === "undefined") return;
  try {
    await updateClientSubmission(id, state);
  } catch (error) {
    if (state !== "accepted") throw error;
    throw clientDraftRetirementError(error);
  }
}

export async function retireFailedDraftSubmission(id: string | undefined): Promise<void> {
  if (!id || typeof indexedDB === "undefined") return;
  const record = await readClientSubmission(id).catch(() => undefined);
  if (!record || record.state === "accepted") return;
  if (await discardClientSubmission(id, true).catch(() => false)) {
    queueClientDraftAssetReclamation(record.assets);
  }
}

export function parseSubmissionRecoveryContent(
  record: Pick<ClientDraftSubmission, "content">,
): DraftContent {
  const envelope = record.content as {
    checkpoint?: { content?: unknown };
    recoveryContent?: unknown;
  } | null;
  return draftContentSchema.parse(envelope?.recoveryContent ?? envelope?.checkpoint?.content);
}

export function matchesSubmissionRecoveryContent(
  record: Pick<ClientDraftSubmission, "content">,
  draft: DraftContent | undefined,
): boolean {
  if (!draft) return false;
  const current = draftContentSchema.safeParse({
    segments: draft.segments,
    attachments: storableAttachments(draft.attachments),
  });
  if (!current.success) return false;
  const currentJson = JSON.stringify(current.data);
  const envelope = record.content as {
    checkpoint?: { content?: unknown };
    recoveryContent?: unknown;
  } | null;
  for (const candidate of [envelope?.recoveryContent, envelope?.checkpoint?.content]) {
    if (candidate === undefined) continue;
    const parsed = draftContentSchema.safeParse(candidate);
    if (parsed.success && currentJson === JSON.stringify(parsed.data)) return true;
  }
  return false;
}

const notifiedDraftLaunchErrors = new WeakSet<object>();

export function markDraftLaunchErrorNotified(error: unknown): void {
  if (typeof error === "object" && error !== null) {
    notifiedDraftLaunchErrors.add(error);
  }
}

export function wasDraftLaunchErrorNotified(error: unknown): boolean {
  return typeof error === "object" && error !== null && notifiedDraftLaunchErrors.has(error);
}

/** A native handoff is not a launch receipt. Quick Composer waits for its worker. */
export async function waitForClientSubmission(id: string): Promise<void> {
  const uncertain = (cause?: unknown) =>
    new RemoteClientError(
      i18n._(
        msg`Couldn't confirm this command with the host. It may still have been applied — check the thread before trying again.`,
      ),
      409,
      "command_outcome_uncertain",
      { ...(cause !== undefined ? { cause } : {}), requestMayHaveCommitted: true },
    );
  return new Promise<void>((resolve, reject) => {
    let finished = false;
    let reading = false;
    let refreshPending = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      unsubscribe();
      clearTimeout(deadline);
      clearInterval(fallback);
      if (error) reject(error);
      else resolve();
    };
    const refresh = () => {
      if (finished) return;
      if (reading) {
        refreshPending = true;
        return;
      }
      reading = true;
      void readClientSubmission(id)
        .then(
          (record) => {
            if (record?.state === "accepted") finish();
            else if (!record || record.state === "uncertain") finish(uncertain());
            else if (record.state === "failed")
              finish(
                new Error(
                  i18n._(
                    msg`The thread could not be started. Your draft is still saved on this device.`,
                  ),
                ),
              );
          },
          (error) => finish(uncertain(error)),
        )
        .finally(() => {
          reading = false;
          if (refreshPending) {
            refreshPending = false;
            refresh();
          }
        });
    };
    // Subscribe before reading so a receipt racing with the first read is observed.
    const unsubscribe = subscribeClientDraftSubmissions(refresh);
    const deadline = setTimeout(() => finish(uncertain()), 10 * 60_000);
    // Notifications are advisory: older or restricted clients may not broadcast.
    const fallback = setInterval(refresh, 1000);
    refresh();
  });
}
