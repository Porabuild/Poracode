const REACT_COMPONENT_TRACK = "Components ⚛";
const REACT_COMPONENT_PREFIX = "\u200b";

let stopObserver: (() => void) | undefined;

function isReactComponentTiming(entry: PerformanceEntry): boolean {
  if (entry.entryType !== "measure" || !entry.name.startsWith(REACT_COMPONENT_PREFIX)) return false;
  const detail: unknown = (entry as PerformanceMeasure).detail;
  if (typeof detail !== "object" || detail === null) return false;
  const devtools = (detail as { devtools?: unknown }).devtools;
  return (
    typeof devtools === "object" &&
    devtools !== null &&
    (devtools as { track?: unknown }).track === REACT_COMPONENT_TRACK
  );
}

/**
 * React development builds serialize changed props into component measures.
 * A windowed text body can therefore leave complete old/new stream copies in
 * the native User Timing buffer after every commit. Release those entries after
 * observer delivery; other observers still receive their already queued entries.
 * Call only from development bootstrap. Production React does not emit them.
 */
export function installReactDevelopmentTimingRetention(): () => void {
  if (stopObserver) return stopObserver;
  if (
    typeof PerformanceObserver === "undefined" ||
    typeof performance.getEntriesByName !== "function" ||
    typeof performance.clearMeasures !== "function"
  )
    return () => {};

  let active = true;
  const observer = new PerformanceObserver((list) => {
    if (!active) return;
    const names = new Set<string>();
    for (const entry of list.getEntries()) {
      if (isReactComponentTiming(entry)) names.add(entry.name);
    }
    for (const name of names) {
      // clearMeasures is name-wide. Preserve a foreign measurement even if it
      // happens to share React's component name; never clear all measures.
      const entries = performance.getEntriesByName(name, "measure");
      if (entries.length > 0 && entries.every(isReactComponentTiming))
        performance.clearMeasures(name);
    }
  });
  try {
    observer.observe({ type: "measure", buffered: true });
  } catch {
    observer.disconnect();
    return () => {};
  }
  const stop = () => {
    if (!active) return;
    active = false;
    observer.disconnect();
    stopObserver = undefined;
  };
  stopObserver = stop;
  return stop;
}
