import type {
  IpcProcedurePayload,
  IpcProcedureResult,
  SupervisorProcedureName,
} from "@/shared/ipc";
import {
  GitStateService,
  type GitStateExecutor,
  type GitStateServiceOptions,
} from "./GitStateService";

export interface GitStateSupervisorCaller {
  <Name extends SupervisorProcedureName>(
    name: Name,
    payload: IpcProcedurePayload<Name>,
  ): Promise<IpcProcedureResult<Name>>;
}

export function createGitStateExecutor(call: GitStateSupervisorCaller): GitStateExecutor {
  return {
    gitFetch: (payload) => call("gitFetch", payload),
    gitProjectSnapshot: (payload) => call("gitProjectSnapshot", payload),
    getGitStatus: (payload) => call("getGitStatus", payload),
    gitWorktreeStatusBatch: (payload) => call("gitWorktreeStatusBatch", payload),
    gitGetWorktreeSourceBranch: (payload) => call("gitGetWorktreeSourceBranch", payload),
    ghGetPrForBranch: (payload) => call("ghGetPrForBranch", payload),
    ghGetPrDetails: (payload) => call("ghGetPrDetails", payload),
    ghGetPrFiles: (payload) => call("ghGetPrFiles", payload),
    ghGetPrDiff: (payload) => call("ghGetPrDiff", payload),
    ghGetPrReviewComments: (payload) => call("ghGetPrReviewComments", payload),
    ghListPullRequests: (payload) => call("ghListPullRequests", payload),
  };
}

export { GitStateService, type GitStateExecutor, type GitStateServiceOptions };
