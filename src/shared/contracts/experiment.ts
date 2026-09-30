import { z } from "zod";
import { agentInstanceIdSchema } from "./agentInstance";
import { agentKindSchema, projectLocationSchema, threadPresentationModeSchema } from "./common";
import { threadConfigSchema } from "./config";
import { fullCommitOidSchema } from "./git";
import { promptSegmentSchema } from "./thread";

export const EXPERIMENT_STORE_KEY = "poracode-experiments-v1";
// Stays 1: `segments` accepts thread mention segments additively. Older apps
// parsing an experiment that carries one drop that record fail-soft
// (experimentStore filters `result.success`), so no migration is required.
export const EXPERIMENT_STORE_VERSION = 1;
export const MAX_EXPERIMENT_CANDIDATES = 8;
export const MAX_EXPERIMENT_DIFF_LENGTH = 2_000_000;
export const MAX_EXPERIMENT_RESPONSE_LENGTH = 200_000;
export const MAX_EXPERIMENT_PROMPT_LENGTH = 100_000;
// Contents are captured for at most this many code-like untracked files.
// Additional files remain visible to the judge as a path list.
export const MAX_EXPERIMENT_UNTRACKED_FILES = 200;
export const experimentJudgeModeSchema = z.enum(["changes", "responses"]);
export type ExperimentJudgeMode = z.infer<typeof experimentJudgeModeSchema>;

const nonBlankPromptSchema = z
  .string()
  .min(1)
  .max(MAX_EXPERIMENT_PROMPT_LENGTH)
  .refine((value) => value.trim().length > 0, "Prompt must contain non-whitespace characters");

export const experimentCandidateSchema = z.object({
  threadId: z.string().min(1),
  agentKind: agentKindSchema,
  agentLabel: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  effort: z.string().min(1).optional(),
  fast: z.boolean().optional(),
  worktreePath: z.string().min(1).optional(),
  worktreeBranch: z.string().min(1),
  worktreeOwnerToken: z.string().min(1).max(128),
  worktreeState: z.enum(["pending", "owned", "removed"]),
});
export type ExperimentCandidate = z.infer<typeof experimentCandidateSchema>;

const experimentCrownCommon = {
  threadId: z.string().min(1),
  createdAt: z.string().min(1),
  snapshotHash: z.string().min(1).optional(),
};

export const experimentJudgeAssessmentSchema = z.object({
  threadId: z.string().min(1),
  rationale: z.string().min(1),
});
export type ExperimentJudgeAssessment = z.infer<typeof experimentJudgeAssessmentSchema>;

export const experimentCrownSchema = z.discriminatedUnion("source", [
  z.object({
    ...experimentCrownCommon,
    source: z.literal("ai"),
    comparisonMode: experimentJudgeModeSchema.optional(),
    rationale: z
      .string()
      .min(1)
      .refine((value) => value.trim().length > 0, "Rationale must not be blank"),
    assessments: z.array(experimentJudgeAssessmentSchema).min(2).optional(),
    modelLabel: z.string().min(1).optional(),
  }),
  z.object({
    ...experimentCrownCommon,
    source: z.literal("user"),
    rationale: z.never().optional(),
    modelLabel: z.never().optional(),
  }),
]);
export type ExperimentCrown = z.infer<typeof experimentCrownSchema>;

export const experimentStatusSchema = z.enum(["running", "decided"]);
export type ExperimentStatus = z.infer<typeof experimentStatusSchema>;

export const experimentSchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    title: z.string().min(1),
    prompt: nonBlankPromptSchema,
    segments: z.array(promptSegmentSchema).optional(),
    baseBranch: z.string().min(1),
    baseCommit: fullCommitOidSchema,
    candidates: z.array(experimentCandidateSchema).min(2).max(MAX_EXPERIMENT_CANDIDATES),
    winnerThreadId: z.string().min(1).optional(),
    crown: experimentCrownSchema.optional(),
    status: experimentStatusSchema,
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .superRefine((experiment, ctx) => {
    const candidateIds = new Set<string>();
    experiment.candidates.forEach((candidate, index) => {
      if (candidateIds.has(candidate.threadId)) {
        ctx.addIssue({
          code: "custom",
          message: "Candidate thread ids must be unique",
          path: ["candidates", index, "threadId"],
        });
      }
      candidateIds.add(candidate.threadId);
    });

    if (experiment.winnerThreadId && !candidateIds.has(experiment.winnerThreadId)) {
      ctx.addIssue({
        code: "custom",
        message: "Winner must be one of the experiment candidates",
        path: ["winnerThreadId"],
      });
    }
    if (experiment.crown && !candidateIds.has(experiment.crown.threadId)) {
      ctx.addIssue({
        code: "custom",
        message: "Crown must reference an experiment candidate",
        path: ["crown", "threadId"],
      });
    }
    if (experiment.status === "decided" && !experiment.winnerThreadId) {
      ctx.addIssue({
        code: "custom",
        message: "A decided experiment must have a winner",
        path: ["winnerThreadId"],
      });
    }
    if (experiment.status === "running" && experiment.winnerThreadId) {
      ctx.addIssue({
        code: "custom",
        message: "A running experiment cannot have a winner",
        path: ["winnerThreadId"],
      });
    }
    if (
      experiment.status === "decided" &&
      experiment.crown &&
      experiment.winnerThreadId !== experiment.crown.threadId
    ) {
      ctx.addIssue({
        code: "custom",
        message: "The experiment winner must match the crowned candidate",
        path: ["winnerThreadId"],
      });
    }
  });
export type Experiment = z.infer<typeof experimentSchema>;

function uniqueCandidateIds(
  candidates: readonly { threadId: string }[],
  ctx: z.RefinementCtx,
): void {
  const ids = new Set<string>();
  candidates.forEach((candidate, index) => {
    if (ids.has(candidate.threadId)) {
      ctx.addIssue({
        code: "custom",
        message: "Candidate thread ids must be unique",
        path: ["candidates", index, "threadId"],
      });
    }
    ids.add(candidate.threadId);
  });
}

export const judgeExperimentCandidateSchema = z.object({
  threadId: z.string().min(1),
  diff: z.string().max(MAX_EXPERIMENT_DIFF_LENGTH),
  omittedFiles: z.number().int().nonnegative().optional(),
});
export type JudgeExperimentCandidate = z.infer<typeof judgeExperimentCandidateSchema>;

export const judgeExperimentPayloadSchema = z
  .object({
    experimentId: z.string().min(1),
    projectLocation: projectLocationSchema,
    agentKind: agentKindSchema,
    model: z.string().min(1).optional(),
    effort: z.string().min(1).optional(),
    fast: z.boolean().optional(),
    mode: experimentJudgeModeSchema.optional(),
    prompt: nonBlankPromptSchema,
    candidates: z.array(judgeExperimentCandidateSchema).min(2).max(MAX_EXPERIMENT_CANDIDATES),
  })
  .superRefine(({ candidates }, ctx) => uniqueCandidateIds(candidates, ctx));
export type JudgeExperimentPayload = z.infer<typeof judgeExperimentPayloadSchema>;

export interface JudgeExperimentResult {
  winnerThreadId: string;
  rationale: string;
  assessments: ExperimentJudgeAssessment[];
}

const experimentWorktreeCandidateSchema = z.object({
  threadId: z.string().min(1),
  branch: z.string().min(1),
  ownerToken: z.string().min(1).max(128),
  worktreePath: z.string().min(1).optional(),
});

export const createExperimentWorktreesPayloadSchema = z
  .object({
    projectLocation: projectLocationSchema,
    sourceBranch: z.string().min(1).max(255),
    baseCommit: fullCommitOidSchema,
    candidates: z
      .array(experimentWorktreeCandidateSchema.omit({ worktreePath: true }))
      .min(2)
      .max(MAX_EXPERIMENT_CANDIDATES),
    worktreeRoot: z.string().min(1).optional(),
    worktreeOmitRepoDir: z.boolean().optional(),
    copyIgnoredPatterns: z.array(z.string()).optional(),
  })
  .superRefine(({ candidates }, ctx) => uniqueCandidateIds(candidates, ctx));
export type CreateExperimentWorktreesPayload = z.infer<
  typeof createExperimentWorktreesPayloadSchema
>;

export interface ExperimentWorktreeBatchItemResult {
  threadId: string;
  branch: string;
  path?: string;
  error?: string;
}

export interface CreateExperimentWorktreesResult {
  candidates: ExperimentWorktreeBatchItemResult[];
}

export const removeExperimentWorktreesPayloadSchema = z
  .object({
    projectLocation: projectLocationSchema,
    candidates: z.array(experimentWorktreeCandidateSchema).min(1).max(MAX_EXPERIMENT_CANDIDATES),
  })
  .superRefine(({ candidates }, ctx) => uniqueCandidateIds(candidates, ctx));
export type RemoveExperimentWorktreesPayload = z.infer<
  typeof removeExperimentWorktreesPayloadSchema
>;

export interface RemoveExperimentWorktreesResult {
  candidates: ExperimentWorktreeBatchItemResult[];
}

export const experimentSnapshotCandidateSchema = experimentWorktreeCandidateSchema;
export type ExperimentSnapshotCandidate = z.infer<typeof experimentSnapshotCandidateSchema>;

export const captureExperimentSnapshotPayloadSchema = z
  .object({
    experimentId: z.string().min(1),
    projectLocation: projectLocationSchema,
    baseCommit: fullCommitOidSchema,
    candidates: z.array(experimentSnapshotCandidateSchema).min(2).max(MAX_EXPERIMENT_CANDIDATES),
  })
  .superRefine(({ candidates }, ctx) => uniqueCandidateIds(candidates, ctx));
export type CaptureExperimentSnapshotPayload = z.infer<
  typeof captureExperimentSnapshotPayloadSchema
>;

export interface ExperimentSnapshotCandidateResult {
  threadId: string;
  headCommit: string;
  files: number;
  insertions: number;
  deletions: number;
  omittedFiles?: number;
}

export interface CaptureExperimentSnapshotResult {
  hash: string;
  candidates: ExperimentSnapshotCandidateResult[];
}

const experimentResponseCandidateSchema = z.object({
  threadId: z.string().min(1),
  response: z.string().max(MAX_EXPERIMENT_RESPONSE_LENGTH),
});

export const judgeExperimentSnapshotPayloadSchema = captureExperimentSnapshotPayloadSchema
  .and(
    z.object({
      agentKind: agentKindSchema,
      model: z.string().min(1).optional(),
      effort: z.string().min(1).optional(),
      fast: z.boolean().optional(),
      mode: experimentJudgeModeSchema.optional(),
      responses: z.array(experimentResponseCandidateSchema).optional(),
      prompt: nonBlankPromptSchema,
    }),
  )
  .superRefine(({ candidates, mode, responses }, ctx) => {
    if (mode !== "responses") return;
    if (!responses || responses.length !== candidates.length) {
      ctx.addIssue({
        code: "custom",
        message: "Chat response candidates must match experiment candidates",
        path: ["responses"],
      });
      return;
    }
    const responseIds = new Set(responses.map((candidate) => candidate.threadId));
    if (
      responseIds.size !== responses.length ||
      candidates.some((candidate) => !responseIds.has(candidate.threadId))
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Chat response candidates must match experiment candidates",
        path: ["responses"],
      });
    }
  });
export type JudgeExperimentSnapshotPayload = z.infer<typeof judgeExperimentSnapshotPayloadSchema>;

export interface JudgeExperimentSnapshotResult {
  hash: string;
  winnerThreadId: string;
  rationale: string;
  assessments: ExperimentJudgeAssessment[];
}

export const cancelJudgeExperimentPayloadSchema = z.object({
  experimentId: z.string().min(1),
});
export type CancelJudgeExperimentPayload = z.infer<typeof cancelJudgeExperimentPayloadSchema>;

export const getExperimentCandidateDiffPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  baseRef: fullCommitOidSchema,
});
export type GetExperimentCandidateDiffPayload = z.infer<
  typeof getExperimentCandidateDiffPayloadSchema
>;

export interface GetExperimentCandidateDiffResult {
  diff: string;
  headCommit: string;
  omittedFiles?: number;
}

export type GetExperimentCandidateStatsPayload = GetExperimentCandidateDiffPayload;

export interface GetExperimentCandidateStatsResult {
  insertions: number;
  deletions: number;
  files: number;
}

export const experimentWorktreeBatchItemResultSchema = z.object({
  threadId: z.string().min(1),
  branch: z.string().min(1),
  path: z.string().min(1).optional(),
  error: z.string().optional(),
});
export const createExperimentWorktreesResultSchema = z.object({
  candidates: z.array(experimentWorktreeBatchItemResultSchema),
});
export const removeExperimentWorktreesResultSchema = createExperimentWorktreesResultSchema;
export const experimentSnapshotCandidateResultSchema = z.object({
  threadId: z.string().min(1),
  headCommit: z.string().min(1),
  files: z.number().int().nonnegative(),
  insertions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  omittedFiles: z.number().int().nonnegative().optional(),
});
export const captureExperimentSnapshotResultSchema = z.object({
  hash: z.string().min(1),
  candidates: z.array(experimentSnapshotCandidateResultSchema),
});
export const judgeExperimentSnapshotResultSchema = z.object({
  hash: z.string().min(1),
  winnerThreadId: z.string().min(1),
  rationale: z.string(),
  assessments: z.array(experimentJudgeAssessmentSchema),
});
export const getExperimentCandidateStatsResultSchema = z.object({
  insertions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  files: z.number().int().nonnegative(),
});

// ── Experiment authority wire (capabilities.experiments v1) ────────────────
//
// The canonical `experimentSchema` above carries cross-field `superRefine`
// checks and a non-blank prompt refine. Native/portable generators reject
// `zod.custom-refine`, so the route body carries a structural twin built from
// the canonical `.shape`: same fields and leaf bounds, with only the refined
// leaves widened to plain structural strings. The host re-parses every record
// with the canonical schema before any write (`400 invalid_experiment`) and
// parses every stored record canonically on read (fail closed), so no
// refinement is dropped — it is deliberately host-side.

const canonicalExperimentShape = experimentSchema.shape;
const experimentCrownShape = ((
  canonicalExperimentShape.crown as unknown as { def?: { innerType?: z.ZodType } }
).def?.innerType ?? canonicalExperimentShape.crown) as unknown as {
  options: [{ shape: Record<string, z.ZodType> }, { shape: Record<string, z.ZodType> }];
};

export const experimentCrownWireSchema = z.discriminatedUnion("source", [
  z.object({ ...experimentCrownShape.options[0].shape, rationale: z.string().min(1) }),
  z.object({
    ...experimentCrownShape.options[1].shape,
    // The canonical user variant pins `rationale`/`modelLabel` to `never`
    // (absent-only). The portable structural twin widens them to `unknown`:
    // the "must be absent" rule is semantic and stays enforced by the
    // canonical host re-parse (400 invalid_experiment), while the native
    // emitter has no `not` keyword for the never-union.
    rationale: z.unknown().optional(),
    modelLabel: z.unknown().optional(),
  }),
]);

/**
 * Portable structural twin of {@link experimentSchema} for the remote wire and
 * the native binding inventory. Field-key parity with the canonical record is
 * asserted by the contract tests so a future record field cannot drift
 * unnoticed while the canonical refinements stay host-side.
 */
export const experimentWireSchema = z.object({
  ...canonicalExperimentShape,
  prompt: z.string().min(1).max(MAX_EXPERIMENT_PROMPT_LENGTH),
  crown: experimentCrownWireSchema.optional(),
});
export type ExperimentWire = z.infer<typeof experimentWireSchema>;

/**
 * One candidate thread to insert with an experiment `create`. The candidate id
 * set must equal the record's candidate ids, every spec must carry the
 * record's project, and the branch must match the record candidate's branch.
 * `group_id`/`group_name` are derived from the record (`id`/`title`), exactly
 * like the renderer's own candidate rows.
 */
export const experimentCandidateThreadCreationSchema = z.object({
  threadId: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1),
  agentKind: agentKindSchema,
  agentInstanceId: agentInstanceIdSchema.optional(),
  config: threadConfigSchema,
  presentationMode: threadPresentationModeSchema.optional(),
  worktreeBranch: z.string().min(1),
  parentThreadId: z.string().min(1).optional(),
});
export type ExperimentCandidateThreadCreation = z.infer<
  typeof experimentCandidateThreadCreationSchema
>;

/**
 * Narrow, allowlisted candidate-row update. Creation fields are never
 * rewritten; `retire`/`fail` additionally require confirmed retirement
 * host-side, and `fail` only applies to a candidate with no recorded session.
 */
export const experimentCandidateRowUpdateSchema = z.object({
  threadId: z.string().min(1),
  worktree: z
    .object({ path: z.string().min(1), branch: z.string().min(1) })
    .nullable()
    .optional(),
  groupName: z.string().min(1).nullable().optional(),
  retire: z.literal("done").optional(),
  fail: z.literal(true).optional(),
});
export type ExperimentCandidateRowUpdate = z.infer<typeof experimentCandidateRowUpdateSchema>;

/** The three experiment authority intents; `experimentId` is path-injected. */
export const remoteExperimentCommandSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("create"),
    experimentId: z.string().min(1),
    record: experimentWireSchema,
    threads: z.array(experimentCandidateThreadCreationSchema).min(2).max(MAX_EXPERIMENT_CANDIDATES),
  }),
  z.object({
    kind: z.literal("replace"),
    experimentId: z.string().min(1),
    revision: z.string().min(1),
    record: experimentWireSchema,
    rows: z.array(experimentCandidateRowUpdateSchema).max(MAX_EXPERIMENT_CANDIDATES).optional(),
  }),
  z.object({
    kind: z.literal("remove"),
    experimentId: z.string().min(1),
    revision: z.string().min(1),
    candidateDisposition: z.enum(["delete", "release"]),
  }),
]);
export type RemoteExperimentCommand = z.infer<typeof remoteExperimentCommandSchema>;
export type RemoteExperimentCommandKind = RemoteExperimentCommand["kind"];

/** `GET /api/experiments`: the store revision plus every canonical record. */
export const remoteExperimentStateSchema = z.object({
  revision: z.string().min(1),
  experiments: z.record(z.string(), experimentWireSchema),
});
export type RemoteExperimentState = z.infer<typeof remoteExperimentStateSchema>;

/** `POST /api/experiments/{experimentId}/command` success result. */
export const remoteExperimentCommandResultSchema = z.object({
  ok: z.literal(true),
  revision: z.string().min(1),
});
export type RemoteExperimentCommandResult = z.infer<typeof remoteExperimentCommandResultSchema>;

/**
 * Maximum stored experiment-store bytes served or accepted for mutation.
 * The served read refuses typed (`experiments_too_large`) before parsing; a
 * mutation whose committed value would exceed this is refused typed as well,
 * except a value that strictly shrinks an already over-budget store (the
 * removal/shrink recovery path). Never truncated, never republished without
 * untouched survivor values.
 */
export const MAX_EXPERIMENT_STATE_BYTES = 16 * 1024 * 1024;
