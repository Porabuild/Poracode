const INTERNAL_HISTORY_MARKER =
  /^\[lightcode\] \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z (?:session start|relaunch)(?:\r?\n)?/gm;

export function stripInternalHistoryMarkers(history: string): string {
  return history.replace(INTERNAL_HISTORY_MARKER, "");
}
