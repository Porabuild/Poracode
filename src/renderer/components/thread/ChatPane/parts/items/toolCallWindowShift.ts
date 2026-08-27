/**
 * Sliding-window animation for the collapsed tool-call group.
 *
 * When a live group already shows its row cap, each new tool call drops the
 * oldest row. Without help that is a hard one-frame jump. This module glides the
 * remaining rows up by exactly one row pitch while the dropped row fades out in
 * the vacated slot.
 *
 * Two hard rules shape the implementation:
 *
 * 1. The group layout height must never change mid-animation. The chat list is
 *    virtualized and `ChatScrollControls.syncLayoutNowAndAfterPaint` re-pins
 *    scroll on every height change, so a `height`/`max-height` animation would
 *    fire a synchronous layout plus virtualizer reconcile on every frame and
 *    fight the animation it is reacting to. The outgoing row is therefore lifted
 *    out of flow into a ghost layer, leaving the in-flow row count — and so the
 *    height — constant.
 * 2. Nothing may be measured per row append. Row pitch is a pure function of the
 *    GUI chat font size (a clamped integer from settings), so it is baked into a
 *    lookup table at module load together with the keyframes it implies. The two
 *    `Animation` objects are created once per rig and rewound on later shifts,
 *    which also coalesces bursts: a tool call arriving mid-slide resets the
 *    playhead instead of queueing.
 *
 * Both animated properties (`transform`, `opacity`) are compositor-only.
 */
import { guiChatBaseFontPx, guiChatCommandFontPx } from "../../chatFontVars";

/** `gap-0.5` between rows in the group viewport. */
const ROW_GAP_PX = 2;
/** `py-0.5` on a collapsed row. */
const ROW_PADDING_Y_PX = 4;
/** Tailwind `leading-tight`. */
const ROW_LINE_HEIGHT = 1.25;
/** `size-3.5` disclosure indicator; all collapsed rows share this minimum. */
const ROW_MIN_CONTENT_HEIGHT_PX = 14;

export const TOOL_CALL_SHIFT_DURATION_MS = 200;
/**
 * Frame-rate cap. A compositor animation otherwise updates once per display
 * refresh, so a 144Hz panel would produce 29 distinct transforms for this slide.
 * The easing curve is instead sampled at this rate and each sample is *held*
 * (`steps(1, end)` per keyframe), so the layer transform changes at most
 * `TOOL_CALL_SHIFT_STEPS` times no matter how fast the display runs.
 *
 * 40 rather than 60 because the travel is only one row (20..30px): after
 * device-pixel snapping, a 60fps sampling of this curve collapses to the same
 * ~7 distinct positions a 40fps sampling produces, so the extra samples were
 * baked and then thrown away. Going lower is a bad trade — at 30fps the largest
 * single jump reaches two thirds of the travel and reads as a teleport.
 */
const TOOL_CALL_SHIFT_TARGET_FPS = 40;
export const TOOL_CALL_SHIFT_STEPS = Math.max(
  1,
  Math.round((TOOL_CALL_SHIFT_DURATION_MS * TOOL_CALL_SHIFT_TARGET_FPS) / 1000),
);
/** Drop the rig (and its composited layers) once the group stops shifting. */
const RIG_IDLE_TEARDOWN_MS = 2_000;

/**
 * `cubic-bezier(0.5, 0, 0.5, 1)` — symmetric ease, deliberately *not* the
 * `cubic-bezier(0.16, 1, 0.3, 1)` expo-out the enter fades use. Over a single
 * row of travel that curve front-loads so hard that the first held sample jumps
 * 43% of the distance (9px of 21px) while the tail crawls in 1px increments:
 * `9,5,3,2,1,1`. The symmetric curve spends the same seven drawn frames evenly
 * — `2,4,4,5,4,2` — which is the whole point of a slide the eye is meant to
 * follow. Expo-out stays correct for opacity, where there is no distance to
 * distribute.
 */
const EASE_X1 = 0.5;
const EASE_Y1 = 0;
const EASE_X2 = 0.5;
const EASE_Y2 = 1;

function bezierAxis(t: number, p1: number, p2: number): number {
  const inv = 1 - t;
  return 3 * inv * inv * t * p1 + 3 * inv * t * t * p2 + t * t * t;
}

/**
 * Progress along the easing curve at a given time fraction. Bisection rather
 * than Newton-Raphson: this runs `TOOL_CALL_SHIFT_STEPS + 1` times at module
 * load and never again, so clarity beats convergence speed.
 */
function easeProgress(timeFraction: number): number {
  if (timeFraction <= 0) return 0;
  if (timeFraction >= 1) return 1;
  let low = 0;
  let high = 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (low + high) / 2;
    if (bezierAxis(mid, EASE_X1, EASE_X2) < timeFraction) low = mid;
    else high = mid;
  }
  return bezierAxis((low + high) / 2, EASE_Y1, EASE_Y2);
}

/**
 * The eased curve sampled once at the capped rate, shared by every pitch and by
 * the ghost fade. Baked at module load: the animation never evaluates easing.
 */
const EASED_PROGRESS: readonly number[] = Array.from(
  { length: TOOL_CALL_SHIFT_STEPS + 1 },
  (_unused, index) => easeProgress(index / TOOL_CALL_SHIFT_STEPS),
);

const GHOST_CLASS = "poracode-tool-call-group-ghost";
const CLIP_CLASS = "poracode-tool-call-group-clip";
/** Mirrors the class ToolCallGroup puts on freshly mounted rows. */
const ROW_ENTER_CLASS = "animate-tool-call-enter";

/**
 * Row pitch (row height + gap) in CSS px, snapped to whole device pixels so the
 * composited slide blits text without resampling it.
 */
export function toolCallRowPitchPx(guiChatFontSize: number, devicePixelRatio: number): number {
  const fontPx = guiChatCommandFontPx(guiChatFontSize);
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const raw =
    Math.max(ROW_MIN_CONTENT_HEIGHT_PX, fontPx * ROW_LINE_HEIGHT) + ROW_PADDING_Y_PX + ROW_GAP_PX;
  return Math.round(raw * dpr) / dpr;
}

/** Baked pitch per supported font size — 13 entries, no DOM reads at runtime. */
const PITCH_TABLE = new Map<number, number>();
/** Baked slide keyframes per distinct pitch, so playback allocates nothing. */
const SLIDE_KEYFRAMES = new Map<number, Keyframe[]>();
/**
 * The ghost fade, capped and baked the same way. Linear values: a fade needs no
 * easing, and holding each step keeps opacity changes down to the same count as
 * the slide so the two animations damage the same frames instead of alternating.
 */
const FADE_KEYFRAMES: Keyframe[] = EASED_PROGRESS.map((_unused, index) => ({
  offset: index / TOOL_CALL_SHIFT_STEPS,
  opacity: 1 - index / TOOL_CALL_SHIFT_STEPS,
  easing: "steps(1, end)",
}));

/**
 * Bakes the held-sample keyframe list for one pitch. Every sampled offset is
 * snapped to a whole device pixel, so no frame of the slide lands on a
 * fractional position — the compositor blits the text texture without ever
 * resampling it, and repeated samples near the end of the ease produce
 * identical transforms, which cost nothing at all.
 */
function bakeSlideKeyframes(pitch: number, dpr: number): Keyframe[] {
  return EASED_PROGRESS.map((progress, index) => {
    const offset = index / TOOL_CALL_SHIFT_STEPS;
    const remaining = Math.round(pitch * (1 - progress) * dpr) / dpr;
    return {
      offset,
      transform: `translateY(${remaining}px)`,
      easing: "steps(1, end)",
    };
  });
}

function bakeTables(devicePixelRatio: number): void {
  PITCH_TABLE.clear();
  SLIDE_KEYFRAMES.clear();
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  for (let base = 8; base <= 20; base += 1) {
    const pitch = toolCallRowPitchPx(base, devicePixelRatio);
    PITCH_TABLE.set(base, pitch);
    if (!SLIDE_KEYFRAMES.has(pitch)) {
      SLIDE_KEYFRAMES.set(pitch, bakeSlideKeyframes(pitch, dpr));
    }
  }
}

let bakedForDpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
bakeTables(bakedForDpr);

function pitchFor(guiChatFontSize: number, devicePixelRatio: number): number {
  // Rebake only when the display itself changes (monitor move, zoom).
  if (devicePixelRatio !== bakedForDpr) {
    bakedForDpr = devicePixelRatio;
    bakeTables(devicePixelRatio);
  }
  return (
    PITCH_TABLE.get(guiChatBaseFontPx(guiChatFontSize)) ??
    toolCallRowPitchPx(guiChatFontSize, devicePixelRatio)
  );
}

export interface ToolCallWindowShiftSync {
  /** Wrapper that owns the ghost layer and clips the slide. */
  wrap: HTMLElement | null;
  /** In-flow rows container that gets translated. */
  viewport: HTMLElement | null;
  /** Keys of the currently rendered visible rows, in order. */
  keys: readonly string[];
  /** Raw Settings -> GUI chat font size. */
  guiChatFontSize: number;
  /**
   * False whenever the animation would be wrong or pointless: not a live
   * collapsed window, a row is expanded (pitch no longer uniform), reduced
   * motion, or a hidden document. The rig is torn down and the shift snaps.
   */
  enabled: boolean;
}

export interface ToolCallWindowShiftHandle {
  /** Run once per commit, from a layout effect, before the browser paints. */
  sync(next: ToolCallWindowShiftSync): void;
  /** Cancel an active shift while keeping the handle ready for later rows. */
  cancel(): void;
  dispose(): void;
  /** Test/measurement seam: is a ghost currently mounted and fading? */
  isAnimating(): boolean;
}

/**
 * Detects the one transition worth animating: the window kept its length and
 * shifted by exactly one row. Anything else (first render, growth, replacement,
 * a multi-row burst collapsed into one commit) snaps.
 */
function isSingleRowShift(previous: readonly string[], next: readonly string[]): boolean {
  return previous.length > 1 && previous.length === next.length && previous[1] === next[0];
}

export function createToolCallWindowShift(
  win: Pick<Window, "devicePixelRatio" | "setTimeout" | "clearTimeout">,
): ToolCallWindowShiftHandle {
  let previousKeys: readonly string[] = [];
  let previousFirstNode: Element | null = null;
  let ghost: HTMLElement | null = null;
  let slide: Animation | null = null;
  let fade: Animation | null = null;
  let rigPitch = 0;
  let rigWrap: HTMLElement | null = null;
  let rigViewport: HTMLElement | null = null;
  let idleTimer: number | null = null;
  let animating = false;

  function clearIdleTimer(): void {
    if (idleTimer === null) return;
    win.clearTimeout(idleTimer);
    idleTimer = null;
  }

  function releaseGhost(): void {
    animating = false;
    ghost?.replaceChildren();
    rigWrap?.classList.remove(CLIP_CLASS);
  }

  function teardownRig(): void {
    clearIdleTimer();
    slide?.cancel();
    fade?.cancel();
    slide = null;
    fade = null;
    releaseGhost();
    ghost?.remove();
    ghost = null;
    rigWrap = null;
    rigViewport = null;
    rigPitch = 0;
  }

  function ensureRig(wrap: HTMLElement, viewport: HTMLElement, pitch: number): boolean {
    // The rig binds to one wrap/viewport/pitch triple; anything else rebuilds it
    // so a font-size change or a remount can never slide by a stale distance.
    if (ghost && rigWrap === wrap && rigViewport === viewport && rigPitch === pitch) return true;
    teardownRig();
    const keyframes = SLIDE_KEYFRAMES.get(pitch);
    if (!keyframes || typeof viewport.animate !== "function") return false;
    ghost = wrap.ownerDocument.createElement("div");
    ghost.className = GHOST_CLASS;
    ghost.setAttribute("aria-hidden", "true");
    ghost.inert = true;
    wrap.appendChild(ghost);
    // `fill: none` on the slide so a finished run leaves no forced transform
    // behind; `forwards` on the fade keeps the ghost invisible until released.
    // Easing lives in the baked keyframes, so the animation itself must stay
    // linear — an easing here would warp the already-eased samples.
    slide = viewport.animate(keyframes, {
      duration: TOOL_CALL_SHIFT_DURATION_MS,
      easing: "linear",
      fill: "none",
    });
    fade = ghost.animate(FADE_KEYFRAMES, {
      duration: TOOL_CALL_SHIFT_DURATION_MS,
      easing: "linear",
      fill: "forwards",
    });
    slide.onfinish = releaseGhost;
    rigWrap = wrap;
    rigViewport = viewport;
    rigPitch = pitch;
    return true;
  }

  function play(outgoing: Element): void {
    if (!ghost || !slide || !fade) return;
    // Re-inserting an element restarts its CSS animations, so the enter fade has
    // to come off before the detached row is re-parented into the ghost.
    outgoing.classList.remove(ROW_ENTER_CLASS);
    ghost.replaceChildren(outgoing);
    rigWrap?.classList.add(CLIP_CLASS);
    animating = true;
    // Rewind rather than re-create: no allocation, and a burst arriving mid
    // slide coalesces into a single restarted run.
    slide.currentTime = 0;
    fade.currentTime = 0;
    slide.play();
    fade.play();
    clearIdleTimer();
    idleTimer = win.setTimeout(teardownRig, RIG_IDLE_TEARDOWN_MS);
  }

  return {
    sync({ wrap, viewport, keys, guiChatFontSize, enabled }) {
      if (!enabled || !wrap || !viewport) {
        if (ghost) teardownRig();
        previousKeys = keys;
        previousFirstNode = viewport?.firstElementChild ?? null;
        return;
      }
      const outgoing = previousFirstNode;
      const shifted = isSingleRowShift(previousKeys, keys) && !!outgoing && !outgoing.isConnected;
      if (shifted && ensureRig(wrap, viewport, pitchFor(guiChatFontSize, win.devicePixelRatio))) {
        play(outgoing);
      }
      previousKeys = keys;
      // Hold the node React will detach on the next shift: re-parenting it costs
      // nothing, where cloning or keeping it mounted in React would not.
      previousFirstNode = viewport.firstElementChild;
    },
    cancel: teardownRig,
    dispose: teardownRig,
    isAnimating: () => animating,
  };
}
