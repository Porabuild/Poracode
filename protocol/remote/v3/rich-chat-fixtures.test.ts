import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  canonicalContentBlockSchema,
  canonicalRequestTypeSchema,
  messageItemPayloadSchema,
  promptSegmentSchema,
  reasoningItemPayloadSchema,
  requestOutcomeSchema,
  runtimeEventSchema,
  toolCallPayloadSchema,
} from "../../../src/shared/contracts";
import type { SupervisorEvent } from "../../../src/shared/ipc/events";
import {
  persistedCompletedTurnSchema,
  persistedRuntimeItemSchema,
} from "../../../src/shared/ipc/schemas";
import { classifyInlineImageCandidate } from "../../../src/shared/inlineImagePayload";
import { REMOTE_CONTRACT_REGISTRY } from "../../../src/shared/remote/contract/registry";
import type {
  RemoteHttpRouteContract,
  RemoteProcedureContract,
} from "../../../src/shared/remote/contract/types";
import { readRemoteImageRef, remoteImageRefPath } from "../../../src/shared/remote/imageRef";
import { isRemoteOmittedField } from "../../../src/shared/remote/omittedPayload";
import {
  remoteThreadSnapshotSchema,
  remoteWebSocketServerMessageSchema,
} from "../../../src/shared/remote/protocol";
import { applyRuntimeEventsToState } from "../../../src/renderer/state/slices/runtimeEventReducer";
import {
  canAppendTerminalCursorRange,
  isStaleTerminalWatchId,
} from "../../../src/main/remote/server/terminalCursorSync";
import { MAX_ATTACHMENT_BODY_BYTES } from "../../../src/main/remote/server/requestBody";

const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

const FIXTURE_NAMES = [
  "attachment-boundaries.json",
  "checkpoint-turn-sequences.json",
  "rich-content-blocks.json",
  "rich-image-markers.json",
  "rich-persisted-transcript.json",
  "rich-request-events.json",
  "rich-stream-cases.json",
  "terminal-cursor-sequence.json",
  "thread-pending-steer-envelope.json",
] as const;

type JsonObject = Record<string, unknown>;

function readFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixtureDirectory, name), "utf8")) as T;
}

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function route(id: string): RemoteHttpRouteContract {
  const contract = REMOTE_CONTRACT_REGISTRY.routes.find((candidate) => candidate.id === id);
  if (!contract) throw new Error(`Missing route ${id}`);
  return contract;
}

function procedure(name: string): RemoteProcedureContract {
  const contract = REMOTE_CONTRACT_REGISTRY.procedures.find((candidate) => candidate.name === name);
  if (!contract) throw new Error(`Missing procedure ${name}`);
  return contract;
}

const pendingSteerEnvelopeSchema: z.ZodType<
  Extract<SupervisorEvent, { type: "thread-pending-steer" }>
> = z.object({
  type: z.literal("thread-pending-steer"),
  threadId: z.string().min(1),
  pending: z
    .object({
      id: z.string().min(1),
      prompt: z.string(),
      segments: z.array(promptSegmentSchema).optional(),
      stagedAt: z.number().finite(),
    })
    .nullable(),
});

describe("remote v3 rich chat fixture foundation", () => {
  it("keeps every new fixture standalone, plain JSON, and compact", () => {
    for (const name of FIXTURE_NAMES) {
      const raw = readFileSync(join(fixtureDirectory, name), "utf8");
      expect(raw.startsWith("\uFEFF"), `${name} must not have a BOM`).toBe(false);
      expect(raw.split("\n").length, `${name} must stay under 500 lines`).toBeLessThan(500);
      const parsed = JSON.parse(raw) as unknown;
      expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed);
    }
  });

  it("covers every canonical content block discriminator exactly once", () => {
    const fixture = readFixture<{ accepted: unknown[]; rejected: unknown[] }>(
      "rich-content-blocks.json",
    );
    const accepted = fixture.accepted.map((entry, index) => object(entry, `accepted[${index}]`));
    const blocks = accepted.map((entry) => canonicalContentBlockSchema.parse(entry.block));
    expect(blocks.map((block) => block.kind)).toEqual([
      "text",
      "skill",
      "mcp",
      "diff_comment",
      "image",
      "file",
    ]);
    expect(new Set(blocks.map((block) => block.kind)).size).toBe(
      canonicalContentBlockSchema.options.length,
    );
    for (const entry of fixture.rejected) {
      expect(canonicalContentBlockSchema.safeParse(object(entry, "rejected").block).success).toBe(
        false,
      );
    }
  });

  it("parses a rich persisted transcript and keeps parent and turn anchors resolvable", () => {
    const base = object(readFixture("thread-history.json"), "base thread snapshot");
    const fixture = readFixture<{ runtimeItems: unknown[]; completedTurns: unknown[] }>(
      "rich-persisted-transcript.json",
    );
    const snapshot = remoteThreadSnapshotSchema.parse({
      ...base,
      runtimeItems: fixture.runtimeItems,
      completedTurns: fixture.completedTurns,
    });
    const byId = new Map(snapshot.runtimeItems.map((item) => [item.id, item]));
    for (const item of snapshot.runtimeItems) {
      persistedRuntimeItemSchema.parse(item);
      if (item.type === "user_message" || item.type === "assistant_message") {
        messageItemPayloadSchema.parse(item.payload);
      } else if (item.type === "tool_call") {
        toolCallPayloadSchema.parse(item.payload);
      } else if (item.type === "reasoning") {
        reasoningItemPayloadSchema.parse(item.payload);
      }
    }
    expect(
      snapshot.runtimeItems
        .filter((item) => item.parentItemId)
        .map((item) => byId.get(item.parentItemId ?? "")?.type),
    ).toEqual(["tool_call", "tool_call"]);
    for (const turn of snapshot.completedTurns) {
      persistedCompletedTurnSchema.parse(turn);
      expect(turn.anchorItemId && byId.get(turn.anchorItemId)?.parentItemId).toBeUndefined();
    }
    expect(snapshot.runtimeItems.filter((item) => item.parentItemId)).toHaveLength(2);
    expect(snapshot.completedTurns.map((turn) => turn.anchorItemId)).toEqual([
      "rich-assistant-1",
      "rich-assistant-2",
    ]);
  });

  it("keeps schema-valid stream cases separate from renderer reduction conventions", () => {
    const fixture = readFixture<{
      schemaAuthority: string;
      rendererConventionCases: Array<{ id: string; events: unknown[]; expected: unknown }>;
    }>("rich-stream-cases.json");
    expect(fixture.schemaAuthority).toContain("does not define reduction semantics");
    expect(fixture.rendererConventionCases.map((entry) => entry.id)).toEqual([
      "ordered-shallow-update",
      "null-update-replaces-payload",
      "late-events-keep-completed-state",
      "orphan-late-events-ignored",
    ]);

    for (const entry of fixture.rendererConventionCases) {
      const events = entry.events.map((event) => runtimeEventSchema.parse(event));
      const state = {
        runtimeItemIdsByThread: {},
        runtimeItemsByIdByThread: {},
        runtimeRequestsByThread: {},
        runtimeContextByThread: {},
        runtimeStructuralVersionByThread: {},
        runtimeCompletedTurnsByThread: {},
        runtimeOpenTurnByThread: {},
        threads: [],
      };
      const patch = applyRuntimeEventsToState(state as never, "thread-rich", events);
      const reduced = {
        ...state,
        ...patch,
      }.runtimeItemsByIdByThread["thread-rich"]?.[events[0]?.itemId ?? ""];
      const actual = reduced
        ? { state: reduced.state, payload: reduced.payload, streams: reduced.streams }
        : null;
      expect({ id: entry.id, actual }).toEqual({ id: entry.id, actual: entry.expected });
    }
  });

  it("covers every schema-authoritative request type and outcome", () => {
    const fixture = readFixture<{ opened: unknown[]; resolved: unknown[] }>(
      "rich-request-events.json",
    );
    const opened = fixture.opened.map((event) => runtimeEventSchema.parse(event));
    const resolved = fixture.resolved.map((event) => runtimeEventSchema.parse(event));
    expect(
      opened.map((event) => (event.type === "request.opened" ? event.requestType : null)),
    ).toEqual(canonicalRequestTypeSchema.options);
    expect(
      resolved.map((event) => (event.type === "request.resolved" ? event.outcome : null)),
    ).toEqual(requestOutcomeSchema.options);
  });

  it("validates pending-steer route bodies and the explicitly mirrored IPC envelope", () => {
    const fixture = readFixture<{
      authority: JsonObject;
      setBody: unknown;
      clearBody: unknown;
      broadcasts: unknown[];
    }>("thread-pending-steer-envelope.json");
    expect(fixture.authority.broadcastEnvelope).toContain("TypeScript shape mirrored");
    expect(route("thread-steer-set").request.jsonSchema?.parse(fixture.setBody)).toEqual(
      fixture.setBody,
    );
    expect(route("thread-steer-clear").request.jsonSchema?.parse(fixture.clearBody)).toEqual({});
    expect(fixture.broadcasts.map((event) => pendingSteerEnvelopeSchema.parse(event))).toEqual(
      fixture.broadcasts,
    );
  });

  it("reuses existing markers and rejects unsafe image sources at the shared display policy", () => {
    const existingRef = readRemoteImageRef(readFixture("image-ref.json"));
    expect(existingRef && remoteImageRefPath(existingRef)).toContain("/api/threads/");
    expect(isRemoteOmittedField(readFixture("omitted-field.json"))).toBe(true);

    const fixture = readFixture<{
      valid: JsonObject;
      invalidRefs: Array<{ id: string; value: unknown }>;
      sharedDisplayPolicyCases: Array<{ id: string; source: string }>;
      schemaGap: string;
    }>("rich-image-markers.json");
    expect(readRemoteImageRef(fixture.valid.nestedRef)?.path).toEqual([
      "result",
      "content",
      1,
      "data",
    ]);
    expect(isRemoteOmittedField(fixture.valid.omitted)).toBe(true);
    expect(fixture.invalidRefs.map((entry) => readRemoteImageRef(entry.value))).toEqual([
      null,
      null,
    ]);
    expect(
      fixture.sharedDisplayPolicyCases.map((entry) => ({
        id: entry.id,
        classification: classifyInlineImageCandidate(entry.source),
        schemaAccepted: canonicalContentBlockSchema.safeParse({
          kind: "image",
          mimeType: "image/png",
          dataUrl: entry.source,
        }).success,
      })),
    ).toEqual(
      fixture.sharedDisplayPolicyCases.map((entry) => ({
        id: entry.id,
        classification: null,
        schemaAccepted: true,
      })),
    );
    expect(fixture.schemaGap).toContain("constrains dataUrl only as string");
  });

  it("parses cursor messages and locks only authoritative stale/range decisions", () => {
    const fixture = readFixture<{
      consumerConvention: string;
      steps: Array<{
        id: string;
        currentWatchId: string;
        previous: { generation: string | null; toCursor: number } | null;
        message: unknown;
        expected: { stale: boolean; appendCompatible: boolean; consumerAction: string };
      }>;
    }>("terminal-cursor-sequence.json");
    expect(fixture.consumerConvention).toContain("not encoded by the wire schema");
    expect(fixture.steps.map((step) => step.id)).toEqual([
      "pre-baseline",
      "baseline",
      "duplicate",
      "overlap",
      "gap",
      "generation-change",
      "null-generation",
      "stale-watch",
    ]);
    const decisions = fixture.steps.map((step) => {
      const message = remoteWebSocketServerMessageSchema.parse(step.message);
      if (message.type !== "terminal-output" && message.type !== "terminal-watch-result") {
        throw new Error(`${step.id} is not a cursor message`);
      }
      const sync = message.cursorSync;
      const range =
        message.type === "terminal-output"
          ? sync
          : sync.result.status === "ready"
            ? sync.result
            : null;
      if (!range) throw new Error(`${step.id} has no ready range`);
      return {
        id: step.id,
        stale: isStaleTerminalWatchId(step.currentWatchId, sync.watchId),
        appendCompatible: canAppendTerminalCursorRange(step.previous, range),
      };
    });
    expect(decisions).toEqual(
      fixture.steps.map((step) => ({
        id: step.id,
        stale: step.expected.stale,
        appendCompatible: step.expected.appendCompatible,
      })),
    );
    expect(fixture.steps.map((step) => step.expected.consumerAction)).toEqual([
      "buffer",
      "replace",
      "ignore",
      "append-unseen-suffix",
      "resync",
      "resync",
      "replace",
      "ignore",
    ]);
  });

  it("locks attachment metadata boundaries without allocating binary blobs", () => {
    const fixture = readFixture<{
      limits: { maxBytes: number; maxNameCharacters: number };
      cases: Array<{
        id: string;
        bytes: number;
        nameLength: number;
        expected: { queryValid: boolean; bodyWithinLimit: boolean; accepted: boolean };
      }>;
    }>("attachment-boundaries.json");
    expect(fixture.limits).toEqual({ maxBytes: MAX_ATTACHMENT_BODY_BYTES, maxNameCharacters: 255 });
    const querySchema = route("attachment-upload").request.querySchema;
    if (!querySchema) throw new Error("attachment-upload query schema is missing");
    const actual = fixture.cases.map((entry) => {
      const queryValid = querySchema.safeParse({
        threadId: "thread-rich",
        name: "n".repeat(entry.nameLength),
      }).success;
      const bodyWithinLimit = entry.bytes <= MAX_ATTACHMENT_BODY_BYTES;
      return {
        id: entry.id,
        queryValid,
        bodyWithinLimit,
        accepted: queryValid && bodyWithinLimit && entry.bytes > 0,
      };
    });
    expect(actual).toEqual(
      fixture.cases.map((entry) => ({
        id: entry.id,
        queryValid: entry.expected.queryValid,
        bodyWithinLimit: entry.expected.bodyWithinLimit,
        accepted: entry.expected.accepted,
      })),
    );
  });

  it("parses capture/finalize/list checkpoint turn sequences through procedure contracts", () => {
    const fixture = readFixture<{
      captures: Array<{ request: unknown; result: unknown }>;
      turns: Array<{ request: unknown; result: unknown }>;
      listRequest: unknown;
      listResult: unknown;
    }>("checkpoint-turn-sequences.json");
    const create = procedure("createFileCheckpoint");
    const finalize = procedure("finalizeFileCheckpoint");
    const list = procedure("listFileCheckpoints");
    for (const entry of fixture.captures) {
      create.requestSchema.parse(entry.request);
      create.resultSchema.parse(entry.result);
    }
    const capturedIds = new Set(
      fixture.captures.map(
        (entry) =>
          object(object(entry.result, "capture").checkpoint, "checkpoint").checkpointItemId,
      ),
    );
    for (const entry of fixture.turns) {
      finalize.requestSchema.parse(entry.request);
      finalize.resultSchema.parse(entry.result);
      const request = object(entry.request, "finalize request");
      const checkpoint = object(object(entry.result, "finalize result").checkpoint, "checkpoint");
      expect(checkpoint.checkpointItemId).toBe(request.checkpointItemId);
      expect(checkpoint.baseCheckpointItemId).toBe(request.baseCheckpointItemId);
      expect(capturedIds.has(checkpoint.baseCheckpointItemId)).toBe(true);
    }
    list.requestSchema.parse(fixture.listRequest);
    const listed = object(list.resultSchema.parse(fixture.listResult), "list result");
    expect(array(listed.checkpoints, "checkpoints")).toHaveLength(2);
    expect(array(listed.turns, "turns")).toHaveLength(2);
  });
});
