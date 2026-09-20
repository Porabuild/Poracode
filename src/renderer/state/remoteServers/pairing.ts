import {
  PORACODE_REMOTE_PROTOCOL_VERSION,
  REMOTE_BROWSER_FORWARD_VERSION,
} from "@/shared/remote/protocol";
import { parsePairingCertFingerprint, parsePairingUrlParts } from "@/shared/remote/pairingUrl";
import type { StandaloneAttachInfo } from "@/shared/standaloneAttach";
import { msg } from "@lingui/core/macro";
import { filterKnownRemoteAccessScopes, REMOTE_OPERATOR_SCOPES } from "@/shared/remote";
import { i18n } from "@/renderer/i18n/i18n";
import { readBridge } from "@/renderer/bridge";
import { resetTruncateRecoveryEpoch } from "@/renderer/state/remote/truncateRecovery";
import { applyCachedSlashCommandCatalogs } from "./slashCommandCatalogs";
import { syncRemoteGitSummaries } from "./gitSummaries";
import { replaceCachedProjects } from "./projectCache";
import { syncRemoteGitStateSnapshot } from "./gitState";
import { syncRemoteAppRows } from "./appRows";
import {
  bumpRemoteServerGeneration,
  clearRemoteThreadAppliedSeqs,
  setRemoteServerSnapshotSeq,
} from "./eventSocketRegistry";
import { syncDesktopBrowserBridgeClient } from "./browserBridge";
import { nextRemoteHostUpdateSequence, setRemoteHostUpdateReconnectSeq } from "./connectionRefresh";
import { terminalCapabilitiesFromEnvironment } from "./terminalCapabilities";
import {
  deleteRefreshTokenFromVault,
  rememberRefreshToken,
  writeRefreshTokenToVault,
} from "./refreshTokens";
import type { SshConnectionConfig } from "@/shared/ssh";
import type {
  RemoteServerClientBindings,
  RemoteServersStoreApi,
  StartRemoteServerEventStream,
} from "./storeClient";
import type { RemoteServerRecord } from "./types";

/**
 * Standalone-attach session memo (in-memory only, never persisted): the
 * authenticated owner generation from main's HMAC-verified describe plus the
 * pairing-time check, and the desktopId paired from it. Genuine only at
 * describe+pairing: persisted bearers survive a same-root restart (the auth
 * store restores unexpired token hashes), so authentication alone never
 * proves continuous generation pin. No production reader enforces this memo
 * after pairing — continuous owner/epoch enforcement is a Gate 2 remainder.
 */
let standaloneOwnerGeneration: string | null = null;
let standaloneOwnerDesktopId: string | null = null;

export function getStandaloneOwnerGeneration(): string | null {
  return standaloneOwnerGeneration;
}

export function getStandaloneOwnerDesktopId(): string | null {
  return standaloneOwnerDesktopId;
}

export function __resetStandaloneOwnerForTest(): void {
  standaloneOwnerGeneration = null;
  standaloneOwnerDesktopId = null;
}

/**
 * Bounded shell-snapshot thread list (Gate 4 hazard #3): the client opts into
 * a first page plus cursor-paged continuations instead of transferring the
 * whole host list on every pair/refresh. 100 rows keeps each page response
 * inside the 64 KiB bound at realistic thread sizes (asserted by the
 * snapshots pagination acceptance test). Hosts without the capability ignore
 * the parameter and answer with the full list, which the client accepts.
 */
export const REMOTE_SHELL_THREAD_PAGE_LIMIT = 100;

export function normalizeEndpoint(raw: string): string {
  const trimmed = raw.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  // Normalize to an origin with a trailing slash so relative URLs resolve.
  return new URL(withScheme).toString();
}

/**
 * Gate 6 item 4.2: pinned server-certificate fingerprints, keyed by desktopId.
 * A pin is public data (a SHA-256 over the certificate the QR already
 * publishes), so localStorage beside the server records is the right custody.
 */
const CERT_PIN_STORAGE_KEY = "poracode.remoteServerCertPins";
const certPinsByDesktopId: Record<string, string> = (() => {
  try {
    const raw = localStorage.getItem(CERT_PIN_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object") {
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      );
    }
  } catch {
    // Corrupt pins degrade to "unpinned" — the platform TLS check still runs.
  }
  return {};
})();

function persistCertPins(): void {
  try {
    localStorage.setItem(CERT_PIN_STORAGE_KEY, JSON.stringify(certPinsByDesktopId));
  } catch {
    // Quota failures must not break pairing; the pin just stays memory-only.
  }
}

function rememberCertPin(desktopId: string, fingerprint: string): void {
  certPinsByDesktopId[desktopId] = fingerprint;
  persistCertPins();
}

export function forgetCertPin(desktopId: string): void {
  if (delete certPinsByDesktopId[desktopId]) persistCertPins();
}

export function certPinForDesktop(desktopId: string): string | undefined {
  return certPinsByDesktopId[desktopId];
}

/**
 * Gate 6 item 4.2: a scanned pairing value is either the bare credential or a
 * full pairing link that also carries the server's `#fp=sha256:<hex>`
 * certificate-fingerprint assertion. Returns both, whichever shape arrived.
 */
function splitPairingCredential(value: string): {
  readonly credential: string;
  readonly certFingerprint?: string;
} {
  const trimmed = value.trim();
  const parts = parsePairingUrlParts(trimmed);
  const certFingerprint = parsePairingCertFingerprint(trimmed) ?? undefined;
  return {
    credential: parts?.token ?? trimmed,
    ...(certFingerprint ? { certFingerprint } : {}),
  };
}

export interface PairingActionDeps extends RemoteServersStoreApi {
  readonly checkHostUpdateInBackground: RemoteServerClientBindings["checkHostUpdateInBackground"];
  readonly startRemoteServerEventStream: StartRemoteServerEventStream;
}

export function createPairingActions(deps: PairingActionDeps) {
  const { set, get, checkHostUpdateInBackground, startRemoteServerEventStream } = deps;

  const pairAtEndpoint = async (input: {
    endpoint: string;
    token: string;
    transport: NonNullable<RemoteServerRecord["transport"]>;
    /** Gate 6 item 4.2: the `#fp=` certificate assertion carried by the
     * scanned pairing link, when present. The client refuses a mismatch
     * before the one-time credential is spent. */
    certFingerprint?: string;
  }): Promise<RemoteServerRecord> => {
    const normalized = normalizeEndpoint(input.endpoint);
    const factory = get().clientFactory;
    const tokenResult = await factory(normalized).exchangePairingCredential({
      credential: input.token,
      // Gate 6 item 4.3 (S2): pairings carry scopes. This client requests
      // the operator preset by name (the pairing credential remains the
      // ceiling — the exchange rejects requests beyond it). A read-only
      // device UI would request REMOTE_VIEWER_SCOPES instead.
      scopes: REMOTE_OPERATOR_SCOPES,
      client: { label: "Poracode Desktop", deviceType: "desktop" },
      ...(input.certFingerprint ? { certFingerprint: input.certFingerprint } : {}),
    });
    const client = factory(normalized, tokenResult.accessToken);
    if (input.certFingerprint) client.setCertFingerprintPin(input.certFingerprint);
    const [environment, snapshot, agentStatuses] = await Promise.all([
      client.environment(),
      client.snapshot({ threadListPageLimit: REMOTE_SHELL_THREAD_PAGE_LIMIT }),
      client
        .agentStatuses({ omitSlashCommands: true })
        .then((statuses) => applyCachedSlashCommandCatalogs(normalized, statuses)),
    ]);
    let record: RemoteServerRecord = {
      desktopId: environment.desktopId,
      label: environment.label,
      remoteLabel: environment.label,
      endpoint: normalized,
      accessToken: tokenResult.accessToken,
      scopes: filterKnownRemoteAccessScopes(tokenResult.scopes),
      appVersion: environment.appVersion,
      browserForwardAvailable:
        environment.capabilities?.browserForward?.versions.includes(
          REMOTE_BROWSER_FORWARD_VERSION,
        ) ?? false,
      ...(environment.platform ? { platform: environment.platform } : {}),
      ...(environment.hostMode ? { hostMode: environment.hostMode } : {}),
      transport: input.transport,
    };
    try {
      const hostCapabilities = await client.describeHost();
      record = { ...record, hostCapabilities };
    } catch {
      // Fail closed: pairing still succeeds without a describe.
    }
    // Gate 6 item 4.6 (S6): persist the refresh half in the encrypted
    // vault so the 24-hour access token can rotate transparently after
    // this session. Older hosts without the refresh grant simply omit the
    // field — nothing to store then.
    if (tokenResult.refreshToken) {
      rememberRefreshToken(record.desktopId, tokenResult.refreshToken);
      void writeRefreshTokenToVault(record.desktopId, tokenResult.refreshToken);
    } else {
      void deleteRefreshTokenFromVault(record.desktopId);
    }
    // Gate 6 item 4.2: pin the QR-asserted certificate fingerprint (TOFU
    // anchored by the link the desktop itself rendered) beside the server
    // record. Re-pairing with a fresh QR replaces the pin.
    if (input.certFingerprint) rememberCertPin(record.desktopId, input.certFingerprint);
    setRemoteHostUpdateReconnectSeq(record.desktopId, nextRemoteHostUpdateSequence());
    bumpRemoteServerGeneration(record.desktopId);
    set((state) => ({
      servers: [...state.servers.filter((s) => s.desktopId !== record.desktopId), record],
      lastKnownProjects: replaceCachedProjects(
        state.lastKnownProjects,
        record.desktopId,
        snapshot.projects,
      ),
      runtime: {
        ...state.runtime,
        [record.desktopId]: {
          status: "online",
          projects: snapshot.projects,
          threads: snapshot.threads,
          agentStatuses,
        },
      },
    }));
    syncRemoteAppRows(record.desktopId, snapshot.projects, snapshot.threads);
    if (snapshot.gitSummariesByThread) {
      syncRemoteGitSummaries(record.desktopId, snapshot.gitSummariesByThread);
    }
    if (snapshot.gitState) syncRemoteGitStateSnapshot(record.desktopId, snapshot.gitState);
    setRemoteServerSnapshotSeq(record.desktopId, snapshot.snapshotSeq);
    // Pairing overwrites the seq baseline; stale per-thread marks from a
    // previous pairing of the same host must not refuse this snapshot.
    clearRemoteThreadAppliedSeqs(record.desktopId);
    resetTruncateRecoveryEpoch(record.desktopId);
    syncDesktopBrowserBridgeClient(get());
    await startRemoteServerEventStream(record, terminalCapabilitiesFromEnvironment(environment));
    checkHostUpdateInBackground(record);
    return record;
  };

  return {
    pairServer: ({ endpoint, token }: { endpoint: string; token: string }) => {
      const { credential, certFingerprint } = splitPairingCredential(token);
      return pairAtEndpoint({
        endpoint,
        token: credential,
        transport: { kind: "direct" },
        ...(certFingerprint ? { certFingerprint } : {}),
      });
    },

    ensureStandaloneOwner: async (attach: StandaloneAttachInfo) => {
      if (attach.remoteProtocolVersion !== PORACODE_REMOTE_PROTOCOL_VERSION) {
        throw new Error("Invalid standalone attach configuration.");
      }
      const parts = parsePairingUrlParts(attach.pairingUrl);
      if (!parts) throw new Error("Invalid standalone attach configuration.");
      const attachFingerprint = parsePairingCertFingerprint(attach.pairingUrl) ?? undefined;
      const record = await pairAtEndpoint({
        endpoint: attach.endpoint,
        token: parts.token,
        transport: { kind: "direct" },
        ...(attachFingerprint ? { certFingerprint: attachFingerprint } : {}),
      });
      standaloneOwnerGeneration = attach.ownerGeneration;
      standaloneOwnerDesktopId = record.desktopId;
      return record;
    },

    pairSshServer: async (connection: SshConnectionConfig) => {
      const launched = await readBridge().sshConnect({
        connection,
        issuePairingCredential: true,
      });
      if (!launched.pairingCredential) {
        await readBridge().sshDisconnect({ connectionId: connection.id });
        throw new Error(i18n._(msg`The remote server returned no pairing credential.`));
      }
      try {
        return await pairAtEndpoint({
          endpoint: launched.endpoint,
          token: launched.pairingCredential,
          transport: { kind: "ssh", connection },
        });
      } catch (error) {
        await readBridge().sshDisconnect({ connectionId: connection.id });
        throw error;
      }
    },
  };
}
