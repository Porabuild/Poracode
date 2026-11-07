import { create } from "zustand";

/**
 * Window-local live-stream capacity state (A1). Each host connection carries a
 * bounded runtime item-interest array; when more threads are retained than its
 * bound can carry, the overflow is not silent: the connection reports it here
 * and the thread surface shows a truthful overload state instead of dropping
 * updates invisibly. One renderer process (one window) owns one store, so
 * windows never see each other's capacity state.
 */
interface LiveStreamCapacityState {
  /** Retained runtime threads the wire bounds currently exclude, over every connection. */
  droppedRuntimeThreadCount: number;
  /** Per connection wire. */
  droppedRuntimeThreadsByWire: Readonly<Record<string, number>>;
  setDroppedRuntimeThreadCount: (count: number, wire: string) => void;
}

export const useLiveStreamCapacityStore = create<LiveStreamCapacityState>((set) => ({
  droppedRuntimeThreadCount: 0,
  droppedRuntimeThreadsByWire: {},
  setDroppedRuntimeThreadCount: (count, wire) =>
    set((state) => {
      if ((state.droppedRuntimeThreadsByWire[wire] ?? 0) === count) return {};
      const { [wire]: _previous, ...others } = state.droppedRuntimeThreadsByWire;
      const droppedRuntimeThreadsByWire = count > 0 ? { ...others, [wire]: count } : others;
      return {
        droppedRuntimeThreadsByWire,
        droppedRuntimeThreadCount: Object.values(droppedRuntimeThreadsByWire).reduce(
          (total, dropped) => total + dropped,
          0,
        ),
      };
    }),
}));

/** Test seam: return the window to "everything live". */
export function resetLiveStreamCapacityStore(): void {
  useLiveStreamCapacityStore.setState({
    droppedRuntimeThreadCount: 0,
    droppedRuntimeThreadsByWire: {},
  });
}
