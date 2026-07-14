import {
  getExperimentCandidateDiffPayloadSchema,
  judgeExperimentPayloadSchema,
} from "../../contracts";
import type {
  GetExperimentCandidateDiffPayload,
  GetExperimentCandidateDiffResult,
  GetExperimentCandidateStatsPayload,
  GetExperimentCandidateStatsResult,
  JudgeExperimentPayload,
  JudgeExperimentResult,
} from "../../contracts";
import { definePayloadProcedure } from "../core";

export const experimentProcedures = {
  getExperimentCandidateDiff: definePayloadProcedure<
    GetExperimentCandidateDiffPayload,
    GetExperimentCandidateDiffResult,
    "supervisor"
  >("getExperimentCandidateDiff", "supervisor", getExperimentCandidateDiffPayloadSchema),
  getExperimentCandidateStats: definePayloadProcedure<
    GetExperimentCandidateStatsPayload,
    GetExperimentCandidateStatsResult,
    "supervisor"
  >("getExperimentCandidateStats", "supervisor", getExperimentCandidateDiffPayloadSchema),
  judgeExperiment: definePayloadProcedure<
    JudgeExperimentPayload,
    JudgeExperimentResult,
    "supervisor"
  >("judgeExperiment", "supervisor", judgeExperimentPayloadSchema),
} as const;
