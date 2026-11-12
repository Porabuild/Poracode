import type {
  FileEntry,
  GitFileChange,
  GitStatusDetail,
  ProjectTreeEntry,
} from "@/shared/contracts";

/**
 * Must match `GIT_HELPER_PROTOCOL_VERSION` in `native/git-helper/src/protocol.rs`;
 * `scripts/prepare-git-helper.mjs` verifies `--hello` against this constant.
 */
// v3 adds the isolated watcher mode; old helpers must fall back rather than
// accept watch subscriptions without delivering scoped notifications.
export const GIT_HELPER_PROTOCOL_VERSION = 3;

export const GIT_HELPER_BINARY_NAME = "poracode-git-helper";

export interface NativeGitStatusEntry {
  detail?: "summary";
  isRepo: boolean;
  branch: string;
  headSha?: string;
  tracking: string;
  hasRemote: boolean;
  remoteOutput?: string;
  hasSshOverrides?: boolean;
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

export interface GitHelperSearchTreeRequest {
  protocolVersion: typeof GIT_HELPER_PROTOCOL_VERSION;
  id: number;
  kind: "searchTree";
  rootPath: string;
  query: string;
  limit: number;
  entryType?: "file" | "directory";
  useIgnoreFiles: boolean;
  excludePatterns: string[];
  timeoutMs: number;
}

export interface GitHelperSearchFilesRequest {
  protocolVersion: typeof GIT_HELPER_PROTOCOL_VERSION;
  id: number;
  kind: "searchFiles";
  rootPath: string;
  query: string;
  limit: number;
  useIgnoreFiles: boolean;
  excludePatterns: string[];
  timeoutMs: number;
}

export interface GitHelperInvalidateSearchRequest {
  protocolVersion: typeof GIT_HELPER_PROTOCOL_VERSION;
  id: number;
  kind: "invalidateSearch";
  rootPath?: string;
}

export interface GitHelperPingRequest {
  protocolVersion: typeof GIT_HELPER_PROTOCOL_VERSION;
  id: number;
  kind: "ping";
}

export type GitHelperRequest =
  | GitHelperStatusBatchRequest
  | GitHelperSearchTreeRequest
  | GitHelperSearchFilesRequest
  | GitHelperInvalidateSearchRequest
  | GitHelperPingRequest;

export interface GitHelperResponse {
  protocolVersion: number;
  id: number;
  ok: boolean;
  statuses?: Record<string, NativeGitStatusEntry>;
  treeEntries?: ProjectTreeEntry[];
  fileEntries?: FileEntry[];
  totalIndexed?: number;
  error?: string;
}
