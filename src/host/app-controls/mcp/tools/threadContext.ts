import { z } from "zod";
import { extractContextPayloadSchema } from "@/shared/contracts";
import {
  APP_THREAD_REQUESTS_VERSION,
  appThreadRequestInputSchema,
} from "@/shared/contracts/appThreadRequests";
import {
  dbGetThreadContextUsage,
  dbGetThreadOpenRequestItems,
  dbGetThreadRuntimeItems,
  dbGetThreadTokenUsage,
  getRuntimeThreadGapNotice,
} from "@/host/db";
import { readDatabaseAsync } from "@/host/db/asyncReads";
import { toRemoteRuntimeHistoryNotice } from "@/host/remote/server/runtimeHistoryNoticeGate";
import { buildHandoffTranscriptContext, handoffTranscriptBudget } from "@/shared/handoffTranscript";
import { projectLocationKey } from "@/shared/projectIdentity";
import { requestsFromRuntimeItems } from "@/shared/runtimeRequestPreview";
import { threadAttentionStatus } from "@/shared/threadAttention";
import { appControlToolDomain, defineAppControlTool } from "../defineTools";
import { requireAppRuntime, requireProject, requireThread, resolveWorktreeInfo } from "./types";
import { describeThreadRequest } from "./threadRequestPreview";

const threadIdInput = extractContextPayloadSchema.pick({ threadId: true }).strict();

function historyNotice(threadId: string) {
  const notice = getRuntimeThreadGapNotice(threadId);
  return notice ? { runtimeNotice: toRemoteRuntimeHistoryNotice(notice) } : {};
}

export const threadContextTools = appControlToolDomain(
  defineAppControlTool({
    name: "thread_context",
    description:
      "Read thread context, usage, an extraction or its saved transcript. requests previews pending prompts. live_requests reads the owning supervisor and returns single-use request tokens with question and form details. At the user's explicit direction, reply submits their exact option choices or answers using the current requestId and requestToken. Complete browser and secret prompts in Poracode.",
    input: z.discriminatedUnion("action", [
      threadIdInput.extend({ action: z.literal("usage") }),
      threadIdInput.extend({
        action: z.literal("requests"),
        requestId: z.string().min(1).optional(),
        includeDetails: z.boolean().default(false),
      }),
      threadIdInput.extend({
        action: z.literal("transcript"),
        contextSize: z.string().max(80).optional(),
      }),
      threadIdInput.extend({
        action: z.literal("extract"),
        selection: extractContextPayloadSchema.shape.selection,
      }),
      threadIdInput.extend({ action: z.literal("cancel") }),
      threadIdInput.extend({ action: z.literal("live_requests") }),
      appThreadRequestInputSchema.options[1],
    ]),
    run: async (input, ctx) => {
      const { threadId, action } = input;
      const source = requireThread(ctx, threadId);
      switch (action) {
        case "live_requests": {
          const result = await requireAppRuntime(ctx).call("appThreadRequests", {
            version: APP_THREAD_REQUESTS_VERSION,
            input: { action: "list", threadId },
          });
          if (result.action !== "list")
            throw new Error("The supervisor did not return live requests.");
          return {
            threadId,
            requests: result.requests.map(({ requestToken, ...request }) => ({
              ...describeThreadRequest(
                {
                  ...request,
                  requestId: String(request.requestId),
                },
                true,
              ),
              requestToken,
            })),
          };
        }
        case "reply":
          return requireAppRuntime(ctx).call("appThreadRequests", {
            version: APP_THREAD_REQUESTS_VERSION,
            input,
          });
        case "usage": {
          const [contextUsage, tokenUsage] = await Promise.all([
            readDatabaseAsync("contextUsage", [threadId], () => dbGetThreadContextUsage(threadId)),
            readDatabaseAsync("tokenUsage", [threadId], () => dbGetThreadTokenUsage(threadId)),
          ]);
          return { threadId, contextUsage, tokenUsage };
        }
        case "requests": {
          const items = await dbGetThreadOpenRequestItems(threadId);
          const current = requireThread(ctx, threadId);
          const live = ctx.threadStates.getLiveState(threadId);
          const status = threadAttentionStatus(
            live?.status ?? current.status,
            live?.attention ?? current.attention,
          );
          const requests =
            status === "needs_reply" || status === "needs_approval"
              ? requestsFromRuntimeItems(items)
                  .filter(
                    ({ requestId }) =>
                      input.requestId === undefined || requestId === input.requestId,
                  )
                  .map((request) => describeThreadRequest(request, input.includeDetails))
              : [];
          return { threadId, status, requests, ...historyNotice(threadId) };
        }
        case "transcript": {
          const items = await dbGetThreadRuntimeItems(threadId);
          const context = buildHandoffTranscriptContext(
            source,
            source.agentKind,
            items,
            handoffTranscriptBudget(input.contextSize),
          );
          return { threadId, context, ...historyNotice(threadId) };
        }
        case "cancel":
          await requireAppRuntime(ctx).call("cancelExtractContext", { threadId });
          return { threadId, cancellationRequested: true };
        case "extract": {
          const project = requireProject(ctx, source.projectId);
          if (!source.sessionRef)
            throw new Error("This thread has no saved provider session to extract.");
          const worktreePath = source.worktreePath
            ? (await resolveWorktreeInfo(ctx, project.location, source.worktreePath)).path
            : undefined;
          const current = requireThread(ctx, threadId);
          if (
            current.projectId !== source.projectId ||
            current.agentKind !== source.agentKind ||
            current.worktreePath !== source.worktreePath ||
            current.sessionRef?.providerSessionId !== source.sessionRef.providerSessionId ||
            current.sessionRef.executionIdentity !== source.sessionRef.executionIdentity ||
            projectLocationKey(requireProject(ctx, current.projectId).location) !==
              projectLocationKey(project.location)
          )
            throw new Error(
              "The source session changed. Read the thread again before extracting context.",
            );
          return requireAppRuntime(ctx).call("extractContext", {
            threadId,
            agentKind: current.agentKind,
            sessionRef: current.sessionRef,
            projectLocation: project.location,
            ...(worktreePath === undefined ? {} : { worktreePath }),
            ...(input.selection === undefined ? {} : { selection: input.selection }),
          });
        }
      }
    },
  }),
);
