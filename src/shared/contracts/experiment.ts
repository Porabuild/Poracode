import { z } from "zod";
import { agentKindSchema, projectLocationSchema } from "./common";
import { fullCommitOidSchema } from "./git";

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

export const experimentCrownSchema = z.discriminatedUnion("source", [
  z.object({
    ...experimentCrownCommon,
    source: z.literal("ai"),
    rationale: z
      .string()
      .min(1)
      .refine((value) => value.trim().length > 0, "Rationale must not be blank"),
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

export const judgeExperimentCandidateSchema = z.object({
  threadId: z.string().min(1),
  diff: z.string().max(MAX_EXPERIMENT_DIFF_LENGTH),
});
export type JudgeExperimentCandidate = z.infer<typeof judgeExperimentCandidateSchema>;

export const judgeExperimentPayloadSchema = z
  .object({
    projectLocation: projectLocationSchema,
    agentKind: agentKindSchema,
    model: z.string().min(1).optional(),
    effort: z.string().min(1).optional(),
    fast: z.boolean().optional(),
    prompt: nonBlankPromptSchema,
    candidates: z.array(judgeExperimentCandidateSchema).min(2).max(MAX_EXPERIMENT_CANDIDATES),
  })
  .superRefine((payload, ctx) => {
    const candidateIds = new Set<string>();
    payload.candidates.forEach((candidate, index) => {
      if (candidateIds.has(candidate.threadId)) {
        ctx.addIssue({
          code: "custom",
          message: "Candidate thread ids must be unique",
          path: ["candidates", index, "threadId"],
        });
      }
      candidateIds.add(candidate.threadId);
    });
  });
export type JudgeExperimentPayload = z.infer<typeof judgeExperimentPayloadSchema>;

export interface JudgeExperimentResult {
  winnerThreadId: string;
  rationale: string;
}

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
