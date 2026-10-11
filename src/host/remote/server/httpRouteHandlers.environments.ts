import type { EnvironmentManagementRouteId } from "@/shared/remote/contract/routes/environments";
import {
  createEnvironmentManagementHandlers,
  type EnvironmentManagementHandlers,
} from "../environments/environmentManagement";
import { RemoteHttpError } from "../auth";
import type { RemoteServerContext } from "./context";
import type { HttpRouteHandler, HttpRouteHandlerTable } from "./httpRouteHandlers.shared";

// One adapter per server context; neither credentials nor request state are
// retained here. The host composition owns both runtime and proxy lifetimes.
const handlersByContext = new WeakMap<RemoteServerContext, EnvironmentManagementHandlers>();

function handlersFor(ctx: RemoteServerContext): EnvironmentManagementHandlers {
  const cached = handlersByContext.get(ctx);
  if (cached) return cached;
  const runtime = ctx.options.environmentManagement;
  if (!runtime) {
    throw new RemoteHttpError(
      "environment_management_unavailable",
      "Server-owned environments are not available on this host.",
      503,
    );
  }
  const handlers = createEnvironmentManagementHandlers({
    runtime,
    tickets: ctx.requireEnvironmentProxyGateway(),
  });
  handlersByContext.set(ctx, handlers);
  return handlers;
}

function dispatch(routeId: EnvironmentManagementRouteId): HttpRouteHandler {
  return (call) => {
    const handler = handlersFor(call.ctx)[routeId];
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    const onResponseClose = (): void => {
      if (!call.res.writableFinished) abort();
    };
    call.req.once("aborted", abort);
    call.res.once("close", onResponseClose);
    if (call.req.aborted || call.res.destroyed) abort();
    return Promise.resolve()
      .then(() => handler({ ...call, signal: controller.signal }))
      .finally(() => {
        call.req.off("aborted", abort);
        call.res.off("close", onResponseClose);
      });
  };
}

export const ENVIRONMENT_MANAGEMENT_ROUTE_HANDLERS: Pick<
  HttpRouteHandlerTable,
  EnvironmentManagementRouteId
> = {
  "environment-list": dispatch("environment-list"),
  "environment-create": dispatch("environment-create"),
  "environment-get": dispatch("environment-get"),
  "environment-update": dispatch("environment-update"),
  "environment-delete": dispatch("environment-delete"),
  "environment-connect": dispatch("environment-connect"),
  "environment-disconnect": dispatch("environment-disconnect"),
  "environment-pairing": dispatch("environment-pairing"),
  "environment-upgrade": dispatch("environment-upgrade"),
  "environment-websocket-ticket": dispatch("environment-websocket-ticket"),
  "environment-trust-probe": dispatch("environment-trust-probe"),
  "environment-trust-accept": dispatch("environment-trust-accept"),
  "environment-adopt-legacy": dispatch("environment-adopt-legacy"),
};
