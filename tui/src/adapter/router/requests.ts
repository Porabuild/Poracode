import { json, record } from "./helpers";
import { openCodeEvent } from "../events";
import {
  ELICITATION_PERMISSION_OPTIONS,
  elicitationReply,
  emptyFormElicitationPayload,
  formAnswerSchema,
  formDismissalForRequest,
  formInfoForRequest,
  formResponseForRequest,
} from "../forms";
import { permissionId, permissionRequestId, requestIdFromFormId, threadId } from "../ids";
import type { FormDetail, FormInfo, PermissionListOutput } from "@opencode/client";
import { z } from "zod";
import {
  canonicalRequestTypeSchema,
  requestPayloadSchema,
  RUNTIME_REQUEST_ITEM_TYPE,
  type RequestPayload,
} from "@/shared/contracts";
import { RemoteClientError } from "@/shared/remote/client";
import { DEFAULT_PERMISSION_OPTIONS, selectPermissionOption } from "../permissions";
import type { RouteArgs, RouterContext } from "./context";

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

/** Pending form + permission request routes. */
export async function handleRequestRoutes({
  ctx,
  method,
  path,
  readBody,
}: RouteArgs): Promise<Response | undefined> {
  const {
    input,
    pending,
    pendingRequestKey,
    permissionItemFor,
    pendingRequestsForSession,
    pendingFormRequest,
    formFromPending,
  } = ctx;

  const formReplyMatch = path.match(/^\/api\/session\/([^/]+)\/form\/([^/]+)\/reply$/u);
  if (formReplyMatch && method === "POST") {
    const session = decodeURIComponent(formReplyMatch[1]!);
    const formID = decodeURIComponent(formReplyMatch[2]!);
    const pendingRequest = await pendingFormRequest(session, formID);
    if (!pendingRequest)
      return json({ error: { code: "not_found", message: "Form not found" } }, 404);
    const body = record(await readBody());
    const answer = formAnswerSchema.parse(body.answer);
    const runtimeRequest = {
      type: "request.opened" as const,
      threadId: pendingRequest.threadId,
      requestId: pendingRequest.requestId,
      requestType: pendingRequest.requestType,
      payload: pendingRequest.payload,
    };
    const resolution = formResponseForRequest(runtimeRequest, answer);
    input.forgetFormRequest(pendingRequest.threadId, pendingRequest.requestId);
    try {
      await input.client.resolveRequest({
        threadId: pendingRequest.threadId,
        requestId: pendingRequest.requestId,
        method: "requestPermission",
        response: resolution.response,
      });
    } catch (error) {
      input.recordFormRequest(pendingRequest.threadId, pendingRequest.requestId);
      input.events.resync();
      throw error;
    }
    pending.delete(pendingRequestKey(pendingRequest.threadId, pendingRequest.requestId));
    input.events.emit(
      openCodeEvent(
        "form.replied",
        { id: formID as FormInfo["id"], sessionID: session, answer },
        { location: { directory: input.bootstrap.directory } },
      ),
    );
    return new Response(null, { status: 204 });
  }
  const sessionFormMatch = path.match(/^\/api\/session\/([^/]+)\/form$/u);
  if (sessionFormMatch && method === "GET") {
    const session = decodeURIComponent(sessionFormMatch[1]!);
    const requests = await pendingRequestsForSession(session);
    const data = requests.flatMap((pendingRequest) => {
      if (pendingRequest.requestType !== "tool_user_input") return [];
      const form = formFromPending(pendingRequest);
      return form ? [form] : [];
    });
    return json({ data });
  }
  const formMatch = path.match(/^\/api\/session\/([^/]+)\/form\/([^/]+)$/u);
  if (formMatch) {
    const session = decodeURIComponent(formMatch[1]!);
    const formID = decodeURIComponent(formMatch[2]!);
    const pendingRequest = await pendingFormRequest(session, formID);
    if (!pendingRequest)
      return json({ error: { code: "not_found", message: "Form not found" } }, 404);
    if (method === "GET") {
      const form = formFromPending(pendingRequest);
      return form
        ? json({ data: { ...form, state: { status: "pending" } } satisfies FormDetail })
        : json({ error: { code: "not_found", message: "Form not found" } }, 404);
    }
    if (method === "DELETE") {
      const runtimeRequest = {
        type: "request.opened" as const,
        threadId: pendingRequest.threadId,
        requestId: pendingRequest.requestId,
        requestType: pendingRequest.requestType,
        payload: pendingRequest.payload,
      };
      const resolution = formDismissalForRequest(runtimeRequest);
      input.forgetFormRequest(pendingRequest.threadId, pendingRequest.requestId);
      try {
        await input.client.resolveRequest({
          threadId: pendingRequest.threadId,
          requestId: pendingRequest.requestId,
          method: "requestPermission",
          response: resolution.response,
        });
      } catch (error) {
        input.recordFormRequest(pendingRequest.threadId, pendingRequest.requestId);
        input.events.resync();
        throw error;
      }
      pending.delete(pendingRequestKey(pendingRequest.threadId, pendingRequest.requestId));
      input.events.emit(
        openCodeEvent(
          "form.cancelled",
          { id: formID as FormInfo["id"], sessionID: session },
          { location: { directory: input.bootstrap.directory } },
        ),
      );
      return new Response(null, { status: 204 });
    }
  }
  const permissionMatch = path.match(/^\/api\/session\/([^/]+)\/permission\/([^/]+)\/reply$/u);
  if (permissionMatch && method === "POST") {
    const body = await readBody();
    const session = decodeURIComponent(permissionMatch[1]!);
    const rawThreadId = threadId(session);
    const openCodeRequestID = decodeURIComponent(permissionMatch[2]!);
    const resolvedRequestID = permissionRequestId(openCodeRequestID);
    const key = pendingRequestKey(rawThreadId, resolvedRequestID);
    const pendingRequest = pending.get(key);
    if (!pendingRequest) throw new Error("Permission request is no longer available");
    const decisionResult = z.enum(["once", "always", "reject"]).safeParse(body.decision);
    const decision = decisionResult.success ? decisionResult.data : "once";
    if (pendingRequest.elicitation) {
      // Binary accept/decline: "always" collapses to accept because there
      // is no persistent grant to record.
      const structured = emptyFormElicitationPayload(pendingRequest.payload);
      input.recordPermissionReply(
        pendingRequest.threadId,
        resolvedRequestID,
        decision === "reject" ? "reject" : "once",
      );
      await input.client.resolveRequest({
        threadId: pendingRequest.threadId,
        requestId: resolvedRequestID,
        method: "requestPermission",
        response: structured
          ? elicitationReply(structured, decision === "reject")
          : { action: decision === "reject" ? "decline" : "accept" },
      });
      pending.delete(key);
      return new Response(null, { status: 204 });
    }
    const optionId = selectPermissionOption(pendingRequest.options, decision);
    if (!optionId) throw new Error(`The permission does not offer ${decision}`);
    input.recordPermissionReply(pendingRequest.threadId, resolvedRequestID, decision);
    await input.client.resolveRequest({
      threadId: pendingRequest.threadId,
      requestId: resolvedRequestID,
      method: "requestPermission",
      response: { optionId },
    });
    pending.delete(key);
    return new Response(null, { status: 204 });
  }
  const permissionListMatch = path.match(/^\/api\/session\/([^/]+)\/permission$/u);
  if (permissionListMatch && method === "GET") {
    const session = decodeURIComponent(permissionListMatch[1]!);
    const requests = await pendingRequestsForSession(session);
    const output: PermissionListOutput = requests
      .filter(
        (pendingRequest) =>
          pendingRequest.requestType !== "tool_user_input" || pendingRequest.elicitation === true,
      )
      .map((pendingRequest) => permissionItemFor(session, pendingRequest));
    return json(output);
  }
  const permissionGetMatch = path.match(/^\/api\/session\/([^/]+)\/permission\/([^/]+)$/u);
  if (permissionGetMatch && method === "GET") {
    const session = decodeURIComponent(permissionGetMatch[1]!);
    const requests = await pendingRequestsForSession(session);
    const pendingRequest = requests.find(
      (value) => permissionId(value.requestId) === decodeURIComponent(permissionGetMatch[2]!),
    );
    if (!pendingRequest)
      return json({ error: { code: "not_found", message: "Permission request not found" } }, 404);
    return json({ data: permissionItemFor(session, pendingRequest) });
  }
  return undefined;
}
