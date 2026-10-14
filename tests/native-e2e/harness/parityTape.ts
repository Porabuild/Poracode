import { readFileSync } from "node:fs";
import {
  remoteWebSocketClientMessageSchema,
  remoteWebSocketServerMessageSchema,
} from "../../../src/shared/remote/protocol.ts";
import { assertEventFixtures, validateReplayableEvent } from "./eventValidation.ts";
import { loadProtocolManifest } from "./manifest.ts";
import { protocolFixturePath } from "./paths.ts";

export interface ParityTapeCase {
  readonly id: string;
  readonly family:
    | "lifecycle"
    | "agent-status"
    | "git-summaries"
    | "git-state"
    | "git-interests"
    | "sequencing";
  readonly message: Record<string, unknown>;
  readonly expected?: Record<string, unknown>;
  readonly before?: Record<string, unknown>;
  readonly expectedAfter?: Record<string, unknown>;
  readonly assertions?: readonly string[];
  readonly expectedThreadIds?: readonly string[];
}

export interface ParityTape {
  readonly id: string;
  readonly format: string;
  readonly protocolVersion: number;
  readonly versionBoundary: string;
  readonly cases: readonly ParityTapeCase[];
}

let cached: ParityTape | undefined;

export function loadCanonicalParityTape(): ParityTape {
  if (cached) return structuredClone(cached);
  const raw = JSON.parse(
    readFileSync(protocolFixturePath("replay-git-state-parity-tape.json"), "utf8"),
  ) as Record<string, unknown>;
  const tape = validateParityTape(raw);
  cached = tape;
  return structuredClone(tape);
}

export function parityTapeCase(caseId: string): ParityTapeCase {
  const entry = loadCanonicalParityTape().cases.find((candidate) => candidate.id === caseId);
  if (!entry) throw new Error("Unknown canonical parity tape case.");
  return entry;
}

export function validateParityTape(raw: Record<string, unknown>): ParityTape {
  if (
    raw.id !== "remote-v3-replay-git-state-parity" ||
    raw.format !== "remote-v3-transition-tape" ||
    raw.versionBoundary !== "fixture-only-additive" ||
    raw.protocolVersion !== loadProtocolManifest().protocolVersion
  ) {
    throw new Error("Canonical parity tape metadata is invalid.");
  }
  assertEventFixtures();
  const cases: ParityTapeCase[] = [];
  appendCases(cases, raw, "lifecycle", "transitions");
  appendCases(cases, raw, "agent-status", "events");
  appendCases(cases, raw, "git-summaries", "events");
  appendCases(cases, raw, "git-state", "patches");
  appendCases(cases, raw, "git-interests", "messages");
  appendCases(cases, raw, "sequencing", "messages");
  const ids = new Set<string>();
  for (const entry of cases) {
    if (ids.has(entry.id)) throw new Error("Canonical parity tape contains duplicate case IDs.");
    ids.add(entry.id);
    validateTapeMessage(entry.message);
  }
  if (cases.length === 0) throw new Error("Canonical parity tape contains no cases.");
  return {
    id: String(raw.id),
    format: String(raw.format),
    protocolVersion: Number(raw.protocolVersion),
    versionBoundary: String(raw.versionBoundary),
    cases,
  };
}

export function parityTapeCaseIds(): readonly string[] {
  return loadCanonicalParityTape().cases.map((entry) => entry.id);
}

function appendCases(
  output: ParityTapeCase[],
  raw: Record<string, unknown>,
  family: ParityTapeCase["family"],
  listKey: string,
): void {
  const section =
    raw[
      family === "agent-status"
        ? "agentStatus"
        : family === "git-summaries"
          ? "gitSummaries"
          : family === "git-state"
            ? "gitState"
            : family === "git-interests"
              ? "gitInterests"
              : family
    ];
  if (!isRecord(section) || !Array.isArray(section[listKey])) {
    throw new Error("Canonical parity tape section is invalid.");
  }
  for (const item of section[listKey]) {
    if (!isRecord(item) || typeof item.id !== "string" || !isRecord(item.message)) {
      throw new Error("Canonical parity tape case is invalid.");
    }
    validateCaseShape(item, family);
    output.push({
      id: item.id,
      family,
      message: structuredClone(item.message),
      ...(isRecord(item.expected) ? { expected: structuredClone(item.expected) } : {}),
      ...(isRecord(item.before) ? { before: structuredClone(item.before) } : {}),
      ...(isRecord(item.expectedAfter)
        ? { expectedAfter: structuredClone(item.expectedAfter) }
        : {}),
      ...(Array.isArray(item.assertions)
        ? {
            assertions: item.assertions.filter(
              (value): value is string => typeof value === "string",
            ),
          }
        : {}),
      ...(Array.isArray(item.expectedThreadIds)
        ? {
            expectedThreadIds: item.expectedThreadIds.filter(
              (value): value is string => typeof value === "string",
            ),
          }
        : {}),
    });
  }
}

function validateCaseShape(item: Record<string, unknown>, family: ParityTapeCase["family"]): void {
  if (
    family === "lifecycle" &&
    (!isRecord(item.before) || !isRecord(item.expectedAfter) || !isStringArray(item.assertions))
  ) {
    throw new Error("Canonical lifecycle transition is incomplete.");
  }
  if (family === "agent-status" && !isRecord(item.expected)) {
    throw new Error("Canonical agent-status transition is incomplete.");
  }
  if (family === "git-summaries" && !isStringArray(item.expectedThreadIds)) {
    throw new Error("Canonical Git-summary transition is incomplete.");
  }
  if (family === "git-state" && !isRecord(item.expected)) {
    throw new Error("Canonical Git-state transition is incomplete.");
  }
  if (family === "sequencing") {
    if (!isRecord(item.expected) || typeof item.expected.disposition !== "string") {
      throw new Error("Canonical sequencing transition is incomplete.");
    }
    if (!isRecord(item.expected) || !Number.isSafeInteger(item.expected.cursor)) {
      throw new Error("Canonical sequencing cursor is invalid.");
    }
  }
}

function validateTapeMessage(message: Record<string, unknown>): void {
  const type = message.type;
  if (type === "git-state-interests") {
    remoteWebSocketClientMessageSchema.parse(message);
    return;
  }
  remoteWebSocketServerMessageSchema.parse(message);
  if (type === "event") {
    if (!Number.isSafeInteger(message.seq)) throw new Error("Tape event sequence is invalid.");
    validateReplayableEvent(message.event as Record<string, unknown>);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
