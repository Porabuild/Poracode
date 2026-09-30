import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "../../../src/shared/remote/protocol";

/**
 * Shared bounded-recovery semantics. This suite is the reference evaluator for
 * `fixtures/bounded-recovery-tape.json`; the Swift and Kotlin suites drive the
 * same tape through the production recovery buffers. The tape is client-local
 * bookkeeping (count/byte/age bounds, overflow recovery, replacement
 * supersede), so there is no wire shape or generated artifact to bump.
 */

const policySchema = z.object({
  maxCount: z.number().int().positive(),
  maxBytes: z.number().int().positive(),
  maxAgeMs: z.number().int().nonnegative(),
});

const retainedSchema = z.object({
  retainedSeqs: z.array(z.number().int()),
  retainedBytes: z.number().int().nonnegative(),
  coverageLost: z.boolean(),
});

const appendStepSchema = z.object({
  op: z.literal("append"),
  seq: z.number().int(),
  bytes: z.number().int().nonnegative(),
  atMs: z.number().int().nonnegative(),
});
const beginStepSchema = z.object({ op: z.literal("begin"), owner: z.string().min(1) });
const commitStepSchema = z.object({
  op: z.literal("commit"),
  owner: z.string().min(1),
  snapshotSeq: z.number().int(),
});
const resetStepSchema = z.object({
  op: z.literal("reset"),
  expectAfter: retainedSchema,
});
const advanceStepSchema = z.object({
  op: z.literal("advance"),
  atMs: z.number().int().nonnegative(),
});
const stepSchema = z.discriminatedUnion("op", [
  appendStepSchema,
  beginStepSchema,
  commitStepSchema,
  resetStepSchema,
  advanceStepSchema,
]);

const incrementalCaseSchema = z.object({
  id: z.string().min(1),
  policy: policySchema,
  steps: z.array(stepSchema).min(1),
  expected: retainedSchema.extend({
    commits: z.array(
      z.object({
        owner: z.string().min(1),
        snapshotSeq: z.number().int(),
        outcome: z.enum(["replayed", "stale"]),
        replaySeqs: z.array(z.number().int()),
        coverageLost: z.boolean(),
        released: z.boolean(),
      }),
    ),
  }),
});

const replacementCaseSchema = z.object({
  id: z.string().min(1),
  records: z.array(
    z.object({
      sequence: z.number().int(),
      state: z.string().min(1),
      target: z.string().min(1).optional(),
    }),
  ),
  reset: z.boolean().optional(),
  replayTarget: z.string().min(1).optional(),
  expected: z.object({
    retainedCount: z.number().int().nonnegative(),
    retainedSequence: z.number().int().nullable(),
    retainedState: z.string().min(1).nullable(),
    coverageLost: z.literal(false),
    replays: z.array(
      z.object({
        over: z.string().min(1),
        snapshotSeq: z.number().int(),
        state: z.string().min(1),
      }),
    ),
  }),
});

const tapeSchema = z.object({
  id: z.literal("remote-v3-bounded-recovery-tape"),
  format: z.literal("remote-v3-bounded-recovery-tape"),
  protocolVersion: z.number().int(),
  versionBoundary: z.literal("fixture-only-additive"),
  semantics: z.object({
    incremental: z.record(z.string(), z.string()),
    replacement: z.record(z.string(), z.string()),
  }),
  incrementalCases: z.array(incrementalCaseSchema).min(1),
  replacementCases: z.array(replacementCaseSchema).min(1),
});

type AppendStep = z.infer<typeof appendStepSchema>;
type BeginStep = z.infer<typeof beginStepSchema>;
type CommitStep = z.infer<typeof commitStepSchema>;
type ResetStep = z.infer<typeof resetStepSchema>;
type AdvanceStep = z.infer<typeof advanceStepSchema>;
type IncrementalCase = z.infer<typeof incrementalCaseSchema>;
type ReplacementCase = z.infer<typeof replacementCaseSchema>;

const tape = tapeSchema.parse(
  JSON.parse(
    readFileSync(new URL("./fixtures/bounded-recovery-tape.json", import.meta.url), "utf8"),
  ),
);

interface IncrementalFrame {
  readonly seq: number;
  readonly bytes: number;
  readonly atMs: number;
}

/**
 * Reference bounded incremental recovery buffer. Hard count/byte/retained-age
 * bounds against one monotonic clock, oldest-first eviction, and coverage loss
 * on any eviction or expiry. Arrivals and the clock share the tape's `atMs`
 * base: appends advance the clock to their arrival, `advance` steps move it
 * with no new input, and commit drops any retained frame that outlived
 * `maxAgeMs` before replaying.
 */
class ReferenceIncrementalBuffer {
  private frames: IncrementalFrame[] = [];
  private activeOwner: string | null = null;
  private clockMs = 0;
  coverageLost = false;

  constructor(private readonly policy: z.infer<typeof policySchema>) {}

  private byteCount(): number {
    return this.frames.reduce((total, frame) => total + frame.bytes, 0);
  }

  private expired(frame: IncrementalFrame): boolean {
    return this.clockMs - frame.atMs > this.policy.maxAgeMs;
  }

  begin(owner: string): void {
    this.activeOwner = owner;
    this.frames = [];
    this.coverageLost = false;
  }

  advance(atMs: number): void {
    this.clockMs = Math.max(this.clockMs, atMs);
  }

  append(seq: number, bytes: number, atMs: number): boolean {
    if (this.activeOwner === null) return false;
    this.advance(atMs);
    this.frames.push({ seq, bytes, atMs });
    for (;;) {
      const oldest = this.frames.at(0);
      const overCount = this.frames.length > this.policy.maxCount;
      const overBytes = this.byteCount() > this.policy.maxBytes;
      const overAge = oldest !== undefined && this.expired(oldest);
      if (!overCount && !overBytes && !overAge) break;
      this.frames.shift();
      this.coverageLost = true;
    }
    return true;
  }

  reset(): void {
    this.activeOwner = null;
    this.frames = [];
    this.coverageLost = false;
  }

  retained(): { retainedSeqs: number[]; retainedBytes: number; coverageLost: boolean } {
    return {
      retainedSeqs: this.frames.map((frame) => frame.seq),
      retainedBytes: this.byteCount(),
      coverageLost: this.coverageLost,
    };
  }

  commit(owner: string, snapshotSeq: number) {
    if (this.activeOwner !== owner) {
      return {
        outcome: "stale" as const,
        replaySeqs: [] as number[],
        coverageLost: this.coverageLost,
        released: this.frames.length === 0,
      };
    }
    // Expiry is evaluated again at commit: a hung or quiet read releases its
    // payload here and demands recovery instead of replaying stale frames.
    const expired = this.frames.filter((frame) => this.expired(frame));
    if (expired.length > 0) {
      const expiredSeqs = new Set(expired.map((frame) => frame.seq));
      this.frames = this.frames.filter((frame) => !expiredSeqs.has(frame.seq));
      this.coverageLost = true;
    }
    const coverageLost = this.coverageLost;
    const replaySeqs = this.frames
      .filter((frame) => frame.seq > snapshotSeq)
      .map((frame) => frame.seq);
    this.reset();
    return { outcome: "replayed" as const, replaySeqs, coverageLost, released: true };
  }
}

class ReferenceReplacementSlot {
  private retained: { sequence: number; state: string; target: string } | null = null;
  coverageLost = false;

  record(sequence: number, state: string, target: string): void {
    if (this.retained === null || sequence >= this.retained.sequence) {
      this.retained = { sequence, state, target };
    }
  }

  replay(over: string, snapshotSeq: number, target: string): string {
    if (this.retained === null) return over;
    if (this.retained.target !== target) return over;
    return this.retained.sequence > snapshotSeq ? this.retained.state : over;
  }

  reset(): void {
    this.retained = null;
  }

  retainedState(): {
    retainedCount: number;
    retainedSequence: number | null;
    retainedState: string | null;
  } {
    return {
      retainedCount: this.retained === null ? 0 : 1,
      retainedSequence: this.retained?.sequence ?? null,
      retainedState: this.retained?.state ?? null,
    };
  }
}

function assertAppend(buffer: ReferenceIncrementalBuffer, step: AppendStep): void {
  expect(buffer.append(step.seq, step.bytes, step.atMs)).toBe(true);
}

function assertBegin(buffer: ReferenceIncrementalBuffer, step: BeginStep): void {
  buffer.begin(step.owner);
}

function assertReset(buffer: ReferenceIncrementalBuffer, step: ResetStep): void {
  buffer.reset();
  expect(buffer.retained()).toEqual(step.expectAfter);
}

function assertAdvance(buffer: ReferenceIncrementalBuffer, step: AdvanceStep): void {
  buffer.advance(step.atMs);
}

function assertCommit(
  buffer: ReferenceIncrementalBuffer,
  entry: IncrementalCase,
  step: CommitStep,
  commitIndex: number,
): number {
  const expected = entry.expected.commits[commitIndex];
  if (expected === undefined)
    throw new Error(`${entry.id}: missing expected commit ${commitIndex}`);
  expect(expected.owner).toBe(step.owner);
  expect(expected.snapshotSeq).toBe(step.snapshotSeq);
  expect(buffer.commit(step.owner, step.snapshotSeq)).toEqual({
    outcome: expected.outcome,
    replaySeqs: expected.replaySeqs,
    coverageLost: expected.coverageLost,
    released: expected.released,
  });
  return commitIndex + 1;
}

function evaluateIncrementalCase(entry: IncrementalCase): void {
  const buffer = new ReferenceIncrementalBuffer(entry.policy);
  let commitIndex = 0;
  let windowBeforeFirstCommit: ReturnType<ReferenceIncrementalBuffer["retained"]> | null = null;
  for (const step of entry.steps) {
    switch (step.op) {
      case "begin":
        assertBegin(buffer, step);
        break;
      case "append":
        assertAppend(buffer, step);
        break;
      case "reset":
        assertReset(buffer, step);
        break;
      case "advance":
        assertAdvance(buffer, step);
        break;
      case "commit":
        windowBeforeFirstCommit ??= buffer.retained();
        commitIndex = assertCommit(buffer, entry, step, commitIndex);
        break;
    }
  }
  expect(commitIndex).toBe(entry.expected.commits.length);
  expect(windowBeforeFirstCommit).toEqual({
    retainedSeqs: entry.expected.retainedSeqs,
    retainedBytes: entry.expected.retainedBytes,
    coverageLost: entry.expected.coverageLost,
  });
}

function assertReplay(
  slot: ReferenceReplacementSlot,
  entry: ReplacementCase,
  replay: ReplacementCase["expected"]["replays"][number],
): void {
  const target = entry.replayTarget ?? "target-1";
  expect(slot.replay(replay.over, replay.snapshotSeq, target)).toBe(replay.state);
}

function evaluateReplacementCase(entry: ReplacementCase): void {
  const slot = new ReferenceReplacementSlot();
  for (const record of entry.records) {
    slot.record(record.sequence, record.state, record.target ?? "target-1");
  }
  if (entry.reset === true) slot.reset();
  expect({
    ...slot.retainedState(),
    coverageLost: slot.coverageLost,
  }).toEqual({
    retainedCount: entry.expected.retainedCount,
    retainedSequence: entry.expected.retainedSequence,
    retainedState: entry.expected.retainedState,
    coverageLost: entry.expected.coverageLost,
  });
  entry.expected.replays.forEach((replay) => {
    assertReplay(slot, entry, replay);
  });
}

describe("bounded-recovery tape (shared client-local semantics)", () => {
  it("pins the protocol version and additive fixture boundary", () => {
    expect(tape.protocolVersion).toBe(PORACODE_REMOTE_PROTOCOL_VERSION);
    expect(tape.semantics.incremental["overflow"]).toContain("authoritative recovery");
    expect(tape.semantics.incremental["bounds"]).toContain("monotonic");
    expect(tape.semantics.incremental["age"]).toContain("commit");
    expect(tape.semantics.replacement["overflow"]).toContain("never");
  });

  it.each(tape.incrementalCases.map((entry) => [entry.id, entry] as const))(
    "incremental: %s",
    (_id, entry) => {
      // Every incremental case must pin at least one commit outcome.
      expect(entry.expected.commits.length).toBeGreaterThan(0);
      evaluateIncrementalCase(entry);
    },
  );

  it.each(tape.replacementCases.map((entry) => [entry.id, entry] as const))(
    "replacement: %s",
    (_id, entry) => {
      // Every replacement case must record at least one state.
      expect(entry.records.length).toBeGreaterThan(0);
      evaluateReplacementCase(entry);
    },
  );
});
