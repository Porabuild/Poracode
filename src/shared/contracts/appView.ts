import type { PaneLayout } from "../paneLayout";

export type AppView =
  | { kind: "home" }
  | { kind: "draft"; projectId: string }
  | { kind: "experiment"; experimentId: string }
  | {
      kind: "thread";
      panes: [string, ...string[]];
      rowLayout?: number[];
      paneLayout?: PaneLayout;
      activeGroupId?: string;
    };
