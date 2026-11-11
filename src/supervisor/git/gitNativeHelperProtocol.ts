import type { GitFileChange, GitStatusDetail } from "@/shared/contracts";

/**
 * Must match `GIT_HELPER_PROTOCOL_VERSION` in `native/git-helper/src/protocol.rs`;
 * `scripts/prepare-git-helper.mjs` verifies `--hello` against this constant.
 */
export const GIT_HELPER_PROTOCOL_VERSION = 1;

export const GIT_HELPER_BINARY_NAME = "poracode-git-helper";

export interface NativeGitStatusEntry {
  detail?: "summary";
  isRepo: boolean;
  branch: string;
  headSha?: string;
  tracking: string;
  hasRemote: boolean;
  remoteOutput?: string;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  totalInsertions: number;
  totalDeletions: number;
  mergeInProgress?: boolean;
  conflictFiles?: GitFileChange[];
  mergeMessage?: string;
}

export interface GitHelperStatusBatchRequest {
  protocolVersion: typeof GIT_HELPER_PROTOCOL_VERSION;
  id: number;
  kind: "statusBatch";
  paths: string[];
  detail: GitStatusDetail;
  timeoutMs: number;
  maxConcurrency: number;
}

export interface GitHelperPingRequest {
  protocolVersion: typeof GIT_HELPER_PROTOCOL_VERSION;
  id: number;
  kind: "ping";
}

export type GitHelperRequest = GitHelperStatusBatchRequest | GitHelperPingRequest;

export interface GitHelperResponse {
  protocolVersion: number;
  id: number;
  ok: boolean;
  statuses?: Record<string, NativeGitStatusEntry>;
  error?: string;
}
