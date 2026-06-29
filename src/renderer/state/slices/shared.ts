import type { StateCreator } from "zustand";
import type { DraftSlice } from "./draftSlice";
import type { ExperimentSlice } from "./experimentSlice";
import type { LaunchSlice } from "./launchSlice";
import type { PendingSteerSlice } from "./pendingSteerSlice";
import type { ProjectSlice } from "./projectSlice";
import type { RuntimeEventSlice } from "./runtimeEventSlice";
import type { SubAgentOverlaySlice } from "./subAgentOverlaySlice";
import type { ThreadSlice } from "./threadSlice";
import type { ViewSlice } from "./viewSlice";

export type AppStoreState = ProjectSlice &
  ThreadSlice &
  LaunchSlice &
  DraftSlice &
  ViewSlice &
  RuntimeEventSlice &
  PendingSteerSlice &
  SubAgentOverlaySlice &
  ExperimentSlice;

export type SliceCreator<T> = StateCreator<AppStoreState, [], [], T>;
