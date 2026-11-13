import type { GIT_HELPER_PROTOCOL_VERSION } from "./git/gitNativeHelperProtocol";

export type ProjectWatchScope = "git" | "worktree";

// Shares the Git helper envelope version; --watch-v3 and the TS worker move together.
export type ProjectWatchCommand = {
  protocolVersion: typeof GIT_HELPER_PROTOCOL_VERSION;
  id: number;
} & ({ kind: "watch"; rootPath: string } | { kind: "unwatch" });

export type ProjectWatchEvent = {
  id: number;
} & (
  | { kind: "ready" | "unwatched" }
  // Optional hint: compatible helpers/fallbacks without it conservatively refresh Git; old
  // clients ignore the hint and continue refreshing both Git and file views.
  | { kind: "changed"; scope: ProjectWatchScope; gitChanged?: boolean }
  | { kind: "error"; error: string }
);

export type ProjectWatchMessage = ProjectWatchEvent & {
  protocolVersion: typeof GIT_HELPER_PROTOCOL_VERSION;
};
