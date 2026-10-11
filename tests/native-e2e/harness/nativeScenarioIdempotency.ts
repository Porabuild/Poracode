import { createHash } from "node:crypto";
import { FIXTURE_THREAD_ID } from "./labFixtures.ts";
import type { ScenarioAction, ScenarioCondition } from "./nativeScenario.ts";
import { sortedUniqueCodePoints } from "./sort.ts";

const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Fingerprints parsed action semantics, excluding requestId itself.
 * The digest is internal only; validated scenario fields contain no credentials.
 */
export function scenarioActionFingerprint(action: ScenarioAction): string {
  const canonical = canonicalAction(action);
  return createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}

function canonicalAction(action: ScenarioAction): Record<string, unknown> {
  switch (action.type) {
    case "reset":
    case "seed-multihost-collision":
    case "clear-faults":
      return { type: action.type };
    case "pairing-url":
      return { type: action.type, hostId: action.hostId ?? "primary" };
    case "emit-canonical-replay":
      return {
        type: action.type,
        hostId: action.hostId ?? "primary",
        threadId: action.threadId ?? FIXTURE_THREAD_ID,
      };
    case "declare-observations":
      return { type: action.type, operationIds: sortedUniqueCodePoints(action.operationIds) };
    case "activate-fault":
      return { type: action.type, fixtureId: action.fixtureId };
    case "await":
      return {
        type: action.type,
        condition: canonicalCondition(action.condition),
        timeoutMs: action.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      };
  }
}

function canonicalCondition(condition: ScenarioCondition): Record<string, unknown> {
  switch (condition.kind) {
    case "revision-at-least":
      return { kind: condition.kind, revision: condition.revision };
    case "operations-observed":
      return {
        kind: condition.kind,
        operationIds: sortedUniqueCodePoints(condition.operationIds),
      };
    case "pairing-state":
      return { kind: condition.kind, state: condition.state };
    case "host-count":
      return { kind: condition.kind, count: condition.count };
  }
}
