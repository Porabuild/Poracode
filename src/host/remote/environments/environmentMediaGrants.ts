import { RemoteHttpError } from "../auth";
import { ENVIRONMENT_USE_SCOPES } from "@/shared/environments";
import { mediaTicketSchema, type EnvironmentMediaTicketResult } from "@/shared/remote/media";
import { PlaybackGrants } from "../server/playbackGrants";
import { readChildMediaLease } from "./environmentMediaLease";
import type { EnvironmentProxySessionAuthority, EnvironmentProxyTarget } from "./types";
import type { EnvironmentProxyLegs } from "./environmentProxyLegs";

/** Owns parent file-grant authority and lifetime; data-plane proxy legs remain in the gateway. */
export class EnvironmentMediaGrants {
  private readonly grants = new PlaybackGrants<{
    environmentId: string;
    generation: number;
    childDesktopId: string;
    childTicket: string;
  }>();
  constructor(
    private readonly authority: EnvironmentProxySessionAuthority,
    private readonly targetFor: (environmentId: string) => EnvironmentProxyTarget,
    private readonly legs: EnvironmentProxyLegs,
  ) {}
  read(ticket: string) {
    return this.grants.read(ticket);
  }
  revokeSession(sessionId: string) {
    this.grants.revokeSession(sessionId);
  }
  clear() {
    this.grants.clear();
  }
  /** Parent authorization covers only this child's already file-scoped grant. */
  async mintMediaTicket(input: {
    parentAccessToken: string;
    environmentId: string;
    childTicket: string;
  }): Promise<EnvironmentMediaTicketResult> {
    const session = this.authority.authenticateBearerToken(
      input.parentAccessToken,
      ENVIRONMENT_USE_SCOPES,
    );
    const target = this.targetFor(input.environmentId);
    target.assertCurrent();
    const childExpiry = await this.childMediaLease(target, session.sessionId, input.childTicket);
    target.assertCurrent();
    if (target.invalidation.aborted) throw this.invalidMediaTicket();
    const current = this.authority.authenticateBearerToken(
      input.parentAccessToken,
      ENVIRONMENT_USE_SCOPES,
    );
    if (current.sessionId !== session.sessionId) throw this.invalidMediaTicket();
    let ticket = "";
    const onInvalidation = () => this.grants.release(ticket, session.sessionId);
    const result = this.grants.issue(
      {
        environmentId: input.environmentId,
        generation: target.generation,
        childDesktopId: target.childDesktopId,
        childTicket: mediaTicketSchema.parse(input.childTicket),
      },
      session.sessionId,
      Math.min(current.expiresAtMs, childExpiry),
      () => target.invalidation.removeEventListener("abort", onInvalidation),
    );
    ticket = result.ticket;
    target.invalidation.addEventListener("abort", onInvalidation, { once: true });
    if (target.invalidation.aborted) {
      onInvalidation();
      throw this.invalidMediaTicket();
    }
    return result;
  }

  async renewMediaTicket(input: {
    parentAccessToken: string;
    environmentId: string;
    ticket: string;
  }): Promise<EnvironmentMediaTicketResult> {
    const session = this.authority.authenticateBearerToken(
      input.parentAccessToken,
      ENVIRONMENT_USE_SCOPES,
    );
    const grant = this.grants.read(input.ticket);
    if (grant.sessionId !== session.sessionId || grant.value.environmentId !== input.environmentId)
      throw this.invalidMediaTicket();
    const target = this.targetFor(input.environmentId);
    if (
      target.generation !== grant.value.generation ||
      target.childDesktopId !== grant.value.childDesktopId
    )
      throw this.invalidMediaTicket();
    const childExpiry = await this.childMediaLease(
      target,
      session.sessionId,
      grant.value.childTicket,
      grant.signal,
    );
    target.assertCurrent();
    if (target.invalidation.aborted) throw this.invalidMediaTicket();
    const current = this.authority.authenticateBearerToken(
      input.parentAccessToken,
      ENVIRONMENT_USE_SCOPES,
    );
    if (current.sessionId !== grant.sessionId) throw this.invalidMediaTicket();
    // Re-read after the child round trip: release/revoke/expiry cannot be undone by a late result.
    return this.grants.renew(
      input.ticket,
      current.sessionId,
      Math.min(current.expiresAtMs, childExpiry),
    );
  }

  private invalidMediaTicket() {
    return new RemoteHttpError("invalid_media_ticket", "The media preview has expired.", 401);
  }

  private async childMediaLease(
    target: EnvironmentProxyTarget,
    sessionId: string,
    ticket: string,
    grantSignal?: AbortSignal,
  ) {
    const leg = this.legs.begin(sessionId, target.environmentId, target);
    const leases = this.legs.admit(sessionId, "bulk", leg);
    const abort = () => leg.controller.abort();
    grantSignal?.addEventListener("abort", abort, { once: true });
    if (grantSignal?.aborted) abort();
    try {
      target.assertCurrent();
      return await readChildMediaLease({
        port: target.remotePort,
        ticket: mediaTicketSchema.parse(ticket),
        agent: this.legs.agentFor(target),
        signal: leg.controller.signal,
      });
    } finally {
      grantSignal?.removeEventListener("abort", abort);
      this.legs.end(leg, leases);
    }
  }

  releaseMediaTicket(input: {
    parentAccessToken: string;
    environmentId: string;
    ticket: string;
  }): void {
    const session = this.authority.authenticateBearerToken(
      input.parentAccessToken,
      ENVIRONMENT_USE_SCOPES,
    );
    // Release is idempotent, but cannot retire another session's/environment's grant.
    try {
      const grant = this.grants.read(input.ticket);
      if (grant.value.environmentId === input.environmentId)
        this.grants.release(input.ticket, session.sessionId);
    } catch (error) {
      if (!(error instanceof RemoteHttpError) || error.code !== "invalid_media_ticket") throw error;
    }
  }
}
