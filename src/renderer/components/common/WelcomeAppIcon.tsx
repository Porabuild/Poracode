import { useEffect, useRef } from "react";
import appIconUrl from "../../../../build/icon.png";

// Orbit + reveal animations finish ~2.4s after the icon mounts. After that the
// comet has scaled to 0 and no longer needs its center sampled, so the rAF loop
// driving `--comet-x/y` can stop.
const ORBIT_DURATION_MS = 2400;

// `--comet-x/y` are the centers of a full-surface background gradient
// (`.poracode-welcome-bg-glow`) AND a mask over the glyph-heavy code wall
// (`.poracode-welcome-code-wall`). Neither `background-position` nor
// `mask-image` is compositor-animatable, so each write re-rasterizes the
// surface on the main thread. Writing them on every display refresh (~120fps on
// high-refresh panels) is what drops frames — the diffuse glow only needs a
// handful of updates per second. Gate the write to the shared ~20fps cadence
// (matches `thinkingAnimator.ts` TICK_MS) so the frame pipeline idles between
// ticks instead of stalling on per-frame repaints.
const COMET_LIGHT_TICK_MS = 50; // ~20fps

/**
 * The welcome app icon with its full landing animation: a comet spiraling in,
 * the splash/light flash as it lands, the icon revealing under it, and the
 * always-on conic "lightning" ring. Shared by every first-launch surface so the
 * icon reads the same regardless of which entry point the user arrives through.
 *
 * While the comet flies, its center is published as `--comet-x/y` on the
 * enclosing `.poracode-welcome-page` element, so the backdrop's pointer glow and
 * code-wall mask light up along its path and stay lit behind the landed icon.
 * That class is the marker for "surface that consumes the comet light" (the
 * welcome overlay root, `WelcomeBackdrop`), so the icon finds its own light
 * target instead of every caller threading a ref through.
 *
 * Pass `intro={false}` for a re-entry render — an icon that comes back after
 * being swapped out (a pairing attempt returning to the form, say) must not
 * replay the 2s-delayed reveal, which would blink it out.
 */
export function WelcomeAppIcon(props: { readonly intro?: boolean }) {
  const intro = props.intro ?? true;
  const cometRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!intro) return;
    // Honor reduced motion: the comet is hidden by CSS in this mode, so leave
    // the glow parked at its off-screen default rather than sampling it.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const comet = cometRef.current;
    const target = comet?.closest<HTMLElement>(".poracode-welcome-page");
    if (!comet || !target) return;
    let rafId = 0;
    let stopped = false;
    // NEGATIVE_INFINITY so the first frame writes immediately — no one-frame
    // gap where the glow sits at its off-screen default.
    let lastWriteAt = Number.NEGATIVE_INFINITY;
    const updateCometLight = (now: number) => {
      if (stopped) return;
      // Throttle the expensive (non-compositable) write to ~20fps; skipped
      // frames cost only a timestamp compare + reschedule.
      if (now - lastWriteAt >= COMET_LIGHT_TICK_MS) {
        lastWriteAt = now;
        const cometRect = comet.getBoundingClientRect();
        // Re-read the target's box each tick rather than caching it: a scrollable
        // backdrop can move under the comet mid-flight, and at 20fps the extra
        // layout read is cheaper than a glow drifting off the icon.
        const targetRect = target.getBoundingClientRect();
        const cx = cometRect.left + cometRect.width / 2 - targetRect.left;
        const cy = cometRect.top + cometRect.height / 2 - targetRect.top;
        target.style.setProperty("--comet-x", `${cx}px`);
        target.style.setProperty("--comet-y", `${cy}px`);
      }
      rafId = requestAnimationFrame(updateCometLight);
    };
    rafId = requestAnimationFrame(updateCometLight);
    const stopTimer = window.setTimeout(() => {
      stopped = true;
      cancelAnimationFrame(rafId);
    }, ORBIT_DURATION_MS);
    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      clearTimeout(stopTimer);
      // The comet lands at the icon's center, so the parked glow is the halo
      // behind it — it only needs clearing when the icon itself goes away.
      target.style.removeProperty("--comet-x");
      target.style.removeProperty("--comet-y");
    };
  }, [intro]);

  // Every decorative layer is `pointer-events-none`: the orbit scales to 18x
  // mid-flight and the splash parks at `scale(6)` under the animation's `both`
  // fill, so both spill far outside the icon box and would otherwise sit on top
  // of whatever the surface puts below the icon (a pairing input, the welcome
  // CTAs) and swallow its clicks — the splash permanently, since it never
  // unmounts.
  return (
    <div className="poracode-welcome-icon-wrap relative flex size-24 items-center justify-center">
      {intro ? (
        <>
          <span className="poracode-welcome-light pointer-events-none absolute inset-[-18px] rounded-full" />
          <span className="poracode-welcome-splash pointer-events-none absolute inset-[-26px] rounded-full" />
          <span className="poracode-welcome-orbit pointer-events-none absolute inset-[-12px] rounded-full">
            <span
              ref={cometRef}
              className="poracode-welcome-comet absolute left-1/2 top-0 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full"
            />
          </span>
        </>
      ) : null}
      <span
        className={`poracode-welcome-ring pointer-events-none absolute inset-[5px] rounded-[1.85rem] ${
          intro ? "" : "poracode-welcome-ring-steady"
        }`}
      />
      <span
        className={`poracode-welcome-icon-glass pointer-events-none absolute inset-2 rounded-[1.65rem] ${
          intro ? "poracode-welcome-reveal" : ""
        }`}
      />
      <img
        src={appIconUrl}
        alt=""
        draggable={false}
        className={`relative size-20 rounded-[1.55rem] ${intro ? "poracode-welcome-reveal" : ""}`}
      />
    </div>
  );
}
