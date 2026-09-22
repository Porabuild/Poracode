import {
  remoteExperimentCommandResultSchema,
  remoteExperimentStateSchema,
} from "../../../contracts";
import { auditEvent, noAudit } from "../../auditKinds";
import { defineRoute } from "../helpers";
import { experimentCommandBodySchema } from "../routeBodies";
import type { RemoteHttpRouteContract } from "../types";

/**
 * Experiment authority routes (capabilities.experiments v1), composed only on
 * the embedded desktop backend that owns the local-shell experiment worktree
 * driver.
 *
 * - the state read is an ordinary `session:read` bearer read;
 * - the command route is an ordinary `session:operate` mutation under the
 *   command-id receipt, additionally gated on the documented mutation
 *   LOCALITY check (a direct loopback peer; a relay-proxied dial is refused by
 *   the shared relay-hop classifier). That check is not an authentication
 *   guarantee — an SSH forward or a co-located paired client can satisfy
 *   it — and custody/validation stays correct for any admitted caller.
 *
 * A helper/headless composition does not compose the authority: the read
 * answers 503, the command answers 501, and no capability is advertised.
 */
export const experimentsRoutes: readonly RemoteHttpRouteContract[] = [
  defineRoute({
    id: "experiment-state",
    method: "GET",
    path: "/api/experiments",
    auth: "bearer",
    scopes: ["session:read"],
    audit: noAudit("read"),
    request: { bodyKind: "empty" },
    response: {
      wireKind: "json",
      status: 200,
      jsonSchema: remoteExperimentStateSchema,
    },
  }),
  defineRoute({
    id: "experiment-command",
    method: "POST",
    path: "/api/experiments/{experimentId}/command",
    auth: "bearer",
    scopes: ["session:operate"],
    audit: auditEvent("mutate"),
    idempotency: "command-id-header",
    request: { bodyKind: "json", jsonSchema: experimentCommandBodySchema },
    response: {
      wireKind: "json",
      status: 200,
      jsonSchema: remoteExperimentCommandResultSchema,
    },
  }),
];
