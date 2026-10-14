// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PickerPayload } from "./pickerProtocol";
import { buildPickerScript } from "./pickerScript";

let hidden = false;
let nextFrame = 0;
let pickerShadow: ShadowRoot;
const frames = new Map<number, FrameRequestCallback>();

beforeEach(() => {
  hidden = false;
  nextFrame = 0;
  frames.clear();
  document.body.innerHTML = '<div id="target"></div>';
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    const id = ++nextFrame;
    frames.set(id, callback);
    return id;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    frames.delete(id);
  });
  const attachShadow = Element.prototype.attachShadow;
  vi.spyOn(Element.prototype, "attachShadow").mockImplementation(function (this: Element, init) {
    pickerShadow = attachShadow.call(this, init);
    return pickerShadow;
  });
  const target = document.getElementById("target")!;
  vi.spyOn(target, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 200, 80, 40));
  Object.defineProperty(document, "elementsFromPoint", {
    configurable: true,
    value: () => [target],
  });
});

afterEach(() => {
  hidden = true;
  document.dispatchEvent(new Event("visibilitychange"));
  window.dispatchEvent(new CustomEvent("__poracode_picker_cancel"));
  document.body.innerHTML = "";
  Reflect.deleteProperty(document, "elementsFromPoint");
  vi.restoreAllMocks();
});

function startPicker(): Promise<PickerPayload> {
  return window.eval(
    buildPickerScript("tab-1", "poracode-picker://commit"),
  ) as Promise<PickerPayload>;
}

function clickTarget() {
  pickerShadow.querySelector(".scrim")!.dispatchEvent(new MouseEvent("click"));
}

function advanceFrame() {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(performance.now()));
}

describe("element picker commit", () => {
  it("removes the highlight and lets it paint before resolving a capture", async () => {
    const picker = startPicker();
    const committed = vi.fn<(payload: PickerPayload) => void>();
    void picker.then(committed);

    clickTarget();
    expect(document.querySelector("[data-lc-picker]")).toBeNull();
    await Promise.resolve();
    expect(committed).not.toHaveBeenCalled();

    advanceFrame();
    await Promise.resolve();
    expect(committed).not.toHaveBeenCalled();
    advanceFrame();
    await expect(picker).resolves.toMatchObject({
      kind: "picked",
      selector: "#target",
      rect: { x: 100, y: 200, width: 80, height: 40 },
    });
    expect(frames.size).toBe(0);
  });

  it("resolves cancellation immediately without waiting for a visible frame", async () => {
    const picker = startPicker();
    window.dispatchEvent(new CustomEvent("__poracode_picker_cancel"));

    await expect(picker).resolves.toEqual({ kind: "cancelled" });
    expect(document.querySelector("[data-lc-picker]")).toBeNull();
    expect(frames.size).toBe(0);
  });

  it("cancels the selection and its frame if the page becomes hidden before paint", async () => {
    const picker = startPicker();
    clickTarget();
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));

    await expect(picker).resolves.toEqual({ kind: "cancelled" });
    expect(frames.size).toBe(0);
  });

  it("cancels selection on an already hidden page without waiting for frames", async () => {
    hidden = true;
    const picker = startPicker();
    clickTarget();

    await expect(picker).resolves.toEqual({ kind: "cancelled" });
    expect(frames.size).toBe(0);
  });
});
