import { EXPERIMENT_ROUTE_HANDLERS } from "./httpRouteHandlers.experiments";
import { OPS_ROUTE_HANDLERS } from "./httpRouteHandlers.ops";
import { ENVIRONMENT_MANAGEMENT_ROUTE_HANDLERS } from "./httpRouteHandlers.environments";
import { SESSION_ROUTE_HANDLERS } from "./httpRouteHandlers.session";
import type { HttpRouteHandlerTable } from "./httpRouteHandlers.shared";
import { THREAD_ROUTE_HANDLERS } from "./httpRouteHandlers.threads";
import { WORKSPACE_ROUTE_HANDLERS } from "./httpRouteHandlers.workspace";

export {
  auditRouteEvent,
  mapCheckpointRevertCompletedResponse,
  requirePathParam,
  type HttpRouteCall,
  type HttpRouteHandler,
  type HttpRouteHandlerTable,
} from "./httpRouteHandlers.shared";

/**
 * The complete HTTP handler table, keyed by the registry's CLOSED route-id
 * union. This is the structural drift gate: a registry route without a handler
 * here fails typecheck (missing property), and a handler for a route that is
 * not in the registry fails typecheck (excess property). Dispatch iterates the
 * registry's route contracts and looks handlers up by id, so an HTTP path that
 * is not registered can never reach a handler.
 */
export const ROUTE_HANDLERS: HttpRouteHandlerTable = {
  ...SESSION_ROUTE_HANDLERS,
  ...ENVIRONMENT_MANAGEMENT_ROUTE_HANDLERS,
  ...WORKSPACE_ROUTE_HANDLERS,
  ...THREAD_ROUTE_HANDLERS,
  ...EXPERIMENT_ROUTE_HANDLERS,
  ...OPS_ROUTE_HANDLERS,
};
