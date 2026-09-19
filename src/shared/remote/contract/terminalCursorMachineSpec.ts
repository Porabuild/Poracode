/**
 * THE terminal-cursor reconciliation state-machine spec (V5 plan item 5.2, the
 * named next slice). Baseline/output frame arbitration — stale watches, range
 * validation, pre-baseline buffering, generation changes, overlaps, gaps, and
 * the bounded display tail — was hand-duplicated across TS/Swift/Kotlin and had
 * already drifted (Android bounded the pre-baseline buffer by frame count too;
 * iOS bounded it by UTF-16 units only). This module is the ONE declarative
 * source: actions, resync reasons, bounds, and the ordered first-match rule
 * table. The native emitters
 * (`contract/native/emitTerminalCursor{Swift,Kotlin}.ts`) render it into the
 * same generated bundles as the wire contract and the pairing machine, and
 * `terminalCursorMachine.ts` is the executable TS reference the contract tests
 * run against the shared parity tape
 * (`protocol/remote/v3/fixtures/terminal-cursor-sequence.json`).
 *
 * Scope: the pure decision machine only. JSON frame decoding stays a
 * hand-written coordinator per platform (iOS `RichJSON`, Android
 * `kotlinx.serialization`), as do transports, UI, and refresh scheduling; they
 * consume the generated reconciler. The server-side cursor-sync bookkeeping
 * and the TS renderer feed are separate surfaces with their own consumers.
 *
 * The wire protocol is unchanged: nothing here touches routes, procedures, or
 * schemas — `buildRemoteV3IrDocument()` never reads this file.
 */

export const TERMINAL_CURSOR_MACHINE_ID = "terminalCursor" as const;
export const TERMINAL_CURSOR_MACHINE_SPEC_VERSION = 1 as const;

/** Frame kinds carried by the cursor-sync stream. */
export const TERMINAL_CURSOR_FRAME_KINDS = ["baseline", "output"] as const;
export type TerminalCursorFrameKind = (typeof TERMINAL_CURSOR_FRAME_KINDS)[number];

/** Consumer-facing reconciliation actions. The spelled-out values are the
 * tokens the shared parity fixture (`consumerAction`) asserts. */
export const TERMINAL_CURSOR_ACTIONS = [
  "buffer",
  "replace",
  "ignore",
  "append",
  "append-unseen-suffix",
  "resync",
] as const;
export type TerminalCursorAction = (typeof TERMINAL_CURSOR_ACTIONS)[number];

/** Why a frame armed the authoritative-refresh flag. `stale-watch` is
 * deliberately NOT a resync reason: a frame for a dead watch must never dirty
 * the live cursor. */
export const TERMINAL_CURSOR_RESYNC_REASONS = [
  "invalid-range",
  "missing-baseline",
  "generation-changed",
  "cursor-gap",
  "invalid-utf16-boundary",
] as const;
export type TerminalCursorResyncReason = (typeof TERMINAL_CURSOR_RESYNC_REASONS)[number];

/** Result-reason annotations beyond resync causes: `stale-watch` marks an
 * ignored frame addressed to a dead watch (informational — it never arms a
 * resync). */
export const TERMINAL_CURSOR_STALE_WATCH_REASON = "stale-watch" as const;
export type TerminalCursorResultReason =
  | TerminalCursorResyncReason
  | typeof TERMINAL_CURSOR_STALE_WATCH_REASON;

/** Named guards evaluated in table order; each has one generated and one TS
 * implementation driven by the rule table below. */
export const TERMINAL_CURSOR_GUARDS = [
  "always",
  "staleWatch",
  "invalidRange",
  "baselineResumeSuffix",
  "baseline",
  "preBaselineWithoutGeneration",
  "preBaselineOverBudget",
  "preBaseline",
  "pendingResync",
  "generationChanged",
  "upToDate",
  "cursorGap",
  "unappendableOverlap",
] as const;
export type TerminalCursorGuard = (typeof TERMINAL_CURSOR_GUARDS)[number];

export type TerminalCursorEffect =
  | "ignore"
  | "resync"
  | "buffer"
  | "replace"
  | "resumeSuffix"
  | "appendSuffix";

export interface TerminalCursorRule {
  readonly id: string;
  /** Restricts the row to one frame kind; omitted rows match every kind. */
  readonly kind?: TerminalCursorFrameKind;
  readonly guard: TerminalCursorGuard;
  /** Non-resync outcomes. `resumeSuffix` delegates to the append effect and
   * additionally clears a pending resync (the continuation is authoritative
   * through its toCursor). `appendSuffix` reports `append` at exact overlap
   * zero and `append-unseen-suffix` otherwise. */
  readonly effect: TerminalCursorEffect;
  readonly reason?: TerminalCursorResultReason;
  /** `resync` effects with `clearBufferedOutput` drop the pre-baseline buffer
   * before arming (an over-budget buffer is never replayed). */
  readonly clearBufferedOutput?: boolean;
}

/**
 * Cursor arithmetic is measured in UTF-16 code units on every platform — the
 * wire `fromCursor`/`toCursor` and every bound below count UTF-16 units, never
 * code points, so a surrogate pair in the tail can never desync the cursor.
 */
export const TERMINAL_CURSOR_BOUNDS = {
  cursorUnits: "utf-16-code-units",
  /** Bounded display tail; cursor positions remain absolute after trimming. */
  maximumTranscriptUtf16Units: 200_000,
  /** The pre-baseline buffer is bounded in units AND frames so a flood of
   * zero-length outputs cannot grow it without bound. */
  maximumBufferedUtf16Units: 200_000,
  maximumBufferedFrames: 1024,
} as const;

/**
 * Ordered first-match reconcile rules. The first matching row wins. The two
 * composite effects expand in the generated reconcilers exactly as documented:
 * `replace` rebuilds the cursor from the baseline and replays the buffered
 * pre-baseline frames only under a durable generation, aborting the replay at
 * the first resync; `resumeSuffix` appends the continuation and clears a
 * pending resync (its range covers everything through the new toCursor).
 */
export const TERMINAL_CURSOR_MACHINE_SPEC = {
  id: TERMINAL_CURSOR_MACHINE_ID,
  specVersion: TERMINAL_CURSOR_MACHINE_SPEC_VERSION,
  frameKinds: TERMINAL_CURSOR_FRAME_KINDS,
  actions: TERMINAL_CURSOR_ACTIONS,
  resyncReasons: TERMINAL_CURSOR_RESYNC_REASONS,
  guards: TERMINAL_CURSOR_GUARDS,
  bounds: TERMINAL_CURSOR_BOUNDS,
  rules: [
    {
      // A frame for a dead watch must never dirty the live cursor — and never
      // arm a resync either.
      id: "stale-watch",
      guard: "staleWatch",
      effect: "ignore",
      reason: "stale-watch",
    },
    {
      id: "invalid-range",
      guard: "invalidRange",
      effect: "resync",
      reason: "invalid-range",
    },
    {
      // Cursor-sync v2 resume suffix: an assembled baseline that continues
      // exactly at the retained position under the same durable generation
      // appends (the server served only the uncovered suffix).
      id: "baseline-resume-suffix",
      kind: "baseline",
      guard: "baselineResumeSuffix",
      effect: "resumeSuffix",
    },
    {
      // Full window, generation change, or gap — the baseline replaces.
      id: "baseline-replace",
      kind: "baseline",
      guard: "baseline",
      effect: "replace",
    },
    {
      id: "pre-baseline-without-generation",
      kind: "output",
      guard: "preBaselineWithoutGeneration",
      effect: "resync",
      reason: "missing-baseline",
    },
    {
      id: "pre-baseline-over-budget",
      kind: "output",
      guard: "preBaselineOverBudget",
      effect: "resync",
      reason: "missing-baseline",
      clearBufferedOutput: true,
    },
    {
      id: "pre-baseline-buffer",
      kind: "output",
      guard: "preBaseline",
      effect: "buffer",
    },
    {
      // A drift resync stays armed until an authoritative baseline arrives;
      // plain output never lifts it.
      id: "pending-resync",
      kind: "output",
      guard: "pendingResync",
      effect: "resync",
      reason: "missing-baseline",
    },
    {
      id: "generation-changed",
      kind: "output",
      guard: "generationChanged",
      effect: "resync",
      reason: "generation-changed",
    },
    {
      // At-or-behind output: already reflected in the retained transcript.
      id: "up-to-date",
      kind: "output",
      guard: "upToDate",
      effect: "ignore",
    },
    {
      id: "cursor-gap",
      kind: "output",
      guard: "cursorGap",
      effect: "resync",
      reason: "cursor-gap",
    },
    {
      id: "unappendable-overlap",
      kind: "output",
      guard: "unappendableOverlap",
      effect: "resync",
      reason: "invalid-utf16-boundary",
    },
    {
      // Catch-all: the frame overlaps the retained position; append only the
      // unseen suffix.
      id: "append-suffix",
      kind: "output",
      guard: "always",
      effect: "appendSuffix",
    },
  ] satisfies readonly TerminalCursorRule[],
} as const;

export type TerminalCursorMachineSpec = typeof TERMINAL_CURSOR_MACHINE_SPEC;

/** Validation accepts the literal spec or a structurally equal mutated copy
 * (the negative tests), so the rules list is widened to the declared
 * interface. */
export type TerminalCursorMachineSpecInput = Omit<TerminalCursorMachineSpec, "rules"> & {
  readonly rules: readonly TerminalCursorRule[];
};

/** Fails closed when the rule table is not ordered/sound, so a bad edit cannot
 * reach generation. */
export function validateTerminalCursorMachineSpec(spec: TerminalCursorMachineSpecInput): string[] {
  const errors: string[] = [];
  const guards = new Set<string>(spec.guards);
  const reasons = new Set<string>(spec.resyncReasons);
  const kinds = new Set<string>(spec.frameKinds);
  const seen = new Set<string>();
  for (const rule of spec.rules as readonly TerminalCursorRule[]) {
    if (!guards.has(rule.guard)) errors.push(`rule ${rule.id} names unknown guard ${rule.guard}`);
    if (rule.kind !== undefined && !kinds.has(rule.kind)) {
      errors.push(`rule ${rule.id} names unknown kind ${rule.kind}`);
    }
    if (rule.reason === "stale-watch") {
      if (rule.effect === "resync") {
        errors.push(`resync rule ${rule.id} cannot use the stale-watch annotation`);
      }
    } else if (rule.reason !== undefined && !reasons.has(rule.reason)) {
      errors.push(`rule ${rule.id} names unknown reason ${rule.reason}`);
    }
    if (rule.effect === "resync" && rule.reason === undefined) {
      errors.push(`resync rule ${rule.id} must name a reason`);
    }
    if (rule.effect !== "resync" && rule.clearBufferedOutput) {
      errors.push(`non-resync rule ${rule.id} cannot clear the buffer`);
    }
    if (rule.effect !== "resync" && rule.reason !== undefined && rule.reason !== "stale-watch") {
      errors.push(`non-resync rule ${rule.id} may only annotate stale-watch`);
    }
    if (rule.effect === "appendSuffix" && rule.guard !== "always") {
      errors.push(`append-suffix rule ${rule.id} must use the always guard`);
    }
    if (seen.has(rule.id)) errors.push(`duplicate rule id ${rule.id}`);
    seen.add(rule.id);
  }
  // The catch-all append row must be last so every earlier rule keeps priority.
  const last = spec.rules.at(-1);
  if (last?.effect !== "appendSuffix") {
    errors.push("the rule table must end with the append-suffix catch-all");
  }
  return errors;
}
