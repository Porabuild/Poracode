import { judgeExperimentPayloadSchema } from "../../contracts";
import type { JudgeExperimentPayload, JudgeExperimentResult } from "../../contracts";
import { definePayloadProcedure } from "../core";

export const experimentProcedures = {
  judgeExperiment: definePayloadProcedure<
    JudgeExperimentPayload,
    JudgeExperimentResult,
    "supervisor"
  >("judgeExperiment", "supervisor", judgeExperimentPayloadSchema),
} as const;
