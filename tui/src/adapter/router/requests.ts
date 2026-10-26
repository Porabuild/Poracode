import { z } from "zod";
import type { PermissionListOutput } from "@opencode/client";
import {
  canonicalRequestTypeSchema,
  requestPayloadSchema,
  RUNTIME_REQUEST_ITEM_TYPE,
  type RequestPayload,
} from "@/shared/contracts";
import { RemoteClientError } from "@/shared/remote/client";
import { DEFAULT_PERMISSION_OPTIONS } from "../permissions";
import {
  ELICITATION_PERMISSION_OPTIONS,
  emptyFormElicitationPayload,
  formInfoForRequest,
} from "../forms";
import { permissionId, requestIdFromFormId, threadId } from "../ids";
import { record } from "./helpers";
import type { RouterContext } from "./context";

/** Pending runtime requests: permission + form tracking against the host. */
export function createRequests(ctx: RouterContext) {
  const pendingRequestKey = (rawThreadId: string, requestId: string) =>
    JSON.stringify([rawThreadId, requestId]);

  const rememberPendingRequest = (
    rawThreadId: string,
    requestId: string,
    requestType: unknown,
    payload: unknown,
  ) => {
    const parsedType = canonicalRequestTypeSchema.safeParse(requestType);
    const parsedPayload = requestPayloadSchema.safeParse(payload);
    if (!parsedType.success || !parsedPayload.success) return undefined;
    const options =
      parsedType.data === "tool_user_input"
        ? (parsedPayload.data.options ?? []).map((option) => ({
            optionId: option.optionId,
            name: option.label,
          }))
        : parsedPayload.data.options?.length
          ? parsedPayload.data.options.map((option) => ({
              optionId: option.optionId,
              name: option.label,
            }))
          : DEFAULT_PERMISSION_OPTIONS;
    const saved = {
      requestId,
      threadId: rawThreadId,
      requestType: parsedType.data,
      payload: parsedPayload.data,
      options,
      ...(parsedType.data === "tool_user_input" && emptyFormElicitationPayload(parsedPayload.data)
        ? { elicitation: true as const }
        : {}),
    };
    ctx.pending.set(pendingRequestKey(rawThreadId, requestId), saved);
    return saved;
  };

  const permissionItemFor = (
    session: string,
    pendingRequest: Awaited<ReturnType<typeof pendingRequestsForSession>>[number],
  ): PermissionListOutput[number] => {
    const elicitation = pendingRequest.elicitation
      ? emptyFormElicitationPayload(pendingRequest.payload)
      : undefined;
    return {
      id: permissionId(pendingRequest.requestId) as PermissionListOutput[number]["id"],
      sessionID: session,
      action: elicitation ? "elicitation" : pendingRequest.requestType,
      resources: [],
      message: elicitation?.message || pendingRequest.payload.summary,
      metadata: {
        requestType: pendingRequest.requestType,
        options: elicitation
          ? [...ELICITATION_PERMISSION_OPTIONS]
          : pendingRequest.payload.options?.length
            ? pendingRequest.payload.options
            : DEFAULT_PERMISSION_OPTIONS.map(({ optionId, name }) => ({
                optionId,
                label: name,
              })),
      },
    };
  };
  const pendingRequestsForSession = async (session: string) => {
    const rawThreadId = threadId(session);
    if (ctx.sessions.get(session)?.remoteStarted === false) return [];
    const page = await ctx.input.client
      .threadRuntimeItemsPage({ threadId: rawThreadId, limit: 500 })
      .catch((error: unknown) => {
        if (
          error instanceof RemoteClientError &&
          error.status === 404 &&
          error.code === "thread_not_found"
        )
          return { items: [] };
        throw error;
      });
    const openRequestIds = new Set<string>();
    for (const item of page.items) {
      if (item.type !== RUNTIME_REQUEST_ITEM_TYPE || item.state !== "started") continue;
      const saved = record(item.payload);
      if (typeof saved.requestId !== "string") continue;
      openRequestIds.add(pendingRequestKey(rawThreadId, saved.requestId));
      const request = rememberPendingRequest(
        rawThreadId,
        saved.requestId,
        saved.requestType,
        saved.payload,
      );
      if (request?.requestType === "tool_user_input")
        ctx.input.recordFormRequest(rawThreadId, saved.requestId);
    }
    for (const [key, request] of ctx.pending) {
      if (request.threadId !== rawThreadId || openRequestIds.has(key)) continue;
      if (request.requestType === "tool_user_input")
        ctx.input.forgetFormRequest(rawThreadId, request.requestId);
      ctx.pending.delete(key);
    }
    return [...ctx.pending.entries()]
      .filter(([, request]) => request.threadId === rawThreadId)
      .map(([, request]) => request);
  };

  const pendingFormRequest = async (session: string, rawFormID: string) => {
    const rawThreadId = threadId(session);
    const requestId = requestIdFromFormId(rawFormID, rawThreadId);
    if (!requestId) return undefined;
    const key = pendingRequestKey(rawThreadId, requestId);
    let request = ctx.pending.get(key);
    if (!request) {
      await pendingRequestsForSession(session);
      request = ctx.pending.get(key);
    }
    if (!request || request.requestType !== "tool_user_input") return undefined;
    return request;
  };
  const formFromPending = (request: {
    requestId: string;
    threadId: string;
    requestType: z.infer<typeof canonicalRequestTypeSchema>;
    payload: RequestPayload;
  }) =>
    formInfoForRequest({
      type: "request.opened",
      threadId: request.threadId,
      requestId: request.requestId,
      requestType: request.requestType,
      payload: request.payload,
    });
  return {
    pendingRequestKey,
    rememberPendingRequest,
    permissionItemFor,
    pendingRequestsForSession,
    pendingFormRequest,
    formFromPending,
  };
}
