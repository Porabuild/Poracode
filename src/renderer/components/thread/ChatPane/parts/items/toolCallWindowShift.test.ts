import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createToolCallWindowShift,
  toolCallRowPitchPx,
  TOOL_CALL_SHIFT_DURATION_MS,
  TOOL_CALL_SHIFT_STEPS,
  type ToolCallWindowShiftSync,
} from "./toolCallWindowShift";

/**
 * jsdom has no Web Animations API, so every element that the rig animates gets a
 * recording stub. Each returned handle captures the calls the rig makes, which
 * is exactly the contract worth pinning: what plays, how often, and whether it
 * was rewound rather than re-created.
 */
interface FakeAnimation {
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  plays: number;
  cancels: number;
  currentTime: number | null;
  onfinish: (() => void) | null;
  play(): void;
  cancel(): void;
  finish(): void;
}

const created: FakeAnimation[] = [];

const originalAnimate = Element.prototype.animate as Element["animate"] | undefined;

/** Installs the recording stub on the prototype so ghosts get it for free. */
function installAnimateStub(): void {
  (Element.prototype as unknown as { animate: unknown }).animate = function fakeAnimate(
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
  ): FakeAnimation {
    const anim: FakeAnimation = {
      keyframes,
      options,
      plays: 1,
      cancels: 0,
      currentTime: 0,
      onfinish: null,
      play() {
        this.plays += 1;
      },
      cancel() {
        this.cancels += 1;
      },
      finish() {
        this.onfinish?.();
      },
    };
    created.push(anim);
    return anim;
  };
}

/** Minimal stand-in for the tool-call group DOM the rig operates on. */
function mountWindow(rowCount: number) {
  document.body.innerHTML = "";
  const wrap = document.createElement("div");
  const viewport = document.createElement("div");
  wrap.appendChild(viewport);
  document.body.appendChild(wrap);
  const keys: string[] = [];
  for (let i = 0; i < rowCount; i += 1) {
    keys.push(`row-${i}`);
    const row = document.createElement("div");
    row.className = "animate-tool-call-enter";
    row.dataset.key = `row-${i}`;
    viewport.appendChild(row);
  }
  return { wrap, viewport, keys };
}

function appendRow(viewport: HTMLElement, keys: string[], nextKey: string): string[] {
  viewport.firstElementChild?.remove();
  const row = document.createElement("div");
  row.className = "animate-tool-call-enter";
  row.dataset.key = nextKey;
  viewport.appendChild(row);
  return [...keys.slice(1), nextKey];
}

const fakeWin = {
  devicePixelRatio: 1,
  setTimeout: ((fn: () => void, ms: number) =>
    globalThis.setTimeout(fn, ms)) as unknown as Window["setTimeout"],
  clearTimeout: ((id: number) => globalThis.clearTimeout(id)) as unknown as Window["clearTimeout"],
};

function syncArgs(
  over: Partial<ToolCallWindowShiftSync> &
    Pick<ToolCallWindowShiftSync, "wrap" | "viewport" | "keys">,
): ToolCallWindowShiftSync {
  return { guiChatFontSize: 13, enabled: true, ...over };
}

describe("toolCallRowPitchPx", () => {
  // The whole design rests on pitch being predictable without measuring, so the
  // baked values are pinned here. 12px command font -> 12 * 1.25 line box + 4px
  // py-0.5 + 2px gap-0.5 = 21px. Smaller fonts use the shared 14px row minimum.
  it("bakes the measured row pitch from the font size alone", () => {
    expect(toolCallRowPitchPx(13, 1)).toBe(21);
    expect(toolCallRowPitchPx(8, 1)).toBe(20);
    expect(toolCallRowPitchPx(10, 1)).toBe(20);
    expect(toolCallRowPitchPx(20, 1)).toBe(30);
  });

  it("clamps out-of-range font sizes the same way the CSS vars do", () => {
    expect(toolCallRowPitchPx(2, 1)).toBe(toolCallRowPitchPx(8, 1));
    expect(toolCallRowPitchPx(99, 1)).toBe(toolCallRowPitchPx(20, 1));
  });

  it("snaps to whole device pixels so composited text is not resampled", () => {
    for (const dpr of [1, 1.25, 1.5, 2]) {
      for (let base = 8; base <= 20; base += 1) {
        const pitch = toolCallRowPitchPx(base, dpr);
        expect(Number.isInteger(pitch * dpr)).toBe(true);
      }
    }
  });
});

describe("createToolCallWindowShift", () => {
  beforeEach(() => {
    created.length = 0;
    installAnimateStub();
  });

  afterEach(() => {
    // Never leave the stub on the prototype: other suites in this worker rely on
    // the real (absent) Web Animations API.
    if (originalAnimate) {
      Element.prototype.animate = originalAnimate;
    } else {
      delete (Element.prototype as { animate?: unknown }).animate;
    }
  });

  it("caps the slide at 40fps-equivalent held samples instead of one per refresh", () => {
    const { wrap, viewport, keys } = mountWindow(8);
    const shift = createToolCallWindowShift(fakeWin);
    shift.sync(syncArgs({ wrap, viewport, keys }));
    const nextKeys = appendRow(viewport, keys, "row-8");
    shift.sync(syncArgs({ wrap, viewport, keys: nextKeys }));

    const [slide, fade] = created;
    // 200ms at 40fps -> 8 steps, so 9 samples including both endpoints. A 144Hz
    // display would otherwise interpolate ~29 distinct transforms.
    expect(TOOL_CALL_SHIFT_STEPS).toBe(8);
    expect(slide!.keyframes).toHaveLength(TOOL_CALL_SHIFT_STEPS + 1);
    expect(fade!.keyframes).toHaveLength(TOOL_CALL_SHIFT_STEPS + 1);
    // Every sample holds until the next one, and the animation itself must not
    // re-ease the already-eased samples.
    expect(slide!.keyframes.every((frame) => frame.easing === "steps(1, end)")).toBe(true);
    expect(slide!.options.easing).toBe("linear");
    expect(fade!.options.easing).toBe("linear");
    expect(slide!.keyframes.map((frame) => frame.offset)).toEqual(
      Array.from({ length: TOOL_CALL_SHIFT_STEPS + 1 }, (_unused, i) => i / TOOL_CALL_SHIFT_STEPS),
    );
  });

  it("bakes eased, device-pixel-aligned samples that settle at zero", () => {
    const { wrap, viewport, keys } = mountWindow(8);
    const shift = createToolCallWindowShift(fakeWin);
    shift.sync(syncArgs({ wrap, viewport, keys }));
    shift.sync(syncArgs({ wrap, viewport, keys: appendRow(viewport, keys, "row-8") }));

    const offsets = created[0]!.keyframes.map((frame) =>
      Number(/translateY\((-?[\d.]+)px\)/.exec(String(frame.transform))![1]),
    );
    expect(offsets[0]).toBe(21);
    expect(offsets.at(-1)).toBe(0);
    // Monotonic descent, every sample on a whole device pixel.
    for (let i = 1; i < offsets.length; i += 1) {
      expect(offsets[i]!).toBeLessThanOrEqual(offsets[i - 1]!);
      expect(Number.isInteger(offsets[i]!)).toBe(true);
    }
    // Symmetric easing, so the midpoint sits near half the travel...
    expect(offsets[Math.floor(offsets.length / 2)]!).toBeGreaterThan(21 * 0.4);
    expect(offsets[Math.floor(offsets.length / 2)]!).toBeLessThan(21 * 0.6);
    // ...and no single drawn frame may jump more than a quarter of the travel.
    // This is the reason for the symmetric curve: the expo-out the enter fades
    // use front-loads 43% of the distance into the first held sample.
    const drawn = offsets.filter((value, index) => index === 0 || value !== offsets[index - 1]);
    const jumps = drawn.slice(1).map((value, index) => drawn[index]! - value);
    expect(Math.max(...jumps)).toBeLessThanOrEqual(Math.ceil(21 / 4));
  });

  it("slides the viewport by one baked pitch and fades the dropped row", () => {
    const { wrap, viewport, keys } = mountWindow(8);
    const shift = createToolCallWindowShift(fakeWin);
    shift.sync(syncArgs({ wrap, viewport, keys }));

    const outgoing = viewport.firstElementChild!;
    const nextKeys = appendRow(viewport, keys, "row-8");
    shift.sync(syncArgs({ wrap, viewport, keys: nextKeys }));

    const ghost = wrap.querySelector(".poracode-tool-call-group-ghost")!;
    expect(ghost).not.toBeNull();
    expect(ghost.getAttribute("aria-hidden")).toBe("true");
    expect(ghost).toHaveProperty("inert", true);
    // The detached row is re-parented, not cloned.
    expect(ghost.firstElementChild).toBe(outgoing);
    // Re-inserting an element restarts CSS animations, so the enter fade must go.
    expect(outgoing.classList.contains("animate-tool-call-enter")).toBe(false);
    expect(wrap.classList.contains("poracode-tool-call-group-clip")).toBe(true);
    expect(shift.isAnimating()).toBe(true);

    const [slide, fade] = created;
    expect(slide!.keyframes[0]).toMatchObject({ transform: "translateY(21px)" });
    expect(slide!.keyframes.at(-1)).toMatchObject({ transform: "translateY(0px)" });
    expect(slide!.options.duration).toBe(TOOL_CALL_SHIFT_DURATION_MS);
    expect(slide!.options.fill).toBe("none");
    expect(fade!.keyframes[0]).toMatchObject({ opacity: 1 });
    expect(fade!.keyframes.at(-1)).toMatchObject({ opacity: 0 });
  });

  it("keeps the in-flow row count constant so the group height cannot change", () => {
    const { wrap, viewport, keys } = mountWindow(8);
    const shift = createToolCallWindowShift(fakeWin);
    shift.sync(syncArgs({ wrap, viewport, keys }));
    const nextKeys = appendRow(viewport, keys, "row-8");
    shift.sync(syncArgs({ wrap, viewport, keys: nextKeys }));

    expect(viewport.children).toHaveLength(8);
    // The ghost hangs off the wrapper, out of the viewport's flow.
    expect(wrap.querySelector(".poracode-tool-call-group-ghost")!.parentElement).toBe(wrap);
  });

  it("rewinds one preallocated animation pair across a burst instead of allocating", () => {
    const { wrap, viewport, keys } = mountWindow(8);
    const shift = createToolCallWindowShift(fakeWin);
    shift.sync(syncArgs({ wrap, viewport, keys }));

    let current = keys;
    for (let i = 8; i < 14; i += 1) {
      current = appendRow(viewport, current, `row-${i}`);
      shift.sync(syncArgs({ wrap, viewport, keys: current }));
    }

    // Six shifts, still exactly one slide + one fade ever constructed.
    expect(created).toHaveLength(2);
    const [slide, fade] = created;
    expect(slide!.cancels).toBe(0);
    expect(slide!.currentTime).toBe(0);
    expect(fade!.currentTime).toBe(0);
    expect(slide!.plays).toBe(7); // creation + six rewinds
    expect(wrap.querySelectorAll(".poracode-tool-call-group-ghost")).toHaveLength(1);
  });

  it("releases the ghost and the clip when the slide finishes", () => {
    const { wrap, viewport, keys } = mountWindow(8);
    const shift = createToolCallWindowShift(fakeWin);
    shift.sync(syncArgs({ wrap, viewport, keys }));
    const nextKeys = appendRow(viewport, keys, "row-8");
    shift.sync(syncArgs({ wrap, viewport, keys: nextKeys }));

    created[0]!.finish();
    expect(wrap.querySelector(".poracode-tool-call-group-ghost")!.children).toHaveLength(0);
    expect(wrap.classList.contains("poracode-tool-call-group-clip")).toBe(false);
    expect(shift.isAnimating()).toBe(false);
  });

  it("snaps when disabled, and tears the rig down so no layer is held", () => {
    const { wrap, viewport, keys } = mountWindow(8);
    const shift = createToolCallWindowShift(fakeWin);
    shift.sync(syncArgs({ wrap, viewport, keys }));
    let next = appendRow(viewport, keys, "row-8");
    shift.sync(syncArgs({ wrap, viewport, keys: next }));
    expect(wrap.querySelector(".poracode-tool-call-group-ghost")).not.toBeNull();

    // A row expands (or reduced motion kicks in): pitch is no longer uniform.
    next = appendRow(viewport, next, "row-9");
    shift.sync(syncArgs({ wrap, viewport, keys: next, enabled: false }));

    expect(wrap.querySelector(".poracode-tool-call-group-ghost")).toBeNull();
    expect(created[0]!.cancels).toBe(1);
    expect(shift.isAnimating()).toBe(false);
  });

  it("resumes cleanly after a disabled stretch", () => {
    const { wrap, viewport, keys } = mountWindow(8);
    const shift = createToolCallWindowShift(fakeWin);
    shift.sync(syncArgs({ wrap, viewport, keys }));
    let next = appendRow(viewport, keys, "row-8");
    shift.sync(syncArgs({ wrap, viewport, keys: next, enabled: false }));
    expect(created).toHaveLength(0);

    next = appendRow(viewport, next, "row-9");
    shift.sync(syncArgs({ wrap, viewport, keys: next }));
    expect(created).toHaveLength(2);
    expect(shift.isAnimating()).toBe(true);
  });

  it("does not animate a growing window", () => {
    const { wrap, viewport, keys } = mountWindow(4);
    const shift = createToolCallWindowShift(fakeWin);
    shift.sync(syncArgs({ wrap, viewport, keys }));

    const row = document.createElement("div");
    row.className = "animate-tool-call-enter";
    viewport.appendChild(row);
    shift.sync(syncArgs({ wrap, viewport, keys: [...keys, "row-4"] }));

    expect(created).toHaveLength(0);
    expect(wrap.querySelector(".poracode-tool-call-group-ghost")).toBeNull();
  });

  it("does not animate a multi-row jump collapsed into one commit", () => {
    const { wrap, viewport, keys } = mountWindow(8);
    const shift = createToolCallWindowShift(fakeWin);
    shift.sync(syncArgs({ wrap, viewport, keys }));

    viewport.firstElementChild?.remove();
    viewport.firstElementChild?.remove();
    for (const key of ["row-8", "row-9"]) {
      const row = document.createElement("div");
      row.dataset.key = key;
      viewport.appendChild(row);
    }
    shift.sync(syncArgs({ wrap, viewport, keys: [...keys.slice(2), "row-8", "row-9"] }));

    expect(created).toHaveLength(0);
  });

  it("does not animate when the window content is replaced wholesale", () => {
    const { wrap, viewport, keys } = mountWindow(8);
    const shift = createToolCallWindowShift(fakeWin);
    shift.sync(syncArgs({ wrap, viewport, keys }));

    viewport.replaceChildren();
    const fresh: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      fresh.push(`other-${i}`);
      viewport.appendChild(document.createElement("div"));
    }
    shift.sync(syncArgs({ wrap, viewport, keys: fresh }));

    expect(created).toHaveLength(0);
  });

  it("rebuilds the rig when the baked pitch changes with the font size", () => {
    const { wrap, viewport, keys } = mountWindow(8);
    const shift = createToolCallWindowShift(fakeWin);
    shift.sync(syncArgs({ wrap, viewport, keys }));
    let next = appendRow(viewport, keys, "row-8");
    shift.sync(syncArgs({ wrap, viewport, keys: next }));
    expect(created[0]!.keyframes[0]).toMatchObject({ transform: "translateY(21px)" });

    next = appendRow(viewport, next, "row-9");
    shift.sync(syncArgs({ wrap, viewport, keys: next, guiChatFontSize: 16 }));

    expect(created).toHaveLength(4);
    expect(created[0]!.cancels).toBe(1);
    expect(created[2]!.keyframes[0]).toMatchObject({
      transform: `translateY(${toolCallRowPitchPx(16, 1)}px)`,
    });
  });

  it("drops the ghost and cancels animations on dispose", () => {
    const { wrap, viewport, keys } = mountWindow(8);
    const shift = createToolCallWindowShift(fakeWin);
    shift.sync(syncArgs({ wrap, viewport, keys }));
    const next = appendRow(viewport, keys, "row-8");
    shift.sync(syncArgs({ wrap, viewport, keys: next }));

    shift.dispose();

    expect(wrap.querySelector(".poracode-tool-call-group-ghost")).toBeNull();
    expect(created[0]!.cancels).toBe(1);
    expect(created[1]!.cancels).toBe(1);
  });

  it("tears the rig down once the group goes idle", async () => {
    vi.useFakeTimers();
    try {
      const { wrap, viewport, keys } = mountWindow(8);
      const shift = createToolCallWindowShift(fakeWin);
      shift.sync(syncArgs({ wrap, viewport, keys }));
      const next = appendRow(viewport, keys, "row-8");
      shift.sync(syncArgs({ wrap, viewport, keys: next }));
      expect(wrap.querySelector(".poracode-tool-call-group-ghost")).not.toBeNull();

      vi.advanceTimersByTime(2_000);

      expect(wrap.querySelector(".poracode-tool-call-group-ghost")).toBeNull();
      expect(created[0]!.cancels).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
