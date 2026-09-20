import { tryParseSocketMessage as tryParseRemoteSocketMessage } from "./parseSocketMessage";
import {
  remotePortEnterResultSchema,
  remotePortForwardResultSchema,
  remotePortUnforwardResultSchema,
  remotePortsStateSchema,
  remotePushRegistrationResultSchema,
  remoteWebPushConfigResultSchema,
  remoteProjectCommandResultSchema,
  remoteProjectSettingsSchema,
  remoteWebSocketServerMessageSchema,
  remoteWebSocketTicketResultSchema,
  toWebSocketUrl,
  type RemotePortEnterResult,
  type RemotePortForwardResult,
  type RemotePortsState,
  type RemoteProjectCommand,
  type RemoteProjectCommandResult,
  type RemoteProjectSettings,
  type RemotePushRegistration,
  type RemotePushRegistrationRouting,
  type RemotePushRegistrationResult,
  type RemoteWebSocketServerMessage,
} from "@/shared/remote";
import { RemoteClientThreadsApi } from "./clientApiThreads";
import { parseResponse } from "./clientParse";
import { endpointUrl, LONG_REMOTE_REQUEST_TIMEOUT_MS } from "./clientTypes";

export abstract class RemoteClientWorkspaceApi extends RemoteClientThreadsApi {
  /**
   * Add (existing folder / scratch / clone) or remove a project on the paired
   * desktop or server. Requires the `projects:manage` scope. Returns the full
   * updated project list; connected clients also receive a
   * `remote-projects-changed` event to refresh their snapshot.
   */
  async projectCommand(command: RemoteProjectCommand): Promise<RemoteProjectCommandResult> {
    return remoteProjectCommandResultSchema.parse(
      await this.requestJson("/api/projects/command", {
        method: "POST",
        body: command,
        ...(command.kind === "clone" ? { timeoutMs: LONG_REMOTE_REQUEST_TIMEOUT_MS } : {}),
      }),
    );
  }

  async projectSettings(projectId: string): Promise<RemoteProjectSettings> {
    return remoteProjectSettingsSchema.parse(
      await this.requestJson(`/api/projects/${encodeURIComponent(projectId)}/settings`),
    );
  }

  /**
   * Discover dev servers listening on the paired desktop's localhost, plus any
   * forwards already open. Requires the `ports:forward` scope. Runs a fresh
   * scan on every call (fast — a handful of concurrent, short-timeout probes).
   */
  async listPorts(): Promise<RemotePortsState> {
    return remotePortsStateSchema.parse(await this.requestJson("/api/ports"));
  }

  /**
   * Opens a raw TCP proxy from the desktop's LAN-reachable interface to
   * `127.0.0.1:targetPort`, so a phone browser can load it directly at
   * `http://<advertisedHost>:<listenPort>/`. Idempotent per `targetPort` (a
   * second call returns the existing forward). Requires `ports:forward`.
   */
  async startPortForward(targetPort: number): Promise<RemotePortForwardResult> {
    return remotePortForwardResultSchema.parse(
      await this.requestJson("/api/ports/forward", { method: "POST", body: { targetPort } }),
    );
  }

  /** Closes a port forward by id. Requires `ports:forward`. */
  async stopPortForward(id: string): Promise<void> {
    remotePortUnforwardResultSchema.parse(
      await this.requestJson("/api/ports/unforward", { method: "POST", body: { id } }),
    );
  }

  /**
   * Mints a fresh enter token for an already-open forward (the one returned by
   * {@link startPortForward} may have expired — tokens are TTL'd). Requires
   * `ports:forward`. Throws `forward_not_found` (404) if the forward has since
   * closed.
   */
  async enterPortForward(id: string): Promise<RemotePortEnterResult> {
    return remotePortEnterResultSchema.parse(
      await this.requestJson("/api/ports/enter", { method: "POST", body: { id } }),
    );
  }

  /**
   * Register this device's APNs tokens for push notifications and Live
   * Activities. Idempotent upsert keyed by `deviceId`: any token field present
   * replaces the stored value; absent fields are preserved. Requires the
   * `session:operate` scope (no separate push scope), so already-paired devices
   * register without re-pairing.
   */
  async registerPush(registration: RemotePushRegistration): Promise<RemotePushRegistrationResult> {
    return parseResponse(
      remotePushRegistrationResultSchema,
      await this.requestJson("/api/push/register", { method: "POST", body: registration }),
      "push registration",
    );
  }

  /** Resolve the VAPID application-server key used by installed web apps. */
  async webPushConfig(): Promise<{ publicKey: string }> {
    return remoteWebPushConfigResultSchema.parse(await this.requestJson("/api/push/config"));
  }

  /** Drop all push registrations for a device (sign-out / unpair). */
  async unregisterPush(deviceId: string, routing?: RemotePushRegistrationRouting): Promise<void> {
    await this.requestJson("/api/push/unregister", {
      method: "POST",
      body: { deviceId, ...(routing ? { routing } : {}) },
    });
  }

  async websocketTicket(timeoutMs?: number): Promise<string> {
    const result = remoteWebSocketTicketResultSchema.parse(
      await this.requestJson("/api/auth/websocket-ticket", {
        method: "POST",
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      }),
    );
    return result.ticket;
  }

  /**
   * Build the event-stream WebSocket URL. `lastSeenSeq` is the sequence the
   * client has already applied; the server replays events after it (and
   * signals `resync-required` if that window has expired). Send it whenever it
   * is a non-negative sequence — including `0`, which asks the server to
   * replay from the beginning / resync. Omission is reserved for the sentinel
   * meaning "no snapshot yet" (`null`/`undefined`), which the server reads as
   * "no replay". A client at snapshotSeq=0 that omitted the param would
   * otherwise silently miss events.
   */
  websocketUrl(
    ticket: string,
    lastSeenSeq: number | null | undefined,
    options: { readonly threadItemInterests?: readonly string[] } = {},
  ): string {
    const url = toWebSocketUrl(endpointUrl(this.endpoint, "/ws"));
    url.searchParams.set("ticket", ticket);
    if (typeof lastSeenSeq === "number" && Number.isInteger(lastSeenSeq) && lastSeenSeq >= 0) {
      url.searchParams.set("lastSeenSeq", String(lastSeenSeq));
    }
    if (options.threadItemInterests) {
      url.searchParams.set("threadItemInterests", JSON.stringify(options.threadItemInterests));
    }
    return url.toString();
  }

  parseSocketMessage(value: string): RemoteWebSocketServerMessage {
    return remoteWebSocketServerMessageSchema.parse(JSON.parse(value) as unknown);
  }

  tryParseSocketMessage(value: string): RemoteWebSocketServerMessage | null {
    return tryParseRemoteSocketMessage(value);
  }
}
