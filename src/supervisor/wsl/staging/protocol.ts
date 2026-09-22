/**
 * Wire contract between the supervisor and the WSL staging worker process.
 *
 * The worker only performs filesystem verbs against paths the client hands
 * it (UNC Windows paths are the production case). Keeping the protocol
 * path-agnostic makes it unit-testable against ordinary temp directories.
 *
 * `WSL_STAGING_PROTOCOL_VERSION` gates the worker handshake: a worker built
 * from a different source must fail the handshake instead of running.
 */

/**
 * Version 2 adds `read-file` / `write-file`, the atomic content verbs provider
 * installers use for settings/hook documents that must not be written over a
 * synchronous UNC handle. Version 3 adds `read-dir` so provider verification
 * can enumerate a staging directory through the worker instead of
 * `readdirSync` over UNC. The worker and host ship in the same supervisor
 * bundle; the handshake is the compatibility gate, so a worker built from a
 * different source fails closed instead of half-serving the new verbs.
 * The same version also adds optional `mode` bits to `mkdirp`/`write-file` so a
 * staged launch document keeps its private permissions.
 */
export const WSL_STAGING_PROTOCOL_VERSION = 3;

export type WslStagingFreshness = "content" | "size-mtime";

export interface WslStagingFileRequest {
  /** Absolute Windows source path on the host. */
  src: string;
  /** POSIX-style destination path relative to the request base. */
  relDest: string;
}

export interface WslStagingDeployRequest {
  op: "deploy";
  /** Target directory; `relDest` entries are created underneath it. */
  base: string;
  files: readonly WslStagingFileRequest[];
  freshness: WslStagingFreshness;
}

export interface WslStagingExistsRequest {
  op: "exists";
  path: string;
}

export interface WslStagingRemoveRequest {
  op: "remove";
  path: string;
  recursive: boolean;
}

export interface WslStagingMkdirRequest {
  op: "mkdirp";
  path: string;
  /** POSIX permission bits for the created directories (e.g. 0o700). */
  mode?: number;
}

export interface WslStagingStageFileRequest {
  op: "stage-file";
  src: string;
  dest: string;
}

export interface WslStagingReadFileRequest {
  op: "read-file";
  path: string;
}

export interface WslStagingWriteFileRequest {
  op: "write-file";
  path: string;
  /** UTF-8 text carried as base64 so the JSON protocol stays byte-exact. */
  contentBase64: string;
  /** POSIX permission bits for the written file (e.g. 0o600). */
  mode?: number;
}

export interface WslStagingReadDirRequest {
  op: "read-dir";
  path: string;
}

export interface WslStagingPruneRequest {
  op: "prune-dirs";
  dir: string;
  keepPrefix: string;
  keepName: string;
}

export type WslStagingRequest =
  | WslStagingDeployRequest
  | WslStagingExistsRequest
  | WslStagingRemoveRequest
  | WslStagingMkdirRequest
  | WslStagingStageFileRequest
  | WslStagingPruneRequest
  | WslStagingReadFileRequest
  | WslStagingWriteFileRequest
  | WslStagingReadDirRequest;

export interface WslStagingDeployResult {
  filesWritten: number;
}

export interface WslStagingReadFileResult {
  exists: boolean;
  /** Present when `exists` is true; base64-encoded raw bytes. */
  contentBase64?: string;
}

export interface WslStagingReadDirEntry {
  name: string;
  /** True for directories; symlinks report the target's kind (`stat`-like). */
  directory: boolean;
}

export interface WslStagingReadDirResult {
  exists: boolean;
  entries: WslStagingReadDirEntry[];
}

export interface WslStagingRequestEnvelope {
  protocolVersion: number;
  id: string;
  request: WslStagingRequest;
}

export interface WslStagingReadyMessage {
  type: "ready";
  protocolVersion: number;
}

export interface WslStagingErrorMessage {
  message: string;
  code?: string;
}

export interface WslStagingResultMessage {
  type: "result";
  id: string;
  ok: boolean;
  result?: unknown;
  error?: WslStagingErrorMessage;
}

export type WslStagingWorkerMessage = WslStagingReadyMessage | WslStagingResultMessage;

export const WSL_STAGING_WORKER_PROTOCOL_VERSION = WSL_STAGING_PROTOCOL_VERSION;
