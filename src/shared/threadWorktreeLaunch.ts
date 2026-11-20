import { z } from "zod";
import type { GitBranchInfo } from "./contracts";
import { resolveWorktreeOriginRef, qualifiedRemoteName } from "./worktreeBaseRef";

/** The checkout fields sent by the New Thread composer. */
export const threadWorktreeDraftFieldsSchema = z.strictObject({
  existingWorktreePath: z.string().min(1).optional(),
  worktreeBranch: z.string().min(1).optional(),
  worktreeBaseBranch: z.string().min(1).optional(),
  worktreeIsNewBranch: z.boolean().optional(),
  worktreeTransferUncommitted: z.boolean().optional(),
});
export type ThreadWorktreeDraftFields = z.infer<typeof threadWorktreeDraftFieldsSchema>;

export interface ThreadWorktreeCreation {
  branch?: string;
  startPoint?: string;
  createBranch?: boolean;
  transferUncommitted?: boolean;
}

/** New-thread launches copy uncommitted changes and leave the source checkout intact. */
export function threadWorktreeCreationOptions(input: ThreadWorktreeCreation) {
  const transferUncommitted = input.transferUncommitted ?? false;
  return {
    ...(input.branch ? { branch: input.branch } : {}),
    ...(input.startPoint ? { startPoint: input.startPoint } : {}),
    createBranch: input.createBranch ?? true,
    transferUncommitted,
    keepChangesInSource: transferUncommitted,
  };
}

export function resolveImplicitThreadWorktreeBase(
  pinned: string | undefined,
  branches: readonly GitBranchInfo[],
  defaultBranch: string | null | undefined,
  tracking: string | undefined,
): string | undefined {
  const pinAvailable =
    pinned &&
    (branches.length === 0 ||
      branches.some((branch) => branch.name === pinned || qualifiedRemoteName(branch) === pinned));
  return (
    (pinAvailable ? resolveWorktreeOriginRef(pinned, branches, tracking) : undefined) ??
    defaultBranch ??
    tracking
  );
}
