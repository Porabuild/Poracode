import { remoteExperimentCommandSchema } from "@/shared/contracts";
import { RemoteHttpError } from "../auth";
import {
  applyRemoteExperimentCommand,
  canonicalizeExperimentCommand,
  readRemoteExperimentState,
  requireExperimentAuthority,
} from "./experimentCommands";
import { writeJson } from "./httpResponses";
import {
  requirePathParam,
  requireRemoteCommandId,
  type HttpRouteHandlerTable,
} from "./httpRouteHandlers.shared";
import { readJsonBody } from "./requestBody";
import { isDirectLoopbackPeer } from "./security";

type ExperimentRouteId = "experiment-state" | "experiment-command";

/** Experiment authority route handlers (contract `experimentsRoutes`). */
export const EXPERIMENT_ROUTE_HANDLERS: Pick<HttpRouteHandlerTable, ExperimentRouteId> = {
  "experiment-state": (call) => {
    writeJson(call.res, 200, readRemoteExperimentState(call.ctx));
  },

  "experiment-command": async (call) => {
    const { ctx, req, res, url, params, session } = call;
    // Feature presence first: a helper/headless composition answers 501 and
    // advertises no capability. Then the documented mutation LOCALITY gate:
    // only a DIRECT loopback peer may mutate host-local candidate ownership.
    // The relay adapter dials this server over loopback, so a relayed pair is
    // excluded by the shared hop-marker classifier; a co-located paired client
    // or an SSH forward can still satisfy it. This is locality, NOT an
    // authentication guarantee — and every custody/validation rule below holds
    // for any admitted caller.
    requireExperimentAuthority(ctx);
    if (!isDirectLoopbackPeer(req)) {
      throw new RemoteHttpError(
        "experiments_desktop_local",
        "Experiment mutations are only accepted from a local client.",
        403,
      );
    }
    const commandId = requireRemoteCommandId(req, "experiment");
    const experimentId = requirePathParam(params, "experimentId");
    const body = await readJsonBody(req);
    const wire = remoteExperimentCommandSchema.parse({
      ...(typeof body === "object" && body !== null ? body : {}),
      experimentId,
    });
    const command = canonicalizeExperimentCommand(wire);
    const result = await applyRemoteExperimentCommand(ctx, command, {
      commandId,
      route: url.pathname,
      principalId: session?.sessionId ?? null,
      requestPayload: wire,
    });
    writeJson(res, 200, result);
  },
};
