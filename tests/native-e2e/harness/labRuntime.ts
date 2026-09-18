import type { IncomingMessage } from "node:http";
import type { WebSocket } from "ws";
import type { CoverageLedger } from "./coverageLedger.ts";
import type { FaultEngine } from "./faultEngine.ts";
import type { LabAuthStore, AuthenticatedSession } from "./labAuth.ts";
import type { LabProcedureWorkspace } from "./contractFixtures.ts";
import type { LabLifecycleState } from "./lifecycleState.ts";
import type { LabRouteWorkspace } from "./routeFixtures.ts";
import type { ProtocolManifest } from "./manifest.ts";
import type { ReplayRing } from "./replayRing.ts";
import type { RemoteScope } from "./constants.ts";
import type { ObservationLedger } from "./observationLedger.ts";

export interface LabConnection {
  readonly ws: WebSocket;
  readonly socketId: string;
  readonly sessionId: string;
  readonly session: AuthenticatedSession;
  interests: ReadonlySet<string> | null;
  readonly terminalWatches: Set<string>;
  browserWatching: boolean;
  gitStateInterests: readonly Record<string, unknown>[];
}

export interface LabRuntime {
  readonly auth: LabAuthStore;
  readonly faults: FaultEngine;
  readonly ring: ReplayRing;
  readonly observationLedger: ObservationLedger;
  readonly ledger: CoverageLedger;
  readonly manifest: ProtocolManifest;
  readonly workspace: LabProcedureWorkspace;
  readonly lifecycle: LabLifecycleState;
  readonly routes: LabRouteWorkspace;
  readonly connections: Set<LabConnection>;
  readonly basePath: string;
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
  allocateConnectionIdentity(authSessionId: string): {
    readonly socketId: string;
    readonly sessionId: string;
  };
  environment(): Record<string, unknown>;
  publishEvent(event: Record<string, unknown>): number;
  send(ws: WebSocket, message: Record<string, unknown>): void;
  requireRouteAuth(
    req: IncomingMessage,
    url: URL,
    auth: string,
    scopes: readonly string[],
  ): AuthenticatedSession | null;
  bearerToken(req: IncomingMessage, url: URL, allowQuery?: boolean): string;
  issuePairingCredential(scopes?: readonly RemoteScope[]): {
    credential: string;
    expiresAt: string;
  };
  consumePairingSecretFile(): void;
}
