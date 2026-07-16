import { z } from "zod";
import { agentKindSchema, projectLocationSchema } from "./common";
import { fullCommitOidSchema } from "./git";
import { promptSegmentSchema } from "./thread";

export const EXPERIMENT_STORE_KEY = "poracode-experiments-v1";
export const EXPERIMENT_STORE_VERSION = 1;
export const MAX_EXPERIMENT_CANDIDATES = 8;
export const MAX_EXPERIMENT_DIFF_LENGTH = 2_000_000;
export const MAX_EXPERIMENT_PROMPT_LENGTH = 100_000;
export const MAX_EXPERIMENT_UNTRACKED_FILES = 200;

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
}

export interface CaptureExperimentSnapshotResult {
  hash: string;
  candidates: ExperimentSnapshotCandidateResult[];
}

export const judgeExperimentSnapshotPayloadSchema = captureExperimentSnapshotPayloadSchema.and(
  z.object({
    agentKind: agentKindSchema,
    model: z.string().min(1).optional(),
    effort: z.string().min(1).optional(),
    fast: z.boolean().optional(),
    prompt: nonBlankPromptSchema,
  }),
);
export type JudgeExperimentSnapshotPayload = z.infer<typeof judgeExperimentSnapshotPayloadSchema>;

export interface JudgeExperimentSnapshotResult extends CaptureExperimentSnapshotResult {
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
}

export type GetExperimentCandidateStatsPayload = GetExperimentCandidateDiffPayload;

export interface GetExperimentCandidateStatsResult {
  insertions: number;
  deletions: number;
  files: number;
}
