import {
  deviceHumanActionSchema,
  deviceAttachSchema,
  type DeviceInventory,
  type DeviceSession,
  type DeviceTarget,
} from "@/shared/deviceWorkspace";
import {
  REMOTE_PROTOCOL_VERSION_HEADER,
  REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
} from "@/shared/remote";
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
  | "device-create-duo"
  | "device-attach"
  | "device-adopt-session"
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

// "fold" joined the closed control-action enum in the current protocol.
// Inventory/attach stay readable by older paired clients, whose enum would
// reject the whole payload, so non-current peers get the same payload with
// the unknown action removed (their fold controls simply never appear).
function stripFoldForPeer(call: HttpRouteCall, target: DeviceTarget): DeviceTarget {
  if (call.req.headers[REMOTE_PROTOCOL_VERSION_HEADER] === REMOTE_PROTOCOL_VERSION_HEADER_VALUE)
    return target;
  if (!target.controls?.actions.includes("fold")) return target;
  return {
    ...target,
    controls: {
      ...target.controls,
      actions: target.controls.actions.filter((action) => action !== "fold"),
    },
  };
}

export const DEVICE_ROUTE_HANDLERS: Pick<HttpRouteHandlerTable, DeviceRouteId> = {
  "device-inventory": (call) =>
    deviceRequest(call, async (signal): Promise<DeviceInventory> => {
      const inventory = await call.ctx.options.deviceWorkspace!.discover(signal);
      return {
        ...inventory,
        devices: inventory.devices.map((device) => stripFoldForPeer(call, device)),
      };
    }),
  "device-create-duo": (call) =>
    deviceRequest(call, async () => {
      const principal = call.session!.sessionId;
      const authorize = () => {
        call.ctx.auth.authenticateSession(principal, ["session:read", "session:operate"]);
      };
      authorize();
      return call.ctx.options.deviceWorkspace!.createDuo(authorize);
    }),
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
      const session: DeviceSession = await call.ctx.options.deviceWorkspace!.attach(
        requirePathParam(call.params, "threadId"),
        principal,
        body,
        authorize,
      );
      return { ...session, device: stripFoldForPeer(call, session.device) };
    }),
  "device-adopt-session": (call) =>
    deviceRequest(call, async () => {
      const { auth } = call.ctx;
      const principal = call.session!.sessionId;
      const authorize = (control: boolean) => {
        auth.authenticateSession(
          principal,
          control ? ["session:read", "session:operate"] : ["session:read"],
        );
      };
      authorize(false);
      return {
        session: call.ctx.options.deviceWorkspace!.adoptAgentSession(
          requirePathParam(call.params, "threadId"),
          principal,
          authorize,
        ),
      };
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
      const threadId = requirePathParam(call.params, "threadId");
      const sessionId = requirePathParam(call.params, "sessionId");
      const controls = await call.ctx.options.deviceWorkspace!.action(
        threadId,
        call.session!.sessionId,
        sessionId,
        body,
        signal,
      );
      if (body.kind !== "control" || body.control.type !== "powerOff")
        call.ctx.options.deviceWorkspace!.renew(threadId, call.session!.sessionId, sessionId);
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
