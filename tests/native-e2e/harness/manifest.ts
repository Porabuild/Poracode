import { readFileSync } from "node:fs";
import { protocolManifestPath } from "./paths.ts";

export interface ManifestHttpRoute {
  readonly id: string;
  readonly method: "GET" | "POST" | "DELETE";
  readonly path: string;
  readonly auth: "public" | "pairing-token" | "bearer" | "bearer-or-query" | "forward-enter-token";
  readonly scopes: readonly string[];
  readonly scopeResolution?: "procedure-defined";
  readonly queryParameters?: readonly string[];
  readonly legacy?: boolean;
}

export interface ManifestProcedure {
  readonly name: string;
  readonly scope: string;
  readonly owner: string;
  readonly timeout?: "long";
}

export interface ProtocolManifest {
  readonly formatVersion: number;
  readonly contract: string;
  readonly protocolVersion: number;
  readonly wireFormat: {
    readonly http: string;
    readonly webSocket: string;
    readonly webSocketPath: string;
    readonly webSocketQueryParameters: readonly string[];
    readonly commandIdHeader: string;
  };
  readonly compatibility: {
    readonly versionPolicy: string;
    readonly minimumAcceptedProtocolVersion: number;
    readonly maximumAcceptedProtocolVersion: number;
    readonly unknownClientRequestedScopes: string;
    readonly endpointPathPolicy: string;
    readonly discoveryFallback: readonly string[];
    readonly sequencePolicy: {
      readonly snapshotSeqIsLastAppliedEvent: boolean;
      readonly sendZeroLastSeenSeq: boolean;
      readonly missingReplayWindow: string;
      readonly serverSequenceRegression: string;
    };
    readonly pairingCredential: {
      readonly singleUse: boolean;
      readonly transport: string;
    };
  };
  readonly scopes: readonly string[];
  readonly httpRoutes: readonly ManifestHttpRoute[];
  readonly procedures: readonly ManifestProcedure[];
  readonly webSocket: {
    readonly clientMessages: readonly string[];
    readonly serverMessages: readonly string[];
    readonly replayableEventTypes: readonly string[];
    readonly runtimeEventTypes: readonly string[];
    readonly outOfBandMessages: readonly string[];
  };
}

let cached: ProtocolManifest | null = null;

export function loadProtocolManifest(path = protocolManifestPath()): ProtocolManifest {
  if (cached && path === protocolManifestPath()) return cached;
  const parsed = JSON.parse(readFileSync(path, "utf8")) as ProtocolManifest;
  if (path === protocolManifestPath()) cached = parsed;
  return parsed;
}

export function reloadProtocolManifest(path = protocolManifestPath()): ProtocolManifest {
  cached = null;
  return loadProtocolManifest(path);
}

export function routeById(id: string, manifest = loadProtocolManifest()): ManifestHttpRoute {
  const route = manifest.httpRoutes.find((entry) => entry.id === id);
  if (!route) throw new Error(`Unknown protocol route id: ${id}`);
  return route;
}

export function procedureByName(
  name: string,
  manifest = loadProtocolManifest(),
): ManifestProcedure | undefined {
  return manifest.procedures.find((entry) => entry.name === name);
}
