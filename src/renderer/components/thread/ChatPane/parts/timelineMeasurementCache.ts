import { CHAT_FONT_SIZE_VAR } from "../chatFontVars";

export {
  clearTimelineMeasurementCache,
  forgetTimelineMeasurements,
  MAX_TIMELINE_SNAPSHOT_ROWS,
  readTimelineMeasurements,
  type TimelineMeasurement,
  writeTimelineMeasurements,
} from "@/renderer/state/timelineMeasurementCache";

const MAX_TIMELINE_WIDTH_PX = 920;

export function getTimelineMeasurementSignature(
  scrollElement: HTMLDivElement | null,
): string | null {
  if (!scrollElement || scrollElement.clientWidth <= 0) return null;
  const width = Math.min(scrollElement.clientWidth, MAX_TIMELINE_WIDTH_PX);
  const fontSize = getComputedStyle(scrollElement).getPropertyValue(CHAT_FONT_SIZE_VAR).trim();
  return `${width}:${fontSize}`;
}
