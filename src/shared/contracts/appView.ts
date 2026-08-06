import type { PaneLayout } from "../paneLayout";

export type AppView =
  | { kind: "home" }
  | { kind: "pullRequests" }
  | { kind: "schedules" }
  | { kind: "draft"; projectId: string }
  | { kind: "experiment"; experimentId: string; projectId: string }
  | {
      kind: "thread";
      panes: [string, ...string[]];
      rowLayout?: number[];
      paneLayout?: PaneLayout;
      activeGroupId?: string;
    };
