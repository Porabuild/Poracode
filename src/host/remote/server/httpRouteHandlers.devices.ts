import { deviceHumanActionSchema, deviceAttachSchema } from "@/shared/deviceWorkspace";
import { DeviceWorkspaceError } from "@/host/devices/deviceProcess";
import { RemoteHttpError } from "../auth";
import { writeJson } from "./httpResponses";
import {
  requirePathParam,
  type HttpRouteCall,
  type HttpRouteHandlerTable,
} from "./httpRouteHandlers.shared";
import { readJsonBody } from "./requestBody";

type DeviceRouteId =
  | "device-inventory"
  | "device-attach"
  | "device-frame"
  | "device-inspect"
  | "device-action"
  | "device-detach";

export async function deviceRequest(
  call: HttpRouteCall,
  operation: (signal: AbortSignal) => Promise<unknown>,
): Promise<void> {
  call.res.setHeader("Cache-Control", "no-store");
  const abort = new AbortController();
  const cancel = () => abort.abort();
  call.res.once("close", cancel);
  try {
    if (!call.ctx.options.deviceWorkspace)
      throw new RemoteHttpError(
        "device_workspace_unavailable",
        "This host does not provide a device workspace.",
        501,
      );
    const result = await operation(abort.signal);
    if (!abort.signal.aborted) writeJson(call.res, 200, result);
  } catch (error) {
    if (error instanceof DeviceWorkspaceError)
      throw new RemoteHttpError(error.code, error.message, error.status);
    throw error;
  } finally {
    call.res.removeListener("close", cancel);
  }
}

export const DEVICE_ROUTE_HANDLERS: Pick<HttpRouteHandlerTable, DeviceRouteId> = {
  "device-inventory": (call) =>
    deviceRequest(call, (signal) => call.ctx.options.deviceWorkspace!.discover(signal)),
  "device-attach": (call) =>
    deviceRequest(call, async () => {
      const body = deviceAttachSchema.parse(await readJsonBody(call.req));
      const scopes =
        body.access === "control" || body.agentAccess === "control"
          ? (["session:read", "session:operate"] as const)
          : (["session:read"] as const);
      const { auth } = call.ctx;
      const principal = call.session!.sessionId;
      const authorize = () => {
        auth.authenticateSession(principal, scopes);
      };
      authorize();
      return call.ctx.options.deviceWorkspace!.attach(
        requirePathParam(call.params, "threadId"),
        principal,
        body,
        authorize,
      );
    }),
  "device-frame": (call) =>
    deviceRequest(call, (signal) => {
      const threadId = requirePathParam(call.params, "threadId");
      const sessionId = requirePathParam(call.params, "sessionId");
      call.ctx.options.deviceWorkspace!.renew(threadId, call.session!.sessionId, sessionId);
      return call.ctx.options.deviceWorkspace!.frame(
        threadId,
        call.session!.sessionId,
        sessionId,
        signal,
      );
    }),
  "device-inspect": (call) =>
    deviceRequest(call, (signal) =>
      call.ctx.options.deviceWorkspace!.inspect(
        requirePathParam(call.params, "threadId"),
        call.session!.sessionId,
        requirePathParam(call.params, "sessionId"),
        signal,
      ),
    ),
  "device-action": (call) =>
    deviceRequest(call, async (signal) => {
      const body = deviceHumanActionSchema.parse(await readJsonBody(call.req));
      const controls = await call.ctx.options.deviceWorkspace!.action(
        requirePathParam(call.params, "threadId"),
        call.session!.sessionId,
        requirePathParam(call.params, "sessionId"),
        body,
        signal,
      );
      return { version: 1, delivered: true, ...(controls ? { controls } : {}) };
    }),
  "device-detach": (call) =>
    deviceRequest(call, async () => {
      await call.ctx.options.deviceWorkspace!.detach(
        requirePathParam(call.params, "threadId"),
        call.session!.sessionId,
        requirePathParam(call.params, "sessionId"),
      );
      return { ok: true };
    }),
};
