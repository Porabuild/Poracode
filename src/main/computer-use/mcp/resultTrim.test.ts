import { describe, expect, it } from "vitest";
import {
  compactScreenshotNote,
  compactStateNotes,
  deliveryTargetAddsNothing,
  shouldEchoWindow,
  trimInteractiveResult,
  trimObservation,
  trimPerformResult,
  windowAddsNothing,
} from "./resultTrim";
import type { ComputerUseWindow, ComputerUseWindowState } from "./types";

const window: ComputerUseWindow = {
  app: "/Applications/Editor.app",
  id: 1265,
  title: "Untitled",
  x: 0,
  y: 38,
  width: 1200,
  height: 800,
};

function state(overrides: Partial<ComputerUseWindowState> = {}): ComputerUseWindowState {
  return {
    accessibility: null,
    mode: "passive",
    screenshots: [],
    window,
    ...overrides,
  };
}

describe("computer-use result trimming", () => {
  it("treats identity metadata the caller cannot act on as no new information", () => {
    expect(
      windowAddsNothing(window, { ...window, pid: 900, displayName: "Built-in", source: "cg" }),
    ).toBe(true);
    expect(shouldEchoWindow(window, { ...window, pid: 900 })).toBe(false);
  });

  it("echoes the window when identity, title, geometry, or minimized state changed", () => {
    expect(shouldEchoWindow(window, { ...window, id: 1266 })).toBe(true);
    expect(shouldEchoWindow(window, { ...window, title: "Report" })).toBe(true);
    expect(shouldEchoWindow(window, { ...window, y: 120 })).toBe(true);
    expect(shouldEchoWindow(window, { ...window, minimized: true })).toBe(true);
  });

  it("echoes the window when the caller supplied none or only partial geometry", () => {
    expect(shouldEchoWindow(undefined, window)).toBe(true);
    expect(shouldEchoWindow({ app: window.app, id: window.id }, window)).toBe(true);
  });

  it("keeps a delivery target only when it names the native target", () => {
    expect(deliveryTargetAddsNothing({ kind: "cg", id: "1265" }, window)).toBe(true);
    expect(deliveryTargetAddsNothing({ kind: "win32", id: "1265" }, window)).toBe(true);
    expect(deliveryTargetAddsNothing({ kind: "ax", id: "1265", role: "AXButton" }, window)).toBe(
      false,
    );
    expect(deliveryTargetAddsNothing({ kind: "cg", id: "77" }, window)).toBe(false);
    expect(deliveryTargetAddsNothing(undefined, window)).toBe(true);
  });

  it("drops the unchanged window echo and the id-restating delivery target", () => {
    expect(
      trimInteractiveResult(
        {
          ok: true,
          mode: "interactive",
          window,
          delivery: {
            delivered: "background",
            route: "event",
            verified: "unverified",
            target: { kind: "cg", id: "1265" },
          },
        },
        { requestedWindow: window },
      ),
    ).toEqual({
      ok: true,
      mode: "interactive",
      delivery: { delivered: "background", route: "event", verified: "unverified" },
    });
  });

  it("echoes the window for a takeover response even when nothing changed", () => {
    expect(
      trimInteractiveResult(
        {
          ok: true,
          mode: "interactive",
          window,
          delivery: { delivered: "foreground", route: "input", verified: "confirmed" },
        },
        { requestedWindow: window, alwaysEchoWindow: true },
      ),
    ).toMatchObject({ window });
  });

  it("keeps a refusal's window when it reports a changed window", () => {
    expect(
      trimInteractiveResult(
        {
          ok: false,
          mode: "interactive",
          window: { ...window, minimized: true },
          refused: { code: "window_minimized", reason: "minimized", hint: "activate it" },
        },
        { requestedWindow: window },
      ),
    ).toMatchObject({ ok: false, window: { minimized: true } });
  });

  it("drops an observation window that repeats the window the caller knows", () => {
    expect(trimObservation({ ok: true, state: state() }, window)).toEqual({
      ok: true,
      state: { accessibility: null, mode: "passive", screenshots: [] },
    });
    expect(
      trimObservation({ ok: true, state: state({ window: { ...window, y: 400 } }) }, window),
    ).toMatchObject({ state: { window: { y: 400 } } });
    expect(trimObservation({ ok: false, error: "capture failed" }, window)).toEqual({
      ok: false,
      error: "capture failed",
    });
  });

  it("states a batch window once and keeps only per-step outcome detail", () => {
    const result = trimPerformResult({
      ok: true,
      mode: "batch",
      window,
      steps: [
        {
          index: 0,
          action: "set_element_value",
          result: {
            ok: true,
            mode: "interactive",
            window,
            delivery: {
              delivered: "background",
              route: "accessibility",
              verified: "confirmed",
              target: { kind: "ax", id: "s1:4", role: "AXTextField" },
            },
          },
        },
        {
          index: 1,
          action: "press_key",
          result: {
            ok: true,
            mode: "interactive",
            window,
            delivery: {
              delivered: "background",
              route: "event",
              verified: "unverified",
              target: { kind: "cg", id: "1265" },
            },
          },
        },
      ],
      observation: { ok: true, state: state() },
    });

    expect(result).toEqual({
      ok: true,
      mode: "batch",
      window,
      steps: [
        {
          index: 0,
          action: "set_element_value",
          ok: true,
          delivery: {
            delivered: "background",
            route: "accessibility",
            verified: "confirmed",
            target: { kind: "ax", id: "s1:4", role: "AXTextField" },
          },
        },
        {
          index: 1,
          action: "press_key",
          ok: true,
          delivery: { delivered: "background", route: "event", verified: "unverified" },
        },
      ],
      observation: { ok: true, state: { accessibility: null, mode: "passive", screenshots: [] } },
    });
    expect(JSON.stringify(result).match(/"app"/gu)).toHaveLength(1);
  });

  it("compacts the capture downscale note to the coordinate rule and the scale", () => {
    const verbose =
      "Screenshot was downscaled to 557x371 px (scale 0.4644) from the 1200x800 window to shrink the payload. To convert a coordinate you read from this screenshot into the window-relative coordinate for click/scroll/drag, DIVIDE it by 0.4644 (both x and y).";
    const compact = compactScreenshotNote(verbose);

    expect(compact).toBe(
      "Screenshot downscaled: divide screenshot x/y by 0.4644 for window coordinates.",
    );
    expect(compact.length).toBeLessThan(verbose.length / 3);
  });

  it("leaves unrelated capture notes untouched", () => {
    expect(
      compactStateNotes(["Window is occluded; captured with Windows Graphics Capture."]),
    ).toEqual(["Window is occluded; captured with Windows Graphics Capture."]);
    expect(compactStateNotes(undefined)).toBeUndefined();
    expect(compactStateNotes([])).toEqual([]);
  });
});
