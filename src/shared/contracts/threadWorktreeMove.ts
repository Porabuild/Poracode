import { z } from "zod";
import { gitAddWorktreePayloadSchema } from "./git";

export const moveThreadToWorktreeInputSchema = z.strictObject({
  threadId: z.string().min(1),
  withChanges: gitAddWorktreePayloadSchema.shape.transferUncommitted,
  operationKey: z.string().min(8).max(128),
});
export type MoveThreadToWorktreeInput = z.infer<typeof moveThreadToWorktreeInputSchema>;

export interface MoveThreadToWorktreeResult {
  threadId: string;
  worktreePath: string;
  branch: string;
  changesTransferred?: boolean;
  outcome: "moved" | "checkout_created";
  runtime: "not_reopened" | "reopened" | "reopen_unconfirmed";
  note?: string;
}
