import type { Rectangle } from "electron";

/** The picker reports layout CSS pixels; capturePage consumes painted view DIPs. */
export function browserCaptureClip(
  rect: Rectangle,
  viewport: { scale: number; offsetLeft: number; offsetTop: number },
  zoomFactor: number,
  emulationScale: number,
): Rectangle {
  const scale = zoomFactor * emulationScale * viewport.scale;
  const left = (rect.x - viewport.offsetLeft) * scale;
  const top = (rect.y - viewport.offsetTop) * scale;
  const x = Math.max(0, Math.floor(left));
  const y = Math.max(0, Math.floor(top));
  return {
    x,
    y,
    width: Math.max(1, Math.ceil(left + rect.width * scale) - x),
    height: Math.max(1, Math.ceil(top + rect.height * scale) - y),
  };
}
