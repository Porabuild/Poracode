import type { EnvironmentPublicProjection } from "@/shared/environments";
import {
  remoteEnvironmentAdoptLegacyBodySchema,
  remoteEnvironmentCreateBodySchema,
  remoteEnvironmentExpectedRevisionBodySchema,
  remoteEnvironmentListResultSchema,
  remoteEnvironmentPairingResultSchema,
  remoteEnvironmentResultSchema,
  remoteEnvironmentTrustAcceptBodySchema,
  remoteEnvironmentTrustProbeResultSchema,
  remoteEnvironmentUpdateBodySchema,
  type RemoteEnvironmentAdoptLegacyBody,
  type RemoteEnvironmentCreateBody,
  type RemoteEnvironmentExpectedRevisionBody,
  type RemoteEnvironmentPairingResult,
  type RemoteEnvironmentTrustAcceptBody,
  type RemoteEnvironmentTrustProbeResult,
  type RemoteEnvironmentUpdateBody,
} from "./contract/environmentSchemas";
import { remoteOkResponseSchema } from "./contract/helpers";
import { RemoteClientWorkspaceApi } from "./clientApiWorkspace";
import { parseResponse } from "./clientParse";
import { remoteWebSocketTicketResultSchema } from "./protocol/core";
import type { RemoteWebSocketTicketResult } from "./protocol/core";

/**
 * C1 management surface (ADR §5 route matrix). Every method dispatches through
 * the shared `requestJson`, so whatever authority the concrete client is bound
 * to owns the call: a direct/ssh client manages its host, and an environment
 * client manages the child host's registry through the one-hop parent proxy
 * under the child grant. There is deliberately no client-side authority guard:
 * the bound endpoint + bearer are the authority, and a child host without the
 * manage scopes answers its own 403 `missing_scope` (R4).
 *
 * Parent-authority management always runs on the parent client the renderer
 * holds; the environment client never receives the parent grant for these
 * paths beyond the proxy-only parent header it attaches to every dispatch.
 */
export abstract class RemoteClientEnvironmentsApi extends RemoteClientWorkspaceApi {
  async listEnvironments(): Promise<readonly EnvironmentPublicProjection[]> {
    const result = parseResponse(
      remoteEnvironmentListResultSchema,
      await this.requestJson("/api/environments"),
      "environment list",
    );
    return result.environments;
  }

  async getEnvironment(environmentId: string): Promise<EnvironmentPublicProjection> {
    return this.environmentResult(environmentId, "");
  }

  async createEnvironment(body: RemoteEnvironmentCreateBody): Promise<EnvironmentPublicProjection> {
    const parsed = parseResponse(remoteEnvironmentCreateBodySchema, body, "environment create");
    return this.environmentResult(null, "", {
      method: "POST",
      body: parsed,
      mutation: true,
    });
  }

  async updateEnvironment(
    environmentId: string,
    body: RemoteEnvironmentUpdateBody,
  ): Promise<EnvironmentPublicProjection> {
    const parsed = parseResponse(remoteEnvironmentUpdateBodySchema, body, "environment update");
    return this.environmentResult(environmentId, "", {
      method: "POST",
      body: parsed,
      mutation: true,
    });
  }

  async deleteEnvironment(
    environmentId: string,
    body: RemoteEnvironmentExpectedRevisionBody,
  ): Promise<void> {
    const parsed = parseResponse(
      remoteEnvironmentExpectedRevisionBodySchema,
      body,
      "environment delete",
    );
    parseResponse(
      remoteOkResponseSchema,
      await this.requestJson(environmentPath(environmentId, "delete"), {
        method: "POST",
        body: parsed,
        mutation: true,
      }),
      "environment delete",
    );
  }

  async connectEnvironment(environmentId: string): Promise<EnvironmentPublicProjection> {
    return this.environmentResult(environmentId, "connect", { method: "POST", mutation: true });
  }

  async disconnectEnvironment(environmentId: string): Promise<EnvironmentPublicProjection> {
    return this.environmentResult(environmentId, "disconnect", { method: "POST", mutation: true });
  }

  async pairEnvironment(environmentId: string): Promise<RemoteEnvironmentPairingResult["pairing"]> {
    const result = parseResponse(
      remoteEnvironmentPairingResultSchema,
      await this.requestJson(environmentPath(environmentId, "pairing"), {
        method: "POST",
        mutation: true,
      }),
      "environment pairing",
    );
    return result.pairing;
  }

  async upgradeEnvironment(
    environmentId: string,
    body: RemoteEnvironmentExpectedRevisionBody,
  ): Promise<EnvironmentPublicProjection> {
    const parsed = parseResponse(
      remoteEnvironmentExpectedRevisionBodySchema,
      body,
      "environment upgrade",
    );
    return this.environmentResult(environmentId, "upgrade", {
      method: "POST",
      body: parsed,
      mutation: true,
    });
  }

  /** Mints the parent environment-bound upgrade ticket (`parentTicket`). */
  async environmentWebSocketTicket(environmentId: string): Promise<RemoteWebSocketTicketResult> {
    return parseResponse(
      remoteWebSocketTicketResultSchema,
      await this.requestJson(environmentPath(environmentId, "websocket-ticket"), {
        method: "POST",
      }),
      "environment websocket ticket",
    );
  }

  /** Opens a network dial but writes nothing; not a mutation. */
  async probeEnvironmentTrust(environmentId: string): Promise<RemoteEnvironmentTrustProbeResult> {
    return parseResponse(
      remoteEnvironmentTrustProbeResultSchema,
      await this.requestJson(environmentPath(environmentId, "trust-probe"), { method: "POST" }),
      "environment trust probe",
    );
  }

  async acceptEnvironmentTrust(
    environmentId: string,
    body: RemoteEnvironmentTrustAcceptBody,
  ): Promise<EnvironmentPublicProjection> {
    const parsed = parseResponse(
      remoteEnvironmentTrustAcceptBodySchema,
      body,
      "environment trust accept",
    );
    return this.environmentResult(environmentId, "trust-accept", {
      method: "POST",
      body: parsed,
      mutation: true,
    });
  }

  async adoptLegacyEnvironment(
    environmentId: string,
    body: RemoteEnvironmentAdoptLegacyBody,
  ): Promise<EnvironmentPublicProjection> {
    const parsed = parseResponse(
      remoteEnvironmentAdoptLegacyBodySchema,
      body,
      "environment adopt-legacy",
    );
    return this.environmentResult(environmentId, "adopt-legacy", {
      method: "POST",
      body: parsed,
      mutation: true,
    });
  }

  private async environmentResult(
    environmentId: string | null,
    suffix: string,
    init: {
      readonly method?: "GET" | "POST";
      readonly body?: unknown;
      readonly mutation?: true;
    } = {},
  ): Promise<EnvironmentPublicProjection> {
    const path =
      environmentId === null ? "/api/environments" : environmentPath(environmentId, suffix);
    return parseResponse(
      remoteEnvironmentResultSchema,
      await this.requestJson(path, init),
      "environment",
    ).environment;
  }
}

function environmentPath(environmentId: string, suffix: string): string {
  const base = `/api/environments/${encodeURIComponent(environmentId)}`;
  return suffix ? `${base}/${suffix}` : base;
}
