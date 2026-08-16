import { useLayoutEffect, useRef, useSyncExternalStore } from "react";

let nextSheetLayerId = 0;
let sheetLayers: number[] = [];
const sheetLayerListeners = new Set<() => void>();
type MobileSheetLayerState = "base" | "base-covered" | "nested-covered" | "nested-top";

function emitSheetLayerChange(): void {
  for (const listener of sheetLayerListeners) listener();
}

function subscribeToSheetLayers(listener: () => void): () => void {
  sheetLayerListeners.add(listener);
  return () => sheetLayerListeners.delete(listener);
}

function readSheetLayerState(layerId: number): MobileSheetLayerState {
  const index = sheetLayers.indexOf(layerId);
  if (index < 0) return "base";
  const covered = index < sheetLayers.length - 1;
  if (index === 0) return covered ? "base-covered" : "base";
  return covered ? "nested-covered" : "nested-top";
}

/**
 * Registers a rendered mobile sheet in a shared visual stack.
 *
 * Portals preserve React context but not a dependable DOM hierarchy, so sheet
 * depth is tracked explicitly. A covered sheet remains mounted to preserve its
 * navigation state while the layer above it is open.
 */
export function useMobileSheetLayer(active = true): {
  readonly covered: boolean;
  readonly nested: boolean;
} {
  const layerIdRef = useRef(0);
  if (layerIdRef.current === 0) layerIdRef.current = ++nextSheetLayerId;
  const layerId = layerIdRef.current;

  const layerState = useSyncExternalStore(
    subscribeToSheetLayers,
    () => readSheetLayerState(layerId),
    () => "base",
  );

  useLayoutEffect(() => {
    if (!active) return;
    sheetLayers = [...sheetLayers.filter((candidate) => candidate !== layerId), layerId];
    emitSheetLayerChange();
    return () => {
      const next = sheetLayers.filter((candidate) => candidate !== layerId);
      if (next.length === sheetLayers.length) return;
      sheetLayers = next;
      emitSheetLayerChange();
    };
  }, [active, layerId]);

  return {
    covered: active && (layerState === "base-covered" || layerState === "nested-covered"),
    nested: active && (layerState === "nested-covered" || layerState === "nested-top"),
  };
}
