import {
  cancelJudgeExperimentPayloadSchema,
  captureExperimentSnapshotPayloadSchema,
  createExperimentWorktreesPayloadSchema,
  getExperimentCandidateDiffPayloadSchema,
  judgeExperimentSnapshotPayloadSchema,
  removeExperimentWorktreesPayloadSchema,
} from "../../contracts";
import type {
  CancelJudgeExperimentPayload,
  CaptureExperimentSnapshotPayload,
  CaptureExperimentSnapshotResult,
  CreateExperimentWorktreesPayload,
  CreateExperimentWorktreesResult,
  GetExperimentCandidateStatsPayload,
  GetExperimentCandidateStatsResult,
  JudgeExperimentSnapshotPayload,
  JudgeExperimentSnapshotResult,
  RemoveExperimentWorktreesPayload,
  RemoveExperimentWorktreesResult,
} from "../../contracts";
import { definePayloadProcedure } from "../core";

export const experimentProcedures = {
  createExperimentWorktrees: definePayloadProcedure<
    CreateExperimentWorktreesPayload,
    CreateExperimentWorktreesResult,
    "supervisor"
  >("createExperimentWorktrees", "supervisor", createExperimentWorktreesPayloadSchema),
  removeExperimentWorktrees: definePayloadProcedure<
    RemoveExperimentWorktreesPayload,
    RemoveExperimentWorktreesResult,
    "supervisor"
  >("removeExperimentWorktrees", "supervisor", removeExperimentWorktreesPayloadSchema),
  captureExperimentSnapshot: definePayloadProcedure<
    CaptureExperimentSnapshotPayload,
    CaptureExperimentSnapshotResult,
    "supervisor"
  >("captureExperimentSnapshot", "supervisor", captureExperimentSnapshotPayloadSchema),
  judgeExperimentSnapshot: definePayloadProcedure<
    JudgeExperimentSnapshotPayload,
    JudgeExperimentSnapshotResult,
    "supervisor"
  >("judgeExperimentSnapshot", "supervisor", judgeExperimentSnapshotPayloadSchema),
  getExperimentCandidateStats: definePayloadProcedure<
    GetExperimentCandidateStatsPayload,
    GetExperimentCandidateStatsResult,
    "supervisor"
  >("getExperimentCandidateStats", "supervisor", getExperimentCandidateDiffPayloadSchema),
  cancelJudgeExperiment: definePayloadProcedure<CancelJudgeExperimentPayload, void, "supervisor">(
    "cancelJudgeExperiment",
    "supervisor",
    cancelJudgeExperimentPayloadSchema,
  ),
} as const;
