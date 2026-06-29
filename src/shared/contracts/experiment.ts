import { z } from "zod";
import { agentKindSchema, projectLocationSchema } from "./common";

/**
 * An "experiment" fans one prompt out across several agent/model candidates,
 * each in its own git worktree, so the user can compare the resulting diffs
 * side-by-side and merge the winner. Each candidate is a normal {@link Thread}
 * linked to the experiment via `thread.groupId === experiment.id`; this record
 * holds the extra orchestration metadata that a plain thread group lacks.
 */
export const experimentCandidateSchema = z.object({
  threadId: z.string().min(1),
  agentKind: agentKindSchema,
  /** Human-readable provider label captured at launch (e.g. "Claude", "Codex"). */
  agentLabel: z.string().optional(),
  /** Model id used for this candidate, when known. */
  model: z.string().optional(),
  worktreePath: z.string().min(1),
  worktreeBranch: z.string().min(1),
});
export type ExperimentCandidate = z.infer<typeof experimentCandidateSchema>;

/** Who picked the winner and why. */
export const experimentCrownSchema = z.object({
  threadId: z.string().min(1),
  /** One-line justification — from the LLM judge or the user. */
  rationale: z.string(),
  /** "ai" = LLM-judge pre-selection (overridable); "user" = manual choice. */
  source: z.enum(["ai", "user"]),
  /** Display label for the judging model, when `source === "ai"`. */
  modelLabel: z.string().optional(),
  createdAt: z.string().min(1),
});
export type ExperimentCrown = z.infer<typeof experimentCrownSchema>;

export const experimentStatusSchema = z.enum(["running", "decided"]);
export type ExperimentStatus = z.infer<typeof experimentStatusSchema>;

export const experimentSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1),
  /** The shared prompt sent to every candidate. */
  prompt: z.string(),
  /** Branch every candidate worktree was forked from (the merge target). */
  baseBranch: z.string().optional(),
  candidates: z.array(experimentCandidateSchema),
  /** Candidate whose worktree was merged in as the winner, once decided. */
  winnerThreadId: z.string().optional(),
  /** Latest crown (AI pre-selection or user pick); not necessarily merged yet. */
  crown: experimentCrownSchema.optional(),
  status: experimentStatusSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type Experiment = z.infer<typeof experimentSchema>;

/** One candidate's diff handed to the judge for ranking. */
export const judgeExperimentCandidateSchema = z.object({
  threadId: z.string().min(1),
  label: z.string().min(1),
  /** Unified diff (possibly truncated) of the candidate's worktree changes. */
  diff: z.string(),
});
export type JudgeExperimentCandidate = z.infer<typeof judgeExperimentCandidateSchema>;

export const judgeExperimentPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  /** Provider to run the judge call through (reuses its auth/config). */
  agentKind: agentKindSchema,
  model: z.string().min(1).optional(),
  effort: z.string().min(1).optional(),
  /** The original task prompt, so the judge knows what "best" means. */
  prompt: z.string(),
  candidates: z.array(judgeExperimentCandidateSchema).min(2),
});
export type JudgeExperimentPayload = z.infer<typeof judgeExperimentPayloadSchema>;

export interface JudgeExperimentResult {
  /** Thread id of the candidate the judge ranked best. */
  winnerThreadId: string;
  /** One-line rationale for the pick. */
  rationale: string;
}
