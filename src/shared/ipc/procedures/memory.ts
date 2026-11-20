import {
  generateMemoryTextPayloadSchema,
  type GenerateMemoryTextPayload,
  type GenerateMemoryTextResult,
} from "../../memory";
import { definePayloadProcedure } from "../core";

export const memoryProcedures = {
  generateMemoryText: definePayloadProcedure<
    GenerateMemoryTextPayload,
    GenerateMemoryTextResult,
    "supervisor"
  >("generateMemoryText", "supervisor", generateMemoryTextPayloadSchema),
} as const;
