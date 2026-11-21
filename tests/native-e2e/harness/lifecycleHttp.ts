import type { IncomingMessage, ServerResponse } from "node:http";
import { writeValidatedRoute, recordRouteFollowUps } from "./contractResponse.ts";
import { LabHttpError } from "./labAuth.ts";
import type { LabRuntime } from "./labRuntime.ts";
import { validateRouteRequest } from "./requestValidation.ts";
import { REMOTE_COMMAND_ID_HEADER } from "../../../src/shared/remote/protocol.ts";
import { headerValue } from "./httpIo.ts";
import {
  presentRuntimeCommand,
  presentRuntimeMcpTool,
  presentRuntimeWorkflow,
  presentRuntimeWorkflowView,
  presentRuntimeToolBody,
} from "../../../src/host/remote/server/runtimeItemPresentationProjection.ts";
import { runtimeItemPresentationRequestSchema } from "../../../src/shared/contracts/runtimeItemPresentation.ts";
import { historyRuntimeItemSchema } from "../../../src/shared/remote/historyPresentation.ts";

const LIFECYCLE_ROUTE_IDS = new Set([
  "shell-snapshot",
  "project-command",
  "project-settings",
  "catalog-membership",
  "mcp-settings-read",
  "mcp-settings-command",
  "mcp-settings-operation",
  "project-notes-read",
  "project-notes-write",
  "attachment-upload",
  "thread-history",
  "thread-history-changes",
  "thread-item-presentations",
  "thread-history-items",
  "thread-start-existing",
  "thread-runtime-truncate",
  "thread-checkpoint-revert",
  "thread-command",
  "thread-send",
  "thread-interrupt",
  "thread-goal",
  "thread-close",
  "thread-steer-set",
  "thread-steer-clear",
]);

export async function handleLifecycleHttp(
  runtime: LabRuntime,
  req: IncomingMessage,
  res: ServerResponse,
  routeId: string,
  url: URL,
  params: Readonly<Record<string, string>>,
): Promise<boolean> {
  if (!LIFECYCLE_ROUTE_IDS.has(routeId)) return false;
  if (routeId.startsWith("mcp-settings-") && !runtime.lifecycle.composerTools.enabled) return false;
  if (routeId === "catalog-membership" && !runtime.lifecycle.sideChats.enabled) return false;
  if (routeId === "thread-history-changes" && !runtime.lifecycle.threadHistoryChangesEnabled) {
    return false;
  }
  const input = await validateRouteRequest(req, url, routeId, params);
  const body = input.body as Record<string, unknown>;
  const threadId = String(input.params.threadId ?? "");
  const startsProviderHandoff =
    routeId === "thread-command" &&
    body.kind === "start" &&
    body.parentThreadId === undefined &&
    runtime.lifecycle.providerHandoffEnabled;
  if (
    routeId.startsWith("thread-") &&
    routeId !== "thread-start-existing" &&
    !(routeId === "thread-command" && body.kind === "import-session") &&
    !startsProviderHandoff &&
    !(
      routeId === "thread-command" &&
      body.kind === "fork" &&
      runtime.lifecycle.threadForks.enabled
    ) &&
    !(
      routeId === "thread-command" &&
      body.kind === "start" &&
      runtime.lifecycle.sideChats.enabled
    ) &&
    !runtime.lifecycle.hasThread(threadId)
  ) {
    throw new LabHttpError("not_found", "Thread not found.", 404);
  }
  switch (routeId) {
    case "thread-item-presentations": {
      const request = runtimeItemPresentationRequestSchema.parse(body);
      const history = runtime.lifecycle.history(runtime.ring.seq, threadId);
      const sources = historyRuntimeItemSchema.array().parse(history.runtimeItems);
      const items = request.items.map(({ itemId, inputDigest }) => {
        const item = sources.find((row) => row.id === itemId);
        return item
          ? (request.version === 1
              ? presentRuntimeCommand
              : request.version === 2
                ? presentRuntimeMcpTool
                : request.version === 3
                  ? presentRuntimeWorkflow
                  : request.version === 4
                    ? presentRuntimeWorkflowView
                    : presentRuntimeToolBody)(
              itemId,
              item.type,
              item.state,
              item.payload,
              inputDigest,
            )
          : { status: "unavailable" as const, itemId, reason: "missing" as const };
      });
      writeValidatedRoute(runtime, res, routeId, { version: request.version, items });
      return true;
    }
    case "catalog-membership":
      writeValidatedRoute(runtime, res, routeId, {
        existingThreadIds: (body.threadIds as string[]).filter((id) =>
          runtime.lifecycle.hasThread(id),
        ),
        existingProjectIds: (body.projectIds as string[]).filter(
          (id) => runtime.lifecycle.projectSettings(id) !== null,
        ),
      });
      return true;
    case "mcp-settings-read":
    case "mcp-settings-command":
    case "mcp-settings-operation":
      writeValidatedRoute(
        runtime,
        res,
        routeId,
        runtime.lifecycle.composerTools.response(routeId, body),
      );
      return true;
    case "shell-snapshot":
      // Like the host, the snapshot names the epoch its seq belongs to, so a
      // declaring client's first connect resumes verified instead of earning a
      // resync (and a second socket) whenever the ring is already past 0.
      writeValidatedRoute(
        runtime,
        res,
        routeId,
        runtime.lifecycle.shellSnapshot(runtime.ring.seq, runtime.ring.epoch),
      );
      recordRouteFollowUps(runtime, routeId);
      return true;
    case "project-command": {
      if (body.kind === "set-draft-config" && !headerValue(req, REMOTE_COMMAND_ID_HEADER)) {
        throw new LabHttpError(
          "command_id_required",
          "A project preference operation needs an id.",
          400,
        );
      }
      const result = runtime.lifecycle.projectCommand(body);
      if (!result) {
        runtime.ledger.observeHttpRoute(routeId, { statusCode: 501, source: "negative" });
        throw new LabHttpError(
          "unconfigured_contract_case",
          `Project command ${String(body.kind)} requires an external deterministic fixture.`,
          501,
        );
      }
      markMutation(runtime, routeId);
      writeValidatedRoute(runtime, res, routeId, result);
      return true;
    }
    case "project-settings": {
      const settings = runtime.lifecycle.projectSettings(String(input.params.projectId));
      if (!settings) throw new LabHttpError("not_found", "Project not found.", 404);
      writeValidatedRoute(runtime, res, routeId, settings);
      return true;
    }
    case "project-notes-read":
      writeValidatedRoute(
        runtime,
        res,
        routeId,
        runtime.lifecycle.readNotes(String(input.params.projectId)),
      );
      recordRouteFollowUps(runtime, routeId);
      return true;
    case "project-notes-write": {
      const result = runtime.lifecycle.writeNotes(String(input.params.projectId), body);
      if (result?.status !== "conflict") markMutation(runtime, routeId);
      writeValidatedRoute(runtime, res, routeId, result ? { result } : {});
      return true;
    }
    case "attachment-upload": {
      const path = runtime.lifecycle.saveAttachment(
        String(input.query.threadId),
        String(input.query.name),
        input.rawBody!,
      );
      markMutation(runtime, routeId);
      writeValidatedRoute(runtime, res, routeId, { path });
      return true;
    }
    case "thread-history": {
      const history = runtime.lifecycle.history(runtime.ring.seq, threadId);
      const bounded =
        (runtime.lifecycle.sideChats.enabled || runtime.lifecycle.threadHistoryChangesEnabled) &&
        input.query.reads === "bounded-v1";
      writeValidatedRoute(
        runtime,
        res,
        routeId,
        bounded
          ? {
              ...history,
              reads: "bounded-v1",
              runtimeNextCursor: null,
              completedTurnsNextCursor: null,
              ...(runtime.lifecycle.threadHistoryChangesEnabled
                ? { runtimeResumeCursor: "hr1.fixture" }
                : {}),
            }
          : history,
      );
      recordRouteFollowUps(runtime, routeId);
      return true;
    }
    case "thread-history-changes": {
      const history = runtime.lifecycle.history(runtime.ring.seq, threadId);
      const afterSeq = typeof input.query.afterSeq === "number" ? input.query.afterSeq : 0;
      const baseSeq = Math.max(
        runtime.ring.seq,
        typeof history.snapshotSeq === "number" ? history.snapshotSeq : 0,
        afterSeq,
      );
      const nextSeq = baseSeq + 1;
      const alreadyResumed = input.query.cursor === "hr1.fixture.resumed";
      const deltaText = "Warm resume delta delivered";
      writeValidatedRoute(runtime, res, routeId, {
        kind: "events",
        snapshotSeq: alreadyResumed ? baseSeq : nextSeq,
        runtimeResumeCursor: "hr1.fixture.resumed",
        thread: history.thread,
        completedTurns: history.completedTurns ?? [],
        completedTurnsNextCursor: null,
        contextUsage: history.contextUsage ?? null,
        backgroundTasks: history.backgroundTasks ?? [],
        followUpQueue: history.followUpQueue ?? null,
        batches: alreadyResumed
          ? []
          : [
              {
                seq: nextSeq,
                events: [
                  {
                    type: "item.started",
                    threadId,
                    itemId: "item-warm-resume-delta",
                    itemType: "assistant_message",
                    payload: {},
                  },
                  {
                    type: "content.delta",
                    threadId,
                    itemId: "item-warm-resume-delta",
                    stream: "assistant_text",
                    delta: deltaText,
                  },
                  {
                    type: "item.completed",
                    threadId,
                    itemId: "item-warm-resume-delta",
                  },
                ],
              },
            ],
      });
      recordRouteFollowUps(runtime, routeId);
      return true;
    }
    case "thread-history-items": {
      const page = runtime.lifecycle.sideChats.has(threadId)
        ? runtime.lifecycle.sideChats.historyItems(
            threadId,
            input.query.beforePosition as number | undefined,
            input.query.limit as number,
          )
        : runtime.lifecycle.historyItems(
            input.query.beforePosition as number | undefined,
            input.query.limit as number,
          );
      writeValidatedRoute(
        runtime,
        res,
        routeId,
        runtime.lifecycle.sideChats.enabled && input.query.reads === "bounded-v1"
          ? { ...page, reads: "bounded-v1" }
          : page,
      );
      recordRouteFollowUps(runtime, routeId);
      return true;
    }
    case "thread-start-existing":
      markMutation(runtime, routeId);
      writeValidatedRoute(runtime, res, routeId, runtime.lifecycle.start(body));
      if (body.providerSwitch) {
        runtime.publishEvent({
          type: "remote-threads-changed",
          threadIds: [String(body.threadId)],
        });
      }
      return true;
    case "thread-runtime-truncate":
      runtime.lifecycle.truncate(String(body.itemId));
      return writeOkMutation(runtime, res, routeId);
    case "thread-checkpoint-revert":
      markMutation(runtime, routeId);
      writeValidatedRoute(
        runtime,
        res,
        routeId,
        runtime.lifecycle.checkpointRevert(String(body.checkpointItemId)),
      );
      return true;
    case "thread-command":
      if (startsProviderHandoff) {
        runtime.lifecycle.startProviderHandoff(threadId, body);
        runtime.publishEvent({ type: "remote-threads-changed", threadIds: [threadId] });
      } else if (body.kind === "start" && runtime.lifecycle.sideChats.enabled) {
        runtime.lifecycle.startSideChat(
          threadId,
          body,
          headerValue(req, REMOTE_COMMAND_ID_HEADER) ?? "",
        );
        runtime.publishEvent({ type: "remote-threads-changed", threadIds: [threadId] });
      } else if (body.kind === "delete" && runtime.lifecycle.sideChats.has(threadId)) {
        runtime.lifecycle.sideChats.remove(threadId);
        runtime.publishEvent({ type: "remote-threads-changed", threadIds: [threadId] });
      } else if (body.kind === "fork" && runtime.lifecycle.threadForks.enabled) {
        const sourceId = String(body.sourceThreadId);
        if (!runtime.lifecycle.hasThread(sourceId)) {
          throw new LabHttpError("not_found", "Source thread not found.", 404);
        }
        runtime.lifecycle.threadForks.create(
          threadId,
          headerValue(req, REMOTE_COMMAND_ID_HEADER) ?? "",
          { ...body, threadId },
          runtime.lifecycle.history(runtime.ring.seq, sourceId),
        );
        runtime.publishEvent({ type: "remote-threads-changed", threadIds: [threadId] });
      } else if (body.kind === "import-session") runtime.lifecycle.importSession(threadId, body);
      else {
        runtime.lifecycle.command(body);
        if (
          ["rename", "set-done", "set-starred", "archive", "unarchive"].includes(String(body.kind))
        ) {
          runtime.publishEvent({ type: "remote-threads-changed", threadIds: [threadId] });
        }
      }
      return writeOkMutation(runtime, res, routeId);
    case "thread-send":
      if (runtime.lifecycle.sideChats.has(threadId)) {
        const events = runtime.lifecycle.sideChats.send(threadId, body);
        runtime.publishEvent({ type: "thread-runtime-events", threadId, events });
      } else runtime.lifecycle.send(body);
      return writeOkMutation(runtime, res, routeId);
    case "thread-interrupt":
      runtime.lifecycle.interrupt();
      return writeOkMutation(runtime, res, routeId);
    case "thread-goal":
      runtime.lifecycle.setGoal(body);
      return writeOkMutation(runtime, res, routeId);
    case "thread-close":
      runtime.lifecycle.close();
      return writeOkMutation(runtime, res, routeId);
    case "thread-steer-set":
      runtime.lifecycle.setSteer(body);
      return writeOkMutation(runtime, res, routeId);
    case "thread-steer-clear":
      runtime.lifecycle.clearSteer();
      return writeOkMutation(runtime, res, routeId);
    default:
      return false;
  }
}

function markMutation(runtime: LabRuntime, routeId: string): void {
  runtime.ledger.markRequiresFollowUp("route", routeId);
  runtime.lifecycle.recordMutation(routeId);
}

function writeOkMutation(runtime: LabRuntime, res: ServerResponse, routeId: string): true {
  markMutation(runtime, routeId);
  writeValidatedRoute(runtime, res, routeId, { ok: true });
  return true;
}
