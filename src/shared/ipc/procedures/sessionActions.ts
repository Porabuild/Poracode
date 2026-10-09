import {
  listThreadSessionActionsPayloadSchema,
  listThreadSessionActionsResultSchema,
  invokeThreadSessionActionPortableSchema,
  invokeThreadSessionActionPortableResultSchema,
} from "../../contracts/sessionActions";
import { definePayloadProcedure } from "../core";

export const sessionActionProcedures = {
  listThreadSessionActions: definePayloadProcedure(
    "listThreadSessionActions",
    "supervisor",
    listThreadSessionActionsPayloadSchema,
    listThreadSessionActionsResultSchema,
  ),
  invokeThreadSessionAction: definePayloadProcedure(
    "invokeThreadSessionAction",
    "supervisor",
    invokeThreadSessionActionPortableSchema,
    invokeThreadSessionActionPortableResultSchema,
  ),
} as const;
