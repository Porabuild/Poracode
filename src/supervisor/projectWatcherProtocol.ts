import type { GIT_HELPER_PROTOCOL_VERSION } from "./git/gitNativeHelperProtocol";

export type ProjectWatchScope = "git" | "worktree";

// v3 is shared by the native --watch-v3 mode and the bundled TS worker.
export type ProjectWatchCommand = {
  protocolVersion: typeof GIT_HELPER_PROTOCOL_VERSION;
  id: number;
} & ({ kind: "watch"; rootPath: string } | { kind: "unwatch" });

export type ProjectWatchEvent = {
  id: number;
} & (
  | { kind: "ready" | "unwatched" }
  | { kind: "changed"; scope: ProjectWatchScope }
  | { kind: "error"; error: string }
);

export type ProjectWatchMessage = ProjectWatchEvent & {
  protocolVersion: typeof GIT_HELPER_PROTOCOL_VERSION;
};
