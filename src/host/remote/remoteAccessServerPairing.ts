import {
  remoteAccessScopesForPreset,
  type RemoteAccessScopePreset,
  type RemoteAccessScope,
  type RemoteAccessTokenResult,
  type RemoteTokenExchangePayload,
} from "@/shared/remote";
import { isBrowserExtensionReachableEndpoint } from "@/shared/chromeSidebarProtocol";
import { buildPairingUrl, formatCertFingerprint } from "@/shared/remote/pairingUrl";
import { RemoteHttpError, RefreshTokenReuseError, MANAGED_RENDERER_ACCESS_TTL_MS } from "./auth";
import { REMOTE_AUDIT_LOG_VERSION, type RemoteAuditEvent } from "./server/auditLog";
import { requireRemoteAccessInfo, type RemoteAccessServerHost } from "./remoteAccessServerTypes";

/**
 * Gate 6 item 4.7 (S7): appends one structured audit line. The sink is
 * optional; audit failures never propagate into the request path (the file
 * sink contains its own I/O errors).
 */
export function recordAudit(
  host: RemoteAccessServerHost,
  kind: RemoteAuditEvent["kind"],
  input: { sessionId?: string; detail?: RemoteAuditEvent["detail"] } = {},
): void {
  host.options.audit?.record({
    v: REMOTE_AUDIT_LOG_VERSION,
    at: new Date().toISOString(),
    kind,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.detail ? { detail: input.detail } : {}),
  });
}

/**
 * Mints a fresh pairing URL, replacing the displayed QR credential. The
 * grant defaults to the operator preset (Gate 6 item 4.3); hosts offering a
 * read-only device pass `preset: "viewer"`.
 */
export function issuePairingUrl(
  host: RemoteAccessServerHost,
  label?: string,
  options?: { readonly preset?: RemoteAccessScopePreset },
): string {
  const info = requireRemoteAccessInfo(host);
  if (host.activePairingCredential) {
    host.auth.revokePairingCredential(host.activePairingCredential);
  }
  const issued = issuePresetPairingCredential(host, label, options?.preset);
  host.activePairingCredential = issued.credential;
  const pairingUrl = mintPairingUrl(host, info.httpBaseUrl, issued.credential);
  host.info = { ...info, pairingUrl, pairingExpiresAt: issued.expiresAt };
  notifyPairingChanged(host);
  return pairingUrl;
}

/**
 * One-time local-control grants coexist without replacing the displayed QR.
 * Accepts the same scope presets as {@link issuePairingUrl}.
 */
export function issueIndependentPairingUrl(
  host: RemoteAccessServerHost,
  label?: string,
  options?: { readonly preset?: RemoteAccessScopePreset },
): string {
  return issueIndependentPairingGrant(host, { ...options, ...(label ? { label } : {}) }).pairingUrl;
}

export function issueIndependentPairingGrant(
  host: RemoteAccessServerHost,
  input: {
    readonly preset?: RemoteAccessScopePreset;
    readonly scopes?: readonly RemoteAccessScope[];
    readonly label?: string;
    readonly ttlMs?: number;
  },
) {
  if (host.stopping) throw new Error("Remote access server is stopping.");
  const info = requireRemoteAccessInfo(host);
  const issued = issuePresetPairingCredential(host, input.label, input.preset, input);
  return {
    id: issued.id,
    pairingUrl: mintPairingUrl(host, info.httpBaseUrl, issued.credential),
    expiresAt: issued.expiresAt,
    scopes: [...issued.scopes],
    ...(issued.label ? { label: issued.label } : {}),
  };
}

/**
 * Mints the co-located managed renderer's local attach credential (V5 plan
 * 2.5 completion): a fresh single-use operator pairing credential whose URL
 * is built on the LOOPBACK endpoint, so the desktop renderer can always
 * attach to its own server without that server being discoverable. Never
 * rotates the displayed QR credential (`activePairingCredential`) and never
 * republishes pairing info — reachable, not advertised. `null` once stopping
 * or before the listener is ready.
 *
 * `browserExtension` mints for the Chrome sidebar: it returns `null` before
 * issuing anything when no plain-http loopback endpoint is available (TLS or
 * interface-specific binds), because the extension could never use it, and the credential
 * expires quickly since the sidebar exchanges it immediately.
 */
export function mintLoopbackRendererCredential(
  host: RemoteAccessServerHost,
  options?: { readonly browserExtension?: boolean },
): {
  endpoint: string;
  pairingUrl: string;
  expiresAt: string;
} | null {
  if (host.stopping || !host.info) return null;
  const endpoint = host.info.loopbackHttpBaseUrl ?? host.info.localHttpBaseUrl;
  if (options?.browserExtension && !isBrowserExtensionReachableEndpoint(endpoint)) return null;
  const issued = options?.browserExtension
    ? issuePresetPairingCredential(host, "Browser extension", undefined, {
        ttlMs: BROWSER_EXTENSION_PAIRING_TTL_MS,
      })
    : // One credential per desktop window: its session is memory-only, so an
      // app restart cannot write another orphan into remote-access-auth.json.
      // The session's access TTL covers the host process's whole uptime (see
      // MANAGED_RENDERER_ACCESS_TTL_MS): a co-located window on the loopback
      // gate never meets an expiry mid-session, so the 24-hour rotation and
      // its renewal ladder stay out of the desktop's own leg entirely.
      issuePresetPairingCredential(host, "Managed renderer", undefined, {
        ephemeral: true,
        sessionTtlMs: MANAGED_RENDERER_ACCESS_TTL_MS,
      });
  const fingerprint = host.tls?.fingerprint;
  return {
    endpoint,
    pairingUrl: buildPairingUrl({
      httpBaseUrl: endpoint,
      credential: issued.credential,
      ...(fingerprint ? { certFingerprint: formatCertFingerprint(fingerprint) } : {}),
    }),
    expiresAt: issued.expiresAt,
  };
}

/** The sidebar redeems its credential within seconds of the bridge reply. */
const BROWSER_EXTENSION_PAIRING_TTL_MS = 60_000;

export function issuePresetPairingCredential(
  host: RemoteAccessServerHost,
  label: string | undefined,
  preset?: RemoteAccessScopePreset,
  options?: {
    readonly ttlMs?: number;
    readonly scopes?: readonly RemoteAccessScope[];
    readonly ephemeral?: boolean;
    readonly sessionTtlMs?: number;
  },
) {
  const scopes = options?.scopes ?? (preset ? remoteAccessScopesForPreset(preset) : undefined);
  const issued = host.auth.issuePairingCredential({
    ...(label ? { label } : {}),
    ...(scopes ? { scopes } : {}),
    ...(options?.ttlMs ? { ttlMs: options.ttlMs } : {}),
    ...(options?.ephemeral ? { ephemeral: true } : {}),
    ...(options?.sessionTtlMs !== undefined ? { sessionTtlMs: options.sessionTtlMs } : {}),
  });
  // Gate 6 item 4.7 (S7): every issued (or rotated) pairing credential is an
  // audited event. Revoked superseded credentials ride the same line.
  recordAudit(host, "pair", {
    detail: {
      ...(label ? { label } : {}),
      ...(preset ? { preset } : {}),
      scopes: issued.scopes.join(" "),
    },
  });
  return issued;
}

export function exchangePairingCredential(
  host: RemoteAccessServerHost,
  input: RemoteTokenExchangePayload,
): RemoteAccessTokenResult {
  if (input.grantType === "refresh_token") {
    if (!input.refreshToken) {
      throw new RemoteHttpError("invalid_refresh_token", "Invalid refresh token.", 401);
    }
    try {
      const refreshed = host.auth.refreshAccessToken({ refreshToken: input.refreshToken });
      recordAudit(host, "token_exchange", {
        detail: {
          grant: "refresh_token",
          scopes: refreshed.scopes.join(" "),
        },
      });
      return refreshed;
    } catch (error) {
      if (error instanceof RefreshTokenReuseError) {
        recordAudit(host, "refresh_reuse", {
          sessionId: error.sessionId,
          detail: { grant: "refresh_token" },
        });
        try {
          host.revokeAccessSession(error.sessionId);
        } catch (revocationError) {
          console.warn("[remote] failed to revoke reused refresh session:", revocationError);
        }
      }
      throw error;
    }
  }
  if (!input.credential) {
    throw new RemoteHttpError("invalid_pairing_token", "Invalid pairing token.", 401);
  }
  const result = host.auth.exchangePairingCredential({
    credential: input.credential,
    ...(input.scopes ? { scopes: input.scopes } : {}),
    ...(input.client ? { client: input.client } : {}),
  });
  recordAudit(host, "token_exchange", {
    detail: {
      grant: "pairing-token",
      scopes: result.scopes.join(" "),
      ...(input.client?.label ? { clientLabel: input.client.label } : {}),
      ...(input.client?.deviceType ? { deviceType: input.client.deviceType } : {}),
    },
  });
  // Independent/managed grants do not consume the displayed Settings QR.
  if (input.credential === host.activePairingCredential) issuePairingUrl(host, "Automatic pairing");
  return result;
}

export function notifyPairingChanged(host: Pick<RemoteAccessServerHost, "options">): void {
  try {
    host.options.onPairingChanged?.();
  } catch (error) {
    console.warn("[poracode] failed to notify desktop after pairing state changed:", error);
  }
}

export function mintPairingUrl(
  host: RemoteAccessServerHost,
  httpBaseUrl: string,
  credential: string,
): string {
  const pairingAppUrl = host.options.pairingAppUrl ?? host.options.devWebAppUrl;
  const fingerprint = host.tls?.fingerprint;
  return buildPairingUrl({
    httpBaseUrl,
    credential,
    ...(pairingAppUrl ? { pairingAppUrl } : {}),
    ...(fingerprint ? { certFingerprint: formatCertFingerprint(fingerprint) } : {}),
  });
}
