import { create } from "zustand";

/**
 * Window-local live-stream capacity state (A1). The managed wire carries a
 * bounded runtime item-interest array; when more threads are retained than the
 * bound can carry, the overflow is not silent: the intake reports it here and
 * the thread surface shows a truthful overload state instead of dropping
 * updates invisibly. One renderer process (one window) owns one store, so
 * windows never see each other's capacity state.
 */
interface LiveStreamCapacityState {
  /** Retained runtime threads the wire bound currently excludes; 0 = all live. */
  droppedRuntimeThreadCount: number;
  setDroppedRuntimeThreadCount: (count: number) => void;
}

export const useLiveStreamCapacityStore = create<LiveStreamCapacityState>((set) => ({
  droppedRuntimeThreadCount: 0,
  setDroppedRuntimeThreadCount: (count) =>
    set((state) =>
      state.droppedRuntimeThreadCount === count ? {} : { droppedRuntimeThreadCount: count },
    ),
}));

/** Test seam: return the window to "everything live". */
export function resetLiveStreamCapacityStore(): void {
  useLiveStreamCapacityStore.setState({ droppedRuntimeThreadCount: 0 });
}
