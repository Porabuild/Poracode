import {
  cancelJudgeExperimentPayloadSchema,
  captureExperimentSnapshotPayloadSchema,
  captureExperimentSnapshotResultSchema,
  createExperimentWorktreesPayloadSchema,
  createExperimentWorktreesResultSchema,
  getExperimentCandidateDiffPayloadSchema,
  getExperimentCandidateStatsResultSchema,
  judgeExperimentSnapshotPayloadSchema,
  judgeExperimentSnapshotResultSchema,
  removeExperimentWorktreesPayloadSchema,
  removeExperimentWorktreesResultSchema,
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
import { definePayloadProcedure, omittedResultSchema } from "../core";

export const experimentProcedures = {
  createExperimentWorktrees: definePayloadProcedure<
    CreateExperimentWorktreesPayload,
    CreateExperimentWorktreesResult,
    "supervisor"
  >(
    "createExperimentWorktrees",
    "supervisor",
    createExperimentWorktreesPayloadSchema,
    createExperimentWorktreesResultSchema,
  ),
  removeExperimentWorktrees: definePayloadProcedure<
    RemoveExperimentWorktreesPayload,
    RemoveExperimentWorktreesResult,
    "supervisor"
  >(
    "removeExperimentWorktrees",
    "supervisor",
    removeExperimentWorktreesPayloadSchema,
    removeExperimentWorktreesResultSchema,
  ),
  captureExperimentSnapshot: definePayloadProcedure<
    CaptureExperimentSnapshotPayload,
    CaptureExperimentSnapshotResult,
    "supervisor"
  >(
    "captureExperimentSnapshot",
    "supervisor",
    captureExperimentSnapshotPayloadSchema,
    captureExperimentSnapshotResultSchema,
  ),
  judgeExperimentSnapshot: definePayloadProcedure<
    JudgeExperimentSnapshotPayload,
    JudgeExperimentSnapshotResult,
    "supervisor"
  >(
    "judgeExperimentSnapshot",
    "supervisor",
    judgeExperimentSnapshotPayloadSchema,
    judgeExperimentSnapshotResultSchema,
  ),
  getExperimentCandidateStats: definePayloadProcedure<
    GetExperimentCandidateStatsPayload,
    GetExperimentCandidateStatsResult,
    "supervisor"
  >(
    "getExperimentCandidateStats",
    "supervisor",
    getExperimentCandidateDiffPayloadSchema,
    getExperimentCandidateStatsResultSchema,
  ),
  cancelJudgeExperiment: definePayloadProcedure<CancelJudgeExperimentPayload, void, "supervisor">(
    "cancelJudgeExperiment",
    "supervisor",
    cancelJudgeExperimentPayloadSchema,
    omittedResultSchema,
  ),
} as const;
