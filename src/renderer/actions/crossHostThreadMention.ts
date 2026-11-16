import { msg } from "@lingui/core/macro";
import { stripAnsiPreservingLayout } from "@/shared/ansi";
import type { Project, PromptSegment, Thread } from "@/shared/contracts";
import { threadMentionLabel } from "@/shared/promptContent";
import {
  REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
  REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
  REMOTE_REQUEST_CANCELLED_STATUS,
  RemoteClientError,
  isRemoteTransportFailure,
} from "@/shared/remote/client";
import { getRemoteBridgeClient } from "@/renderer/browser/remoteBridge";
import { i18n } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { entityHost } from "@/renderer/state/entityHost";
import { readProjectEnvironmentLabel } from "@/renderer/state/projectGroups/environmentLabels";
import { hostSupportsRuntimeHistoryNoticesFor } from "@/renderer/state/remote/historyNoticeCapability";
import {
  parseProjectedRemoteEntityId,
  remoteOwner,
  type RemoteOwner,
} from "@/renderer/state/remoteProjection";
import { formatTranscriptItems } from "./handoffTranscript";

const CROSS_HOST_MENTION_TRANSCRIPT_MAX_CHARS = 200_000;
const CROSS_HOST_MENTION_TIMELINE_ENTRIES = 100;
const CROSS_HOST_MENTION_TIMEOUT_MS = 30_000;

export interface MaterializeCrossHostThreadMentionsInput {
  readonly target: Project | Thread;
  readonly segments: readonly PromptSegment[];
  readonly uploadBytes: (fileName: string, data: Uint8Array<ArrayBuffer>) => Promise<string>;
}

/** Parse a `remote:<desktopId>:thread:<remoteId>` store thread id. */
export function parseProjectedRemoteThreadId(value: string): RemoteOwner | undefined {
  return parseProjectedRemoteEntityId(value, "thread");
}

function resolveTargetDesktopId(target: Project | Thread): string | undefined {
  if (target.remoteServerId) return target.remoteServerId;
  if ("location" in target) return target.location.remoteServerId;
  return parseProjectedRemoteThreadId(target.id)?.desktopId;
}

function slugifyThreadLabel(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "thread"
  );
}

function shortMentionKey(threadId: string): string {
  const raw = parseProjectedRemoteThreadId(threadId)?.remoteId ?? threadId;
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(-8);
  return cleaned || "id";
}

async function readCrossHostThreadMarkdown(
  segment: Extract<PromptSegment, { kind: "thread" }>,
  projected: RemoteOwner | undefined,
): Promise<{ fileName: string; markdown: string }> {
  const initialState = useAppStore.getState();
  const row = initialState.threads.find((candidate) => candidate.id === segment.threadId);
  const sourceEntity = projected
    ? { id: segment.threadId, remoteServerId: projected.desktopId, remoteId: projected.remoteId }
    : { id: segment.threadId };
  const sourceOwner = entityHost(sourceEntity);
  const boundSource = sourceOwner ? null : getRemoteBridgeClient();

  let snapshotThread: Thread | undefined = row;
  let transcriptText: string | null = null;
  let fetchedFromHost = false;
  let usedCachedCopy = false;
  let runtimeGapNotice = false;

  if (sourceOwner || boundSource) {
    try {
      const options = {
        targetTimelineEntryCount: CROSS_HOST_MENTION_TIMELINE_ENTRIES,
        compactDetails: true,
        ...(sourceOwner && hostSupportsRuntimeHistoryNoticesFor(sourceOwner)
          ? { noticesCapable: true as const }
          : {}),
        maxBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
        maxDecodeBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
        signal: AbortSignal.timeout(CROSS_HOST_MENTION_TIMEOUT_MS),
      };
      const result = sourceOwner
        ? await sourceOwner.withClient((client) =>
            client.boundedThreadHistory(sourceOwner.hostId, options),
          )
        : await boundSource!.boundedThreadHistory(segment.threadId, options);
      fetchedFromHost = true;
      runtimeGapNotice = Boolean(result.page.runtimeNotice);
      snapshotThread = sourceOwner
        ? sourceOwner.projectThread(result.page.thread)
        : result.page.thread;
      const items = sourceOwner
        ? sourceOwner.projectRuntimeItems(result.page.runtimeItems)
        : result.page.runtimeItems;
      transcriptText = formatTranscriptItems(items, CROSS_HOST_MENTION_TRANSCRIPT_MAX_CHARS);
      if (!transcriptText && result.page.terminalScrollback) {
        const stripped = stripAnsiPreservingLayout(result.page.terminalScrollback).trim();
        if (stripped) {
          transcriptText =
            stripped.length > CROSS_HOST_MENTION_TRANSCRIPT_MAX_CHARS
              ? `[earlier terminal output omitted]\n${stripped.slice(-CROSS_HOST_MENTION_TRANSCRIPT_MAX_CHARS)}`
              : stripped;
        }
      }
    } catch (error) {
      // Answered host refusals (401/403, 404 deleted thread, 409 durable gap,
      // 500) must surface directly rather than silently uploading stale
      // resident cache or claiming the host is disconnected. Transport drops,
      // proxy 502/504, and our 30s AbortSignal.timeout (499 cancelled) fall
      // back to resident cache.
      const unanswered =
        isRemoteTransportFailure(error) ||
        (error instanceof RemoteClientError &&
          (error.status === REMOTE_REQUEST_CANCELLED_STATUS ||
            error.code === "cancelled" ||
            error.code === "timeout")) ||
        !(error instanceof RemoteClientError && error.status > 0);
      if (!unanswered) {
        throw error;
      }
    }
  }

  if (!fetchedFromHost) {
    const currentState = useAppStore.getState();
    const itemIds = currentState.runtimeItemIdsByThread[segment.threadId] ?? [];
    const itemsById = currentState.runtimeItemsByIdByThread[segment.threadId];
    if (itemsById && itemIds.length > 0) {
      const residentItems = itemIds.flatMap((id) => {
        const item = itemsById[id];
        return item && !item.parentItemId ? [item] : [];
      });
      transcriptText = formatTranscriptItems(
        residentItems,
        CROSS_HOST_MENTION_TRANSCRIPT_MAX_CHARS,
      );
    }
    if (!transcriptText) {
      throw new Error(i18n._(msg`The thread's host is not connected.`));
    }
    usedCachedCopy = true;
  }

  const label = threadMentionLabel(segment);
  const project = snapshotThread
    ? useAppStore.getState().projects.find((candidate) => candidate.id === snapshotThread.projectId)
    : undefined;
  const environmentLabel = project ? readProjectEnvironmentLabel(project) : projected?.desktopId;
  const headerLines = [
    `# Referenced Poracode thread: ${label}`,
    ...(environmentLabel ? [`Environment: ${environmentLabel}`] : []),
    ...(snapshotThread?.agentKind ? [`Provider: ${snapshotThread.agentKind}`] : []),
    ...(snapshotThread?.worktreeBranch ? [`Branch: ${snapshotThread.worktreeBranch}`] : []),
    "",
    "This thread lives on another Poracode environment, so its recorded conversation is attached in this file rather than readable through `read_thread`.",
    ...(usedCachedCopy
      ? [
          "Note: The thread's host was unreachable when this message was sent; this file contains the transcript cached on this device.",
        ]
      : []),
    ...(runtimeGapNotice
      ? [
          "Note: The source host recorded a runtime history gap on this thread; some earlier turns may be missing.",
        ]
      : []),
    "",
  ];
  const body = transcriptText ?? "No transcript has been recorded for this thread yet.";
  return {
    fileName: `referenced-thread-${slugifyThreadLabel(label)}-${shortMentionKey(segment.threadId)}.md`,
    markdown: `${headerLines.join("\n")}${body}\n`,
  };
}

/**
 * Materialize thread mentions that live on a different host than `target`.
 *
 * Same-host mentions stay untouched so the target supervisor resolves them via
 * its own `read_thread` MCP tool on demand. Cross-host mentions cannot be read
 * by the target host directly (each host owns only its own data root and holds
 * no child bearer token), so the client reads the referenced thread's bounded
 * transcript from its owning host and uploads it as a Markdown attachment to
 * the target host while keeping the inline mention segment for UI badge paint.
 */
export async function materializeCrossHostThreadMentions(
  input: MaterializeCrossHostThreadMentionsInput,
): Promise<PromptSegment[]> {
  const { target, segments, uploadBytes } = input;
  if (!segments.some((segment) => segment.kind === "thread")) {
    return [...segments];
  }
  const targetDesktopId = resolveTargetDesktopId(target);
  const threads = useAppStore.getState().threads;
  const uploadedAttachments: Extract<PromptSegment, { kind: "attachment" }>[] = [];
  const seenThreadIds = new Set<string>();

  for (const segment of segments) {
    if (segment.kind !== "thread" || seenThreadIds.has(segment.threadId)) continue;
    const row = threads.find((candidate) => candidate.id === segment.threadId);
    const projected = remoteOwner(row) ?? parseProjectedRemoteThreadId(segment.threadId);
    const sourceDesktopId = projected?.desktopId;
    if (sourceDesktopId === targetDesktopId) continue;

    seenThreadIds.add(segment.threadId);
    const { fileName, markdown } = await readCrossHostThreadMarkdown(segment, projected);
    const path = await uploadBytes(fileName, new TextEncoder().encode(markdown));
    uploadedAttachments.push({ kind: "attachment", path, mimeType: "text/markdown" });
  }

  return uploadedAttachments.length > 0 ? [...uploadedAttachments, ...segments] : [...segments];
}
