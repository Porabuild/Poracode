import type { RemoteScope } from "./constants.ts";
import type { CoverageStatus, OperationKind } from "./coverageTypes.ts";

export type HarnessMode = "mock" | "real";

export const FAULT_KINDS = [
  "delay-token",
  "delay-ticket",
  "delay-snapshot",
  "delay-history",
  "cancel-token",
  "cancel-ticket",
  "cancel-snapshot",
  "cancel-history",
  "unauthorized",
  "forbidden",
  "redirect",
  "oversized-body",
  "chunked-body",
  "html-body",
  "socket-pre-ready-close",
  "close-1008",
  "sequence-gap",
  "sequence-regression",
  "malformed-envelope",
  "unknown-envelope",
  "reconnect-race",
  "interest-race",
  "duplicate-event-delivery",
] as const;

export type FaultKind = (typeof FAULT_KINDS)[number];

export interface FaultConfig {
  readonly kind: FaultKind;
  readonly delayMs?: number;
  readonly location?: string;
  readonly routeId?: string;
}

export interface ReadinessDescriptor {
  readonly schemaVersion: 1;
  readonly mode: HarnessMode;
  readonly scenario: string;
  readonly protocolVersion: number;
  readonly bindingFormatVersion: number;
  readonly manifestHash: string;
  readonly ledgerFormatVersion: number;
  readonly scenarioFormatVersion: number;
  readonly runDirVersion: number;
  readonly bindHost: "127.0.0.1";
  readonly ports: {
    readonly appHost: number;
    readonly control: number;
    readonly relay: number;
    readonly productionHost: number;
    readonly upstream: number;
  };
  readonly pids: {
    readonly supervisor: number;
    readonly host?: number;
  };
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
  readonly environmentPath: string;
  readonly websocketPath: string;
  readonly basePath: string;
  readonly scenarioApi?: {
    readonly formatVersion: number;
    readonly descriptorPath: "/v1/scenario";
    readonly statePath: "/v1/scenario/state";
    readonly actionPath: "/v1/scenario/actions";
    readonly authScheme: "harness-capability";
    readonly pairing: "action-result-only";
  };
}

export interface PairingControlResponse {
  readonly pairingUrl: string;
  readonly expiresAt: string;
}

export interface PairingSecretRecord {
  readonly credential: string;
  readonly expiresAt: string;
}

export interface HarnessBlocker {
  readonly code:
    | "missing-server-artifact"
    | "pair-json-unavailable"
    | "posix-pairing-required"
    | "real-host-no-fault-injection"
    | "real-host-no-emit"
    | "project-seed-unavailable"
    | "slot-port-occupied"
    | "host-mode-unavailable";
  readonly message: string;
  readonly path?: string;
}

export interface LabClientMetadata {
  readonly label?: string;
  readonly deviceType?: string;
  readonly os?: string;
}

export interface AccessSessionView {
  readonly id: string;
  readonly scopes: readonly RemoteScope[];
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export interface LabState {
  readonly mode: HarnessMode;
  readonly protocolVersion: number;
  readonly bindHost: "127.0.0.1";
  readonly hostPort: number;
  readonly controlPort: number;
  readonly seq: number;
  readonly replayCount: number;
  readonly pairingOutstanding: boolean;
  readonly accessSessionCount: number;
  readonly ticketOutstandingCount: number;
  readonly connectionCount: number;
  readonly faults: readonly FaultKind[];
  readonly blockers: readonly { readonly code: HarnessBlocker["code"] }[];
  readonly ledgerProfile: "foundation" | "core" | "full-parity";
}

export interface EmitRequest {
  readonly kind:
    | "event"
    | "runtime"
    | "terminal-output"
    | "resync-required"
    | "malformed"
    | "unknown";
  readonly eventType?: string;
  readonly threadId?: string;
  readonly runtimeEvent?: Record<string, unknown>;
  readonly event?: Record<string, unknown>;
  readonly terminalId?: string;
  readonly data?: string;
  readonly reason?: string;
}

export interface WireLabOptions {
  readonly host?: string;
  readonly port?: number;
  readonly basePath?: string;
  readonly hostId?: "primary" | "collision-b";
  readonly desktopId?: string;
  readonly label?: string;
  readonly appVersion?: string;
  readonly replayLimit?: number;
  readonly secretsDir?: string;
  readonly journalPath?: string;
  readonly allowEphemeralPort?: boolean;
}

export interface ControlServerOptions {
  readonly host?: string;
  readonly port?: number;
  readonly capability: string;
}

export interface CoverageEvidence {
  readonly statusCode?: number;
  readonly frameType?: string;
  readonly source: "mock" | "real" | "negative";
  readonly followUp?: boolean;
}

export interface CoverageOperationRecord {
  readonly key: string;
  readonly kind: OperationKind;
  readonly id: string;
  readonly status: CoverageStatus;
  readonly attempted: number;
  readonly observed: readonly CoverageEvidence[];
}

export interface CoverageSets {
  readonly httpRouteIds: readonly string[];
  readonly procedureNames: readonly string[];
  readonly webSocketClientTypes: readonly string[];
  readonly webSocketServerTypes: readonly string[];
  readonly replayableEventTypes: readonly string[];
  readonly runtimeEventTypes: readonly string[];
}

export interface CoverageSnapshot {
  readonly schemaVersion: 2;
  readonly profile: "core";
  readonly contract: string;
  readonly protocolVersion: number;
  readonly bindingFormatVersion: number;
  readonly formatVersion: number;
  readonly manifestHash: string;
  readonly keyCount: number;
  readonly operations: Readonly<Record<string, CoverageOperationRecord>>;
  readonly observed: CoverageSets;
  readonly expected: CoverageSets;
  readonly covered: CoverageSets;
  readonly missing: CoverageSets;
  readonly unknown: CoverageSets;
  readonly unsupported: CoverageSets;
  readonly counts: Readonly<
    Record<
      OperationKind,
      {
        readonly expected: number;
        readonly positive: number;
        readonly unsupported: number;
        readonly missing: number;
      }
    >
  >;
  readonly complete: boolean;
  readonly foundationComplete: boolean;
  readonly coreComplete: boolean;
  readonly fullParityComplete: boolean;
}
