import { msg } from "@lingui/core/macro";
import { toast } from "@heroui/react";
import { friendlyError, msg as sharedMsg } from "@/shared/messages";
import {
  isRemoteBoundedReadProtocolError,
  isRemoteTransportFailure,
  type RemoteDesktopClient,
} from "@/shared/remote/client";
import { i18n } from "@/renderer/i18n/i18n";
import { resetTruncateReloadBackoff } from "@/renderer/state/remote/truncateRecovery";
import { syncDesktopBrowserBridgeClient } from "./browserBridge";
import { environmentSessionForServer } from "./environmentSessions";
import { remoteConnectionKey } from "./types";
import {
  nextRemoteHostUpdateSequence,
  remoteHostUpdateRequestSeq,
  setRemoteHostUpdateRequestSeq,
} from "./connectionRefresh";
import {
  connectionRefreshSubject,
  deleteRefreshTokenFromVault,
  ensureConnectionIncarnation,
  ownsConnectionIncarnation,
  refreshTokenForDesktop,
  rememberRefreshToken,
  writeRefreshTokenToVault,
} from "./refreshTokens";
import type { RemoteServerRecord, RemoteServersState } from "./types";
import type { TerminalConnectionCapabilities } from "./terminalCapabilities";

export type RemoteServersStoreSet = (
  partial:
    | RemoteServersState
    | Partial<RemoteServersState>
    | ((state: RemoteServersState) => RemoteServersState | Partial<RemoteServersState>),
) => void;

export type RemoteServersStoreGet = () => RemoteServersState;

export interface RemoteServersStoreApi {
  readonly set: RemoteServersStoreSet;
  readonly get: RemoteServersStoreGet;
}

export function createRemoteServerClientBindings(
  api: RemoteServersStoreApi,
  certPinForDesktop: (desktopId: string) => string | undefined,
) {
  const { set, get } = api;

  const setRemoteServerFailure = (
    desktopId: string,
    status: "offline" | "error",
    message: string,
  ) => {
    const previous = get().runtime[desktopId]?.status;
    set((state) => {
      const current = state.runtime[desktopId];
      if (!current) return {};
      if (current.status === status && current.message === message) return state;
      return {
        runtime: { ...state.runtime, [desktopId]: { ...current, status, message } },
      };
    });
    // Offline/error drops re-arm unknown-checkpoint reload budgets without
    // clearing installed authoritative baselines (transport flap, not a
    // server restart).
    if (previous !== status) resetTruncateReloadBackoff(desktopId);
    syncDesktopBrowserBridgeClient(get());
  };

  /** Surface a remote-server action failure without ever rejecting: toast it
   * and reflect the server's runtime status/message so the sidebar shows it
   * offline/errored. The renderer's global unhandledrejection handler would
   * otherwise crash-screen on any stray rejection from a `void action(...)`. */
  const reportRemoteServerError = (desktopId: string, error: unknown, fallback: string) => {
    // A bounded-read protocol violation is a typed contract failure whose SDK
    // prose is English-only: the caller's localized fallback is the message,
    // and the host stays reachable (error, never offline).
    const protocolViolation = isRemoteBoundedReadProtocolError(error);
    const message = protocolViolation ? fallback : friendlyError(error) || fallback;
    toast.danger(message);
    setRemoteServerFailure(
      desktopId,
      !protocolViolation && isRemoteTransportFailure(error) ? "offline" : "error",
      message,
    );
  };

  /**
   * Builds a client for a server record with the Gate 6 lifecycle attached:
   * the refresh-token lifecycle (4.6) reads the in-memory token and
   * persists rotations back to the encrypted vault, and the pinned
   * certificate fingerprint (4.2) is enforced by the client's transport
   * hook when one is available. Factory-created clients are wrapped here
   * so every call site gets the same behavior.
   */
  const clientForServer = (server: RemoteServerRecord): RemoteDesktopClient => {
    if (server.transport?.kind === "environment") {
      const session = environmentSessionForServer(server);
      if (!session) {
        throw new Error(
          i18n._(msg`The paired server that owns this environment is not connected.`),
        );
      }
      return session.client;
    }
    const client = get().clientFactory(server.endpoint, server.accessToken);
    // The refresh grant is per connection, like every other session map. For
    // direct/ssh records the connection key equals the host identity, so v1
    // `refresh.<desktopId>` slots keep their exact key.
    const connectionKey = remoteConnectionKey(server);
    // One legitimate incarnation per connection record, shared by every live
    // client of this connection (including the long-lived parent session), so
    // clients never revoke each other's valid rotation. A record removed during
    // this client's life has no incarnation: its callback stays inert.
    const present = get().servers.some((entry) => remoteConnectionKey(entry) === connectionKey);
    const incarnation = present ? ensureConnectionIncarnation(connectionKey) : undefined;
    client.setTokenLifecycle({
      refreshToken: () => refreshTokenForDesktop(connectionKey),
      onTokensRefreshed: (tokens) => {
        // A delayed rotation from a removed or re-paired connection can neither
        // resurrect a deleted grant nor overwrite a freshly paired one.
        if (incarnation === undefined || !ownsConnectionIncarnation(connectionKey, incarnation)) {
          return;
        }
        if (tokens.refreshToken) {
          rememberRefreshToken(connectionKey, tokens.refreshToken);
          void writeRefreshTokenToVault(
            connectionRefreshSubject(connectionKey),
            tokens.refreshToken,
            incarnation,
          );
        } else {
          void deleteRefreshTokenFromVault(connectionRefreshSubject(connectionKey));
        }
      },
    });
    const pin = certPinForDesktop(remoteConnectionKey(server));
    if (pin) client.setCertFingerprintPin(pin);
    return client;
  };

  /** Resolve the paired server and build a client for it, or throw the
   * shared "not found" error the action callers already surface. An
   * offline runtime is deliberately still probeable: explicit refresh and
   * retry actions are how a paired server proves it has recovered. */
  const requireClient = (connectionKey: string): RemoteDesktopClient => {
    const state = get();
    const server = state.servers.find((entry) => remoteConnectionKey(entry) === connectionKey);
    if (!server) throw new Error(i18n._(msg`Remote server not found.`));
    return clientForServer(server);
  };

  const withClient = async <Result>(
    desktopId: string,
    invoke: (client: RemoteDesktopClient) => Promise<Result>,
  ): Promise<Result> => {
    try {
      const result = await invoke(requireClient(desktopId));
      const status = get().runtime[desktopId]?.status;
      if (status === "error" || status === "offline") {
        set((state) => {
          const current = state.runtime[desktopId];
          if (current?.status !== "error" && current?.status !== "offline") return {};
          return {
            runtime: {
              ...state.runtime,
              [desktopId]: {
                status: "online",
                projects: current.projects,
                threads: current.threads,
                ...(current.agentStatuses ? { agentStatuses: current.agentStatuses } : {}),
              },
            },
          };
        });
        // Reactivation re-arms bounded reloads (offline cleared them, but
        // an explicit success proves reachability again).
        resetTruncateReloadBackoff(desktopId);
        syncDesktopBrowserBridgeClient(get());
      }
      return result;
    } catch (error) {
      if (!isRemoteTransportFailure(error)) {
        throw error;
      }
      const message = sharedMsg("remote.server.unreachable");
      if (get().runtime[desktopId]?.status !== "connecting") {
        setRemoteServerFailure(desktopId, "offline", message);
      }
      throw new Error(message, { cause: error });
    }
  };

  const checkHostUpdateInBackground = (server: RemoteServerRecord): void => {
    if (server.hostCapabilities?.autoUpdate !== true || !server.scopes.includes("projects:manage"))
      return;
    const connectionKey = remoteConnectionKey(server);
    const requestSeq = nextRemoteHostUpdateSequence();
    setRemoteHostUpdateRequestSeq(connectionKey, requestSeq);
    void clientForServer(server)
      .checkHostUpdate()
      .then((update) => {
        if (remoteHostUpdateRequestSeq(connectionKey) !== requestSeq) return;
        set((state) => ({
          hostUpdates: { ...state.hostUpdates, [connectionKey]: update },
        }));
      })
      .catch(() => undefined);
  };

  return {
    setRemoteServerFailure,
    reportRemoteServerError,
    clientForServer,
    requireClient,
    withClient,
    checkHostUpdateInBackground,
  };
}

export type RemoteServerClientBindings = ReturnType<typeof createRemoteServerClientBindings>;

export type StartRemoteServerEventStream = (
  server: RemoteServerRecord,
  initialCapabilities?: TerminalConnectionCapabilities,
  options?: { readonly resyncInterestedThreads?: boolean },
) => Promise<void>;
