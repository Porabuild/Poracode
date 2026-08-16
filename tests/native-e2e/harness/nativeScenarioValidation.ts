import { isFaultFixtureId } from "./controlFixtures.ts";
import { LabHttpError } from "./labAuth.ts";
import { parseOperationKey } from "./coverageTypes.ts";
import type {
  ScenarioAction,
  ScenarioCondition,
  ScenarioHostId,
  ScenarioHostTarget,
} from "./nativeScenario.ts";

const OBSERVABLE_CLIENT_OPERATIONS = [
  "ws-client:git-state-interests",
  "ws-client:browser-watch",
  "ws-client:browser-unwatch",
  "ws-client:browser-input",
] as const;

const MAX_TIMEOUT_MS = 120_000;

export function parseScenarioAction(value: unknown): ScenarioAction {
  if (!isRecord(value) || typeof value.type !== "string") invalidAction();
  const requestId = optionalRequestId(value.requestId);
  switch (value.type) {
    case "reset":
      return { type: "reset", ...(requestId ? { requestId } : {}) };
    case "pairing-url": {
      const hostId = optionalHostId(value.hostId);
      return {
        type: "pairing-url",
        ...(hostId ? { hostId } : {}),
        ...(requestId ? { requestId } : {}),
      };
    }
    case "seed-multihost-collision":
      return { type: value.type, ...(requestId ? { requestId } : {}) };
    case "emit-canonical-replay": {
      const hostId = optionalHostTarget(value.hostId);
      const threadId = optionalThreadId(value.threadId);
      return {
        type: value.type,
        ...(hostId ? { hostId } : {}),
        ...(threadId ? { threadId } : {}),
        ...(requestId ? { requestId } : {}),
      };
    }
    case "declare-observations": {
      if (!Array.isArray(value.operationIds) || value.operationIds.length > 8) invalidAction();
      const operationIds = value.operationIds.map(parseObservableOperation);
      return { type: value.type, operationIds, ...(requestId ? { requestId } : {}) };
    }
    case "activate-fault":
      if (typeof value.fixtureId !== "string" || !isFaultFixtureId(value.fixtureId))
        invalidAction();
      return { type: value.type, fixtureId: value.fixtureId, ...(requestId ? { requestId } : {}) };
    case "clear-faults":
      return { type: value.type, ...(requestId ? { requestId } : {}) };
    case "await": {
      const condition = parseCondition(value.condition);
      const timeoutMs =
        value.timeoutMs === undefined ? undefined : validateScenarioTimeout(value.timeoutMs);
      return {
        type: value.type,
        condition,
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
        ...(requestId ? { requestId } : {}),
      };
    }
    default:
      invalidAction();
  }
}

export function validateScenarioTimeout(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_TIMEOUT_MS
  ) {
    throw new LabHttpError("invalid_scenario_action", "Scenario timeout is invalid.", 400);
  }
  return value;
}

function parseCondition(value: unknown): ScenarioCondition {
  if (!isRecord(value) || typeof value.kind !== "string") invalidAction();
  switch (value.kind) {
    case "revision-at-least":
      return { kind: value.kind, revision: positiveInteger(value.revision) };
    case "operations-observed":
      if (!Array.isArray(value.operationIds) || value.operationIds.length === 0) invalidAction();
      return { kind: value.kind, operationIds: value.operationIds.map(parseOperationId) };
    case "pairing-state":
      if (value.state !== "pairable" && value.state !== "paired" && value.state !== "unpaired")
        invalidAction();
      return { kind: value.kind, state: value.state };
    case "host-count":
      return { kind: value.kind, count: positiveInteger(value.count, true) };
    default:
      invalidAction();
  }
}

function parseObservableOperation(value: unknown): (typeof OBSERVABLE_CLIENT_OPERATIONS)[number] {
  if (
    typeof value !== "string" ||
    !(OBSERVABLE_CLIENT_OPERATIONS as readonly string[]).includes(value)
  ) {
    invalidAction();
  }
  return value as (typeof OBSERVABLE_CLIENT_OPERATIONS)[number];
}

function parseOperationId(value: unknown): string {
  if (typeof value !== "string" || !parseOperationKey(value)) invalidAction();
  return value;
}

function positiveInteger(value: unknown, allowZero = false): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    (allowZero ? value < 0 : value < 1)
  ) {
    invalidAction();
  }
  return value;
}

function optionalRequestId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^[A-Za-z0-9._-]{1,80}$/.test(value)) invalidAction();
  return value;
}

function optionalHostId(value: unknown): ScenarioHostId | undefined {
  if (value === undefined) return undefined;
  if (value !== "primary" && value !== "collision-b") invalidAction();
  return value;
}

function optionalHostTarget(value: unknown): ScenarioHostTarget | undefined {
  if (value === undefined) return undefined;
  if (value !== "primary" && value !== "collision-b" && value !== "all") invalidAction();
  return value;
}

function optionalThreadId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(value)) invalidAction();
  return value;
}

function invalidAction(): never {
  throw new LabHttpError("invalid_scenario_action", "Scenario action is invalid.", 400);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
