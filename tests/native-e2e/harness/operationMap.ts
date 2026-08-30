import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProtocolManifest, type ProtocolManifest } from "./manifest.ts";
import { findRepoRoot, protocolInventoryPath } from "./paths.ts";
import { sortCodePoints } from "./sort.ts";
import { operationKey, type OperationKind } from "./coverageTypes.ts";
import { NATIVE_E2E_OPERATION_MAP_VERSION } from "./versions.ts";

export interface OperationMapEntry {
  readonly kind: OperationKind;
  readonly id: string;
}

export interface OperationMapDocument {
  readonly schemaVersion: typeof NATIVE_E2E_OPERATION_MAP_VERSION;
  readonly contract: string;
  readonly protocolVersion: number;
  readonly bindingFormatVersion: number;
  readonly manifestHash: string;
  readonly keyCount: number;
  readonly counts: Record<OperationKind, number>;
  readonly operations: Record<string, OperationMapEntry>;
}

const EXPECTED_COUNTS = {
  route: 60,
  procedure: 100,
  "ws-client": 8,
  "ws-server": 9,
  replay: 15,
  runtime: 14,
} as const;

export const EXPECTED_OPERATION_KEY_COUNT = 206;

interface ProtocolInventoryHeader {
  readonly sourceHash: string;
  readonly bindingFormatVersion: number;
}

function inventoryHeader(repoRoot = findRepoRoot()): ProtocolInventoryHeader {
  const parsed = JSON.parse(readFileSync(protocolInventoryPath(repoRoot), "utf8")) as {
    sourceHash?: unknown;
    bindingFormatVersion?: unknown;
  };
  if (typeof parsed.sourceHash !== "string" || !parsed.sourceHash.startsWith("sha256:")) {
    throw new Error("protocol inventory is missing a sha256 sourceHash");
  }
  if (
    typeof parsed.bindingFormatVersion !== "number" ||
    !Number.isSafeInteger(parsed.bindingFormatVersion) ||
    parsed.bindingFormatVersion < 1
  ) {
    throw new Error("protocol inventory is missing a positive bindingFormatVersion");
  }
  return {
    sourceHash: parsed.sourceHash,
    bindingFormatVersion: parsed.bindingFormatVersion,
  };
}

export function inventorySourceHash(repoRoot = findRepoRoot()): string {
  return inventoryHeader(repoRoot).sourceHash;
}

export function inventoryBindingFormatVersion(repoRoot = findRepoRoot()): number {
  return inventoryHeader(repoRoot).bindingFormatVersion;
}

export function computeManifestHash(manifest: ProtocolManifest, inventoryHash: string): string {
  const canonical = {
    contract: manifest.contract,
    protocolVersion: manifest.protocolVersion,
    formatVersion: manifest.formatVersion,
    inventoryHash,
    keys: collectManifestKeys(manifest),
  };
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical)).digest("hex")}`;
}

export function collectManifestKeys(manifest: ProtocolManifest): string[] {
  const keys = [
    ...manifest.httpRoutes.map((route) => operationKey("route", route.id)),
    ...manifest.procedures.map((procedure) => operationKey("procedure", procedure.name)),
    ...manifest.webSocket.clientMessages.map((type) => operationKey("ws-client", type)),
    ...manifest.webSocket.serverMessages.map((type) => operationKey("ws-server", type)),
    ...manifest.webSocket.replayableEventTypes.map((type) => operationKey("replay", type)),
    ...manifest.webSocket.runtimeEventTypes.map((type) => operationKey("runtime", type)),
  ];
  return sortCodePoints(keys);
}

export function buildOperationMap(
  manifest = loadProtocolManifest(),
  inventoryHash = inventorySourceHash(),
  bindingFormatVersion = inventoryBindingFormatVersion(),
): OperationMapDocument {
  const keys = collectManifestKeys(manifest);
  const operations: Record<string, OperationMapEntry> = {};
  const counts: Record<OperationKind, number> = {
    route: 0,
    procedure: 0,
    "ws-client": 0,
    "ws-server": 0,
    replay: 0,
    runtime: 0,
  };
  for (const key of keys) {
    const separator = key.indexOf(":");
    const kind = key.slice(0, separator) as OperationKind;
    const id = key.slice(separator + 1);
    operations[key] = { kind, id };
    counts[kind] += 1;
  }
  return {
    schemaVersion: NATIVE_E2E_OPERATION_MAP_VERSION,
    contract: manifest.contract,
    protocolVersion: manifest.protocolVersion,
    bindingFormatVersion,
    manifestHash: computeManifestHash(manifest, inventoryHash),
    keyCount: keys.length,
    counts,
    operations,
  };
}

export function operationMapPath(): string {
  return join(fileURLToPath(new URL(".", import.meta.url)), "operation-map.json");
}

export function loadCommittedOperationMap(): OperationMapDocument {
  return JSON.parse(readFileSync(operationMapPath(), "utf8")) as OperationMapDocument;
}

export function assertExpectedInventoryCounts(map: OperationMapDocument): void {
  if (map.keyCount !== EXPECTED_OPERATION_KEY_COUNT) {
    throw new Error(`Expected ${EXPECTED_OPERATION_KEY_COUNT} keys, got ${map.keyCount}`);
  }
  for (const kind of Object.keys(EXPECTED_COUNTS) as OperationKind[]) {
    if (map.counts[kind] !== EXPECTED_COUNTS[kind]) {
      throw new Error(`Expected ${EXPECTED_COUNTS[kind]} ${kind} keys, got ${map.counts[kind]}`);
    }
  }
}

export const FOUNDATION_OPERATION_KEYS = sortCodePoints([
  "route:environment",
  "route:environment-legacy",
  "route:token-exchange",
  "route:websocket-ticket",
  "route:shell-snapshot",
  "route:thread-history",
  "route:thread-history-items",
  "route:procedure-call",
  "procedure:getGitStatus",
  "procedure:gitStage",
  "ws-client:ping",
  "ws-client:thread-item-interests",
  "ws-client:terminal-watch",
  "ws-client:terminal-unwatch",
  "ws-server:ready",
  "ws-server:event",
  "ws-server:pong",
  "ws-server:resync-required",
  "ws-server:terminal-output",
  "ws-server:terminal-watch-result",
  "replay:thread-state",
  "replay:thread-runtime-event",
  "replay:remote-threads-changed",
  "runtime:content.delta",
]);

export const CORE_ROUTE_IDS = [
  "environment",
  "environment-legacy",
  "token-exchange",
  "websocket-ticket",
  "procedure-call",
  "shell-snapshot",
  "project-command",
  "project-settings",
  "project-notes-read",
  "project-notes-write",
  "attachment-upload",
  "thread-history",
  "thread-history-items",
  "thread-start-existing",
  "thread-runtime-truncate",
  "thread-command",
  "thread-send",
  "thread-interrupt",
  "thread-goal",
  "thread-close",
  "thread-steer-set",
  "thread-steer-clear",
] as const;

export const CORE_PROCEDURE_NAMES = [
  "searchProjectFiles",
  "listProjectTree",
  "readProjectFile",
  "writeProjectFile",
  "createProjectEntry",
  "getGitStatus",
  "gitStage",
  "gitListWorktrees",
  "gitAddWorktree",
  "createFileCheckpoint",
  "listFileCheckpoints",
] as const;

export function coreOperationKeys(manifest = loadProtocolManifest()): string[] {
  return sortCodePoints([
    ...CORE_ROUTE_IDS.map((id) => operationKey("route", id)),
    ...CORE_PROCEDURE_NAMES.map((id) => operationKey("procedure", id)),
    ...manifest.webSocket.clientMessages.map((id) => operationKey("ws-client", id)),
    ...manifest.webSocket.serverMessages.map((id) => operationKey("ws-server", id)),
    ...manifest.webSocket.replayableEventTypes.map((id) => operationKey("replay", id)),
    ...manifest.webSocket.runtimeEventTypes.map((id) => operationKey("runtime", id)),
  ]);
}
