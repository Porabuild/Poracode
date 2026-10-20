import { useRef, useState, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";

export function DevicePreviewStage({ children, depth }: { children: ReactNode; depth: boolean }) {
  const { t } = useLingui();
  const [angle, setAngle] = useState({ x: -8, y: 14 });
  const drag = useRef<{ x: number; y: number; angle: typeof angle } | null>(null);
  const adjust = (x: number, y: number) =>
    setAngle({ x: Math.max(-30, Math.min(30, x)), y: Math.max(-40, Math.min(40, y)) });
  return (
    <div
      className="relative flex h-full min-h-0 w-full items-center justify-center"
      style={{ perspective: "1000px" }}
    >
      <div
        className="flex h-full min-h-0 w-full items-center justify-center"
        style={
          depth
            ? {
                transform: `rotateX(${angle.x}deg) rotateY(${angle.y}deg) scale(.88)`,
                transformStyle: "preserve-3d",
                filter: "drop-shadow(10px 12px 6px rgb(0 0 0 / .35))",
              }
            : undefined
        }
      >
        {children}
      </div>
      {depth ? (
        <div
          role="slider"
          tabIndex={0}
          aria-label={t`3D preview, view only. Drag or use arrow keys to rotate; Home resets.`}
          aria-valuemin={-40}
          aria-valuemax={40}
          aria-valuenow={angle.y}
          className="absolute inset-0 cursor-grab touch-none rounded-lg focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing"
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(event.key))
              return;
            event.preventDefault();
            if (event.key === "Home") setAngle({ x: -8, y: 14 });
            else
              adjust(
                angle.x + (event.key === "ArrowUp" ? -5 : event.key === "ArrowDown" ? 5 : 0),
                angle.y + (event.key === "ArrowLeft" ? -5 : event.key === "ArrowRight" ? 5 : 0),
              );
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { x: event.clientX, y: event.clientY, angle };
          }}
          onPointerMove={(event) => {
            if (drag.current)
              adjust(
                drag.current.angle.x - (event.clientY - drag.current.y) / 4,
                drag.current.angle.y + (event.clientX - drag.current.x) / 4,
              );
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <span className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-2 py-1 text-[11px] text-white">{t`3D preview · View only`}</span>
        </div>
      ) : null}
    </div>
  );
}
