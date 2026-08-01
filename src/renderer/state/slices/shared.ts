import type { StateCreator } from "zustand";
import type { DraftSlice } from "./draftSlice";
import type { LaunchSlice } from "./launchSlice";
import type { PaneCacheSlice } from "./paneCacheSlice";
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
  PaneCacheSlice &
  RuntimeEventSlice &
  PendingSteerSlice &
  SubAgentOverlaySlice;

export type SliceCreator<T> = StateCreator<AppStoreState, [], [], T>;
