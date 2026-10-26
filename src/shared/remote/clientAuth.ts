import { z } from "zod";
import {
  PORACODE_REMOTE_PROTOCOL_VERSION,
  REMOTE_STANDARD_SCOPES,
  filterKnownRemoteAccessScopes,
  remoteAccessTokenResultSchema,
  remoteEnvironmentDescriptorSchema,
  type RemoteAccessScope,
  type RemoteAccessTokenResult,
  type RemoteClientMetadata,
  type RemoteEnvironmentDescriptor,
} from "@/shared/remote";
import { parseResponse } from "./clientParse";
import { RemoteClientError } from "./clientErrors";
import { RemoteClientTransport } from "./clientTransport";
import { defaultClientMetadata, type RemoteTokenSnapshot } from "./clientTypes";

// Share rotation across clients for the same session: refresh values are single-use.
const tokenRefreshes = new Map<string, Promise<RemoteTokenSnapshot>>();

export abstract class RemoteClientAuth extends RemoteClientTransport {
  async environment(): Promise<RemoteEnvironmentDescriptor> {
    let raw: unknown;
    try {
      raw = await this.requestJson("/.well-known/poracode/environment");
    } catch (error) {
      if (!(error instanceof RemoteClientError) || error.status !== 404) throw error;
      raw = await this.requestJson("/.well-known/lightcode/environment");
    }
    // Pre-parse the protocol version with a loose schema so a mismatch (the
    // literal in the strict schema would otherwise dump a JSON ZodError) yields
    // a readable, branchable error instead.
    const version = z.object({ protocolVersion: z.unknown() }).safeParse(raw).data?.protocolVersion;
    if (version !== PORACODE_REMOTE_PROTOCOL_VERSION) {
      throw new RemoteClientError(
        "This app version is incompatible with that server. Update both to the same version.",
        409,
        "protocol_version_mismatch",
      );
    }
    const descriptor = parseResponse(remoteEnvironmentDescriptorSchema, raw, "environment");
    // The wire schema is lenient about advertised scopes (a newer server may
    // list scopes this build doesn't know); narrow to the usable set here.
    return {
      ...descriptor,
      auth: {
        ...descriptor.auth,
        scopes: filterKnownRemoteAccessScopes(descriptor.auth.scopes),
      },
    };
  }

  async exchangePairingCredential(input: {
    readonly credential: string;
    readonly scopes?: readonly RemoteAccessScope[];
    /**
     * Client metadata to register with the session. Defaults to a
     * navigator-derived value (mobile/browser). A desktop-as-client caller
     * passes e.g. `{ label, deviceType: "desktop" }` — see also
     * {@link RemoteDesktopClientOptions.clientMetadata}.
     */
    readonly client?: RemoteClientMetadata;
    /**
     * Gate 6 item 4.2: the leaf-certificate fingerprint the pairing QR asserts
     * (`#fp=sha256:<hex>`). When it can be checked — against the probed
     * server certificate, or against this client's stored pin when no probe
     * is available — a mismatch refuses pairing BEFORE the one-time
     * credential is sent, so the credential cannot be stolen by a MITM whose
     * link was cloned.
     */
    readonly certFingerprint?: string;
  }): Promise<RemoteAccessTokenResult> {
    const hadPin = this.pinnedCertFingerprint !== undefined;
    await this.refuseCertFingerprintMismatch(input.certFingerprint);
    if (input.certFingerprint) this.setCertFingerprintPin(input.certFingerprint);
    const result = parseResponse(
      remoteAccessTokenResultSchema,
      await this.requestJson("/oauth/token", {
        method: "POST",
        body: {
          grantType: "pairing-token",
          credential: input.credential,
          scopes: [...(input.scopes ?? REMOTE_STANDARD_SCOPES)],
          client: input.client ?? defaultClientMetadata(),
        },
      }),
      "pairing",
    );
    // Server-echoed granted scopes are lenient on the wire; narrow to the set
    // this build can act on.
    const narrowed = { ...result, scopes: filterKnownRemoteAccessScopes(result.scopes) };
    // First pair over a probe-capable transport: adopt the observed
    // certificate as this record's pin (TOFU anchored by the QR's own
    // fingerprint assertion) and hand it to the caller for persistence.
    const actual = await this.probeCertFingerprint();
    if (actual && !hadPin) {
      this.pinnedCertFingerprint = actual;
      this.onCertFingerprintValidated?.(actual);
    }
    return narrowed;
  }

  /**
   * Gate 6 item 4.6: exchanges the persisted refresh token for a fresh
   * 24-hour access token (the refresh value rotates server-side). Returns the
   * new tokens or null when this client has no lifecycle to refresh with.
   */
  override async refreshTokens(): Promise<RemoteTokenSnapshot | null> {
    const refreshToken = this.tokenLifecycle?.refreshToken();
    if (!refreshToken) return null;
    const key = `${this.endpoint}\0${refreshToken}`;
    let pending = tokenRefreshes.get(key);
    if (!pending) {
      pending = this.exchangeRefreshToken(refreshToken).finally(() => tokenRefreshes.delete(key));
      tokenRefreshes.set(key, pending);
    }
    const tokens = await pending;
    this.accessToken = tokens.accessToken;
    this.tokenLifecycle?.onTokensRefreshed(tokens);
    return tokens;
  }

  private async exchangeRefreshToken(refreshToken: string): Promise<RemoteTokenSnapshot> {
    const result = parseResponse(
      remoteAccessTokenResultSchema,
      await this.requestJson(
        "/oauth/token",
        { method: "POST", body: { grantType: "refresh_token", refreshToken } },
        // Never recurse into the refresh path from the refresh call itself.
        { isTokenRefresh: true },
      ),
      "token refresh",
    );
    const tokens: RemoteTokenSnapshot = {
      accessToken: result.accessToken,
      ...(result.refreshToken
        ? {
            refreshToken: result.refreshToken,
            ...(result.refreshTokenExpiresAt
              ? { refreshTokenExpiresAt: result.refreshTokenExpiresAt }
              : {}),
          }
        : {}),
    };
    return tokens;
  }
}
