import type { ExtractContextResult, Thread } from "@/shared/contracts";
import { questionAnswerItemPayloadSchema } from "@/shared/contracts";
import type { PersistedRuntimeItem } from "@/shared/ipc";
import { stripAnsiPreservingLayout } from "@/shared/ansi";
import {
  REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
  REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
  type RemoteDesktopClient,
} from "@/shared/remote/client";
import { formatHandoffRow } from "@/renderer/actions/handoffTranscriptRows";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { managedRootHistoryActivation } from "@/renderer/state/managedRootCatalog/rootHistory";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { extractAcpArgsText, extractAcpResultText } from "../ChatPane/parts/items/acpToolPayload";

const MAX_ROW_CHARS = 6_000;
const MAX_PAGES = 100;
const GAP = "[earlier turns omitted]\n\n";

function boundedTail(text: string): string {
  const plain = stripAnsiPreservingLayout(text);
  return plain.length > MAX_ROW_CHARS
    ? `[output truncated]\n${plain.slice(-MAX_ROW_CHARS)}`
    : plain;
}

/** Normalized tool output matters for side questions about failures and results. */
export function formatSideChatContextItem(item: PersistedRuntimeItem): string | null {
  const payload = item.payload as Record<string, unknown> | undefined;
  if (item.type === "question_answer") {
    const result = questionAnswerItemPayloadSchema.safeParse(item.payload);
    return result.success
      ? boundedTail(
          result.data.questions
            .map(
              (entry) =>
                `Question: ${entry.question}\nUser answer: ${entry.selected.map((selection) => `${selection.label}${selection.description ? ` (${selection.description})` : ""}`).join(", ")}${entry.customAnswer ? `\n${entry.customAnswer}` : ""}`,
            )
            .join("\n\n"),
        )
      : null;
  }
  if (item.type === "command_execution") {
    return `Command: ${String(payload?.command ?? "").slice(0, 500)}\nStatus: ${payload?.status ?? item.state}${typeof payload?.exitCode === "number" ? `, exit ${payload.exitCode}` : ""}\n${boundedTail(`${payload?.errorMessage ?? ""}\n${item.streams.command_output || extractAcpResultText(payload)}`)}`;
  }
  if (["tool_call", "mcp_tool_call", "dynamic_tool_call"].includes(item.type)) {
    return `Tool: ${String(payload?.name ?? payload?.title ?? item.type).slice(0, 500)}\nStatus: ${payload?.status ?? item.state}\n${extractAcpArgsText(payload).slice(0, 500)}\n${boundedTail(extractAcpResultText(payload))}`;
  }
  // Raw canonical rows already have the renderer's shape; do not apply its
  // hydrated stream retention, which would discard output before formatting.
  return formatHandoffRow(item as RuntimeChatItem, MAX_ROW_CHARS)?.text ?? null;
}

/** Read a separate bounded snapshot; never register or alter the parent's cursors. */
export async function readSideChatContext(
  thread: Thread,
  maxChars: number,
): Promise<ExtractContextResult | null> {
  const owner = remoteOwner(thread);
  const activation = owner ? null : managedRootHistoryActivation();
  const read = async (client: RemoteDesktopClient): Promise<ExtractContextResult | null> => {
    const signal = AbortSignal.timeout(15_000);
    const header =
      "Snapshot of the parent conversation, oldest turn first. This is background for a separate side question. Bounded tool output is included; omissions are marked.\n\n";
    const budget = Math.max(0, maxChars - header.length - MAX_ROW_CHARS - GAP.length);
    const recent: { id: string; text: string }[] = [];
    let used = 0;
    let omitted = false;
    let firstUser: { id: string; text: string } | undefined;
    let beforePosition: number | undefined;
    let proof: Parameters<RemoteDesktopClient["boundedThreadHistoryItems"]>[0]["after"];
    for (let index = 0; ; index += 1) {
      if (index >= MAX_PAGES)
        throw new Error("Side chat context exceeds the bounded history page limit");
      const common = {
        threadId: owner?.remoteId ?? thread.id,
        limit: 500,
        maxBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
        maxDecodeBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
        signal,
      };
      const result = await client.boundedThreadHistoryItems(
        beforePosition !== undefined && proof
          ? { ...common, beforePosition, after: proof }
          : common,
      );
      if (!owner && managedRootHistoryActivation() !== activation)
        throw new Error("History connection changed during side chat snapshot");
      if (result.negotiation !== "bounded")
        throw new Error("Side chat requires bounded conversation history");
      proof ??= { reads: result.page.reads };
      // Pages arrive newest first, each in chronological order. Prepending
      // backwards preserves order while keeping only a bounded recent suffix.
      for (const item of [...result.page.items].reverse()) {
        if (omitted && item.type !== "user_message") continue;
        const text = formatSideChatContextItem(item);
        if (!text) continue;
        if (item.type === "user_message") firstUser = { id: item.id, text };
        if (used + text.length + 2 <= budget && !omitted) {
          recent.unshift({ id: item.id, text });
          used += text.length + 2;
        } else omitted = true;
      }
      const next = result.page.nextCursor;
      if (next === null) break;
      if (beforePosition !== undefined && next >= beforePosition)
        throw new Error("Side chat history cursor did not advance");
      beforePosition = next;
    }
    const rows = recent.filter((row) => row.id !== firstUser?.id);
    const body = [firstUser?.text, omitted ? GAP.trim() : undefined, ...rows.map((row) => row.text)]
      .filter(Boolean)
      .join("\n\n");
    return body
      ? {
          summary: header + body,
          sourceProvider: thread.agentKind,
          sourceSessionId: thread.sessionRef?.providerSessionId ?? thread.id,
          extractedAt: new Date().toISOString(),
          contentKind: "transcript",
          ...(thread.worktreePath ? { worktreePath: thread.worktreePath } : {}),
        }
      : null;
  };
  if (owner) return useRemoteServersStore.getState().withClient(owner.desktopId, read);
  if (!activation) throw new Error("History connection unavailable for side chat snapshot");
  return read(activation.client);
}
