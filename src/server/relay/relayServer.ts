import type { RelayServerInfo, RelayServerOptions, RelayServerRuntime } from "./relayServerTypes";
import { publicUrlFor, relayVisitorClientId } from "./relayServerTypes";
import {
  createRelayServerRuntime,
  disposeRelayListen,
  startRelayListen,
} from "./relayServerListen";

export type { RelayServerInfo, RelayServerOptions };
export { relayVisitorClientId };

/**
 * Self-hostable relay. A Poracode server dials `/host` and registers a server
 * id; devices reach it at `/s/<serverId>/…`. The relay forwards visitor HTTP +
 * WebSocket traffic to the registered host over a single framed control socket
 * (relayProtocol.ts). Application authentication is enforced by the host;
 * the relay authenticates server registration against its serverId claim.
 * The relay can read forwarded credentials and payloads and must be trusted.
 *
 * The account-scoped "cloud subscription" layer (mapping users → server ids,
 * billing, hosting) sits ON TOP of this and is out of repo scope.
 */
export class RelayServer {
  private readonly rt: RelayServerRuntime;

  constructor(
    options: RelayServerOptions = {},
    /** Injectable clock for TTL-based secret-binding reclamation (tests). */
    now: () => number = Date.now,
  ) {
    this.rt = createRelayServerRuntime(options, now);
  }

  async start(): Promise<RelayServerInfo> {
    return startRelayListen(this.rt);
  }

  async dispose(): Promise<void> {
    return disposeRelayListen(this.rt);
  }

  /** Visitor-facing base URL for a server id (what a device points its client at). */
  publicUrlFor(serverId: string): string {
    return publicUrlFor(this.rt, serverId);
  }
}
