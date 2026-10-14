import {
  FOUNDATION_OPERATION_KEYS,
  buildOperationMap,
  coreOperationKeys,
  type OperationMapDocument,
} from "./operationMap.ts";
import { loadProtocolManifest, type ProtocolManifest } from "./manifest.ts";
import { sortedUniqueCodePoints } from "./sort.ts";
import { operationKey, type CoverageStatus, type OperationKind } from "./coverageTypes.ts";
import type {
  CoverageEvidence,
  CoverageOperationRecord,
  CoverageSets,
  CoverageSnapshot,
} from "./types.ts";
import { NATIVE_E2E_LEDGER_FORMAT_VERSION } from "./versions.ts";

interface MutableRecord {
  key: string;
  kind: OperationKind;
  id: string;
  status: CoverageStatus;
  attempted: number;
  observed: CoverageEvidence[];
  requiresFollowUp: boolean;
  followUpSeen: boolean;
}

function emptySets(): Record<keyof CoverageSets, Set<string>> {
  return {
    httpRouteIds: new Set(),
    procedureNames: new Set(),
    webSocketClientTypes: new Set(),
    webSocketServerTypes: new Set(),
    replayableEventTypes: new Set(),
    runtimeEventTypes: new Set(),
  };
}

function toSets(values: Record<keyof CoverageSets, Set<string>>): CoverageSets {
  return {
    httpRouteIds: sortedUniqueCodePoints(values.httpRouteIds),
    procedureNames: sortedUniqueCodePoints(values.procedureNames),
    webSocketClientTypes: sortedUniqueCodePoints(values.webSocketClientTypes),
    webSocketServerTypes: sortedUniqueCodePoints(values.webSocketServerTypes),
    replayableEventTypes: sortedUniqueCodePoints(values.replayableEventTypes),
    runtimeEventTypes: sortedUniqueCodePoints(values.runtimeEventTypes),
  };
}

function expectedFromManifest(manifest: ProtocolManifest): CoverageSets {
  return {
    httpRouteIds: sortedUniqueCodePoints(manifest.httpRoutes.map((route) => route.id)),
    procedureNames: sortedUniqueCodePoints(manifest.procedures.map((procedure) => procedure.name)),
    webSocketClientTypes: sortedUniqueCodePoints(manifest.webSocket.clientMessages),
    webSocketServerTypes: sortedUniqueCodePoints(manifest.webSocket.serverMessages),
    replayableEventTypes: sortedUniqueCodePoints(manifest.webSocket.replayableEventTypes),
    runtimeEventTypes: sortedUniqueCodePoints(manifest.webSocket.runtimeEventTypes),
  };
}

function difference(left: readonly string[], right: readonly string[]): string[] {
  const remove = new Set(right);
  return left.filter((value) => !remove.has(value));
}

function kindToSet(kind: OperationKind): keyof CoverageSets {
  switch (kind) {
    case "route":
      return "httpRouteIds";
    case "procedure":
      return "procedureNames";
    case "ws-client":
      return "webSocketClientTypes";
    case "ws-server":
      return "webSocketServerTypes";
    case "replay":
      return "replayableEventTypes";
    case "runtime":
      return "runtimeEventTypes";
  }
}

function nextStatus(current: CoverageStatus, incoming: CoverageStatus): CoverageStatus {
  const rank: Record<CoverageStatus, number> = {
    unexercised: 0,
    "host-mode-unavailable": 1,
    "negative-passed": 2,
    "mock-passed": 3,
    "real-passed": 4,
  };
  return rank[incoming] > rank[current] ? incoming : current;
}

export class CoverageLedger {
  private readonly records = new Map<string, MutableRecord>();
  private readonly extras = emptySets();
  private readonly listeners = new Set<() => void>();
  private map: OperationMapDocument;

  constructor(private readonly loadManifest: () => ProtocolManifest = loadProtocolManifest) {
    this.map = buildOperationMap(this.loadManifest());
    this.seed();
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  reset(): void {
    this.map = buildOperationMap(this.loadManifest());
    this.records.clear();
    const extras = emptySets();
    this.extras.httpRouteIds = extras.httpRouteIds;
    this.extras.procedureNames = extras.procedureNames;
    this.extras.webSocketClientTypes = extras.webSocketClientTypes;
    this.extras.webSocketServerTypes = extras.webSocketServerTypes;
    this.extras.replayableEventTypes = extras.replayableEventTypes;
    this.extras.runtimeEventTypes = extras.runtimeEventTypes;
    this.seed();
    this.notify();
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  observeHttpRoute(id: string, evidence?: CoverageEvidence): void {
    this.touch("route", id, evidence);
  }

  observeProcedure(name: string, evidence?: CoverageEvidence): void {
    this.touch("procedure", name, evidence);
  }

  observeWebSocketClient(type: string, evidence?: CoverageEvidence): void {
    this.touch("ws-client", type, evidence);
  }

  observeWebSocketServer(type: string, evidence?: CoverageEvidence): void {
    this.touch("ws-server", type, evidence);
  }

  observeReplayableEvent(type: string, evidence?: CoverageEvidence): void {
    this.touch("replay", type, evidence);
  }

  observeRuntimeEvent(type: string, evidence?: CoverageEvidence): void {
    this.touch("runtime", type, evidence);
  }

  observeUnknown(kind: keyof CoverageSets, value: string): void {
    this.extras[kind].add(value);
    this.notify();
  }

  markRequiresFollowUp(kind: OperationKind, id: string): void {
    const record = this.ensure(kind, id);
    record.requiresFollowUp = true;
    if (record.status === "mock-passed" && !record.followUpSeen) {
      record.status = "unexercised";
    }
  }

  recordFollowUp(kind: OperationKind, id: string, evidence: CoverageEvidence): void {
    const record = this.ensure(kind, id);
    record.followUpSeen = true;
    record.observed.push({ ...evidence, followUp: true });
    if (record.attempted > 0) {
      record.status = nextStatus(
        record.status,
        evidence.source === "real" ? "real-passed" : "mock-passed",
      );
    }
  }

  markHostUnavailable(kind: OperationKind, id: string): void {
    const record = this.ensure(kind, id);
    if (record.status === "unexercised") record.status = "host-mode-unavailable";
  }

  snapshot(): CoverageSnapshot {
    const manifest = this.loadManifest();
    const expected = expectedFromManifest(manifest);
    const observedSets = emptySets();
    const operations: Record<string, CoverageOperationRecord> = {};
    for (const key of Object.keys(this.map.operations).sort()) {
      const record = this.records.get(key);
      if (!record) continue;
      operations[key] = {
        key: record.key,
        kind: record.kind,
        id: record.id,
        status: record.status,
        attempted: record.attempted,
        observed: [...record.observed],
      };
      if (record.attempted > 0) observedSets[kindToSet(record.kind)].add(record.id);
    }
    for (const extraKind of Object.keys(this.extras) as (keyof CoverageSets)[]) {
      for (const value of this.extras[extraKind]) observedSets[extraKind].add(value);
    }
    const observed = toSets(observedSets);
    const positiveSets = emptySets();
    const unsupportedSets = emptySets();
    for (const record of this.records.values()) {
      if (record.status === "mock-passed" || record.status === "real-passed") {
        positiveSets[kindToSet(record.kind)].add(record.id);
      } else if (record.status === "negative-passed") {
        unsupportedSets[kindToSet(record.kind)].add(record.id);
      }
    }
    const covered = toSets(positiveSets);
    const unsupported = toSets(unsupportedSets);
    const missing: CoverageSets = {
      httpRouteIds: difference(expected.httpRouteIds, covered.httpRouteIds),
      procedureNames: difference(expected.procedureNames, covered.procedureNames),
      webSocketClientTypes: difference(expected.webSocketClientTypes, covered.webSocketClientTypes),
      webSocketServerTypes: difference(expected.webSocketServerTypes, covered.webSocketServerTypes),
      replayableEventTypes: difference(expected.replayableEventTypes, covered.replayableEventTypes),
      runtimeEventTypes: difference(expected.runtimeEventTypes, covered.runtimeEventTypes),
    };
    const unknown: CoverageSets = {
      httpRouteIds: difference(observed.httpRouteIds, expected.httpRouteIds),
      procedureNames: difference(observed.procedureNames, expected.procedureNames),
      webSocketClientTypes: difference(
        observed.webSocketClientTypes,
        expected.webSocketClientTypes,
      ),
      webSocketServerTypes: difference(
        observed.webSocketServerTypes,
        expected.webSocketServerTypes,
      ),
      replayableEventTypes: difference(
        observed.replayableEventTypes,
        expected.replayableEventTypes,
      ),
      runtimeEventTypes: difference(observed.runtimeEventTypes, expected.runtimeEventTypes),
    };
    const passedStatuses = new Set<CoverageStatus>(["mock-passed", "real-passed"]);
    const foundationComplete = FOUNDATION_OPERATION_KEYS.every((key) => {
      const record = this.records.get(key);
      return record !== undefined && passedStatuses.has(record.status);
    });
    const fullParityComplete = Object.values(operations).every((record) =>
      passedStatuses.has(record.status),
    );
    const coreComplete = coreOperationKeys(manifest).every((key) => {
      const record = this.records.get(key);
      return record !== undefined && passedStatuses.has(record.status);
    });
    const counts = Object.fromEntries(
      (["route", "procedure", "ws-client", "ws-server", "replay", "runtime"] as const).map(
        (kind) => {
          const setName = kindToSet(kind);
          return [
            kind,
            {
              expected: expected[setName].length,
              positive: covered[setName].length,
              unsupported: unsupported[setName].length,
              missing: missing[setName].length,
            },
          ];
        },
      ),
    ) as CoverageSnapshot["counts"];

    return {
      schemaVersion: NATIVE_E2E_LEDGER_FORMAT_VERSION,
      profile: "core",
      contract: manifest.contract,
      protocolVersion: manifest.protocolVersion,
      bindingFormatVersion: this.map.bindingFormatVersion,
      formatVersion: manifest.formatVersion,
      manifestHash: this.map.manifestHash,
      keyCount: this.map.keyCount,
      operations,
      observed,
      expected,
      covered,
      missing,
      unknown,
      unsupported,
      counts,
      complete: coreComplete,
      foundationComplete,
      coreComplete,
      fullParityComplete:
        fullParityComplete && Object.keys(operations).length === this.map.keyCount,
    };
  }

  toDeterministicJson(): string {
    return `${JSON.stringify(this.snapshot(), null, 2)}\n`;
  }

  private seed(): void {
    for (const [key, entry] of Object.entries(this.map.operations)) {
      this.records.set(key, {
        key,
        kind: entry.kind,
        id: entry.id,
        status: "unexercised",
        attempted: 0,
        observed: [],
        requiresFollowUp: false,
        followUpSeen: false,
      });
    }
  }

  private ensure(kind: OperationKind, id: string): MutableRecord {
    const key = operationKey(kind, id);
    const existing = this.records.get(key);
    if (existing) return existing;
    this.extras[kindToSet(kind)].add(id);
    const created: MutableRecord = {
      key,
      kind,
      id,
      status: "unexercised",
      attempted: 0,
      observed: [],
      requiresFollowUp: false,
      followUpSeen: false,
    };
    this.records.set(key, created);
    return created;
  }

  private touch(kind: OperationKind, id: string, evidence?: CoverageEvidence): void {
    const record = this.ensure(kind, id);
    record.attempted += 1;
    if (!evidence) {
      this.notify();
      return;
    }
    record.observed.push(evidence);
    if (evidence.source === "negative") {
      record.status = nextStatus(record.status, "negative-passed");
      this.notify();
      return;
    }
    if (evidence.source === "real") {
      if (
        record.status === "mock-passed" ||
        record.observed.some((item) => item.source === "real")
      ) {
        if (!record.requiresFollowUp || record.followUpSeen) {
          record.status = "real-passed";
        }
      }
      this.notify();
      return;
    }
    if (record.requiresFollowUp && !record.followUpSeen) {
      this.notify();
      return;
    }
    record.status = nextStatus(record.status, "mock-passed");
    this.notify();
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
