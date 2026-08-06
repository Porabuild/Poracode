import { afterEach, describe, expect, it, vi } from "vitest";
import type { CdpSession } from "./cdp/cdpClient";
import { setCursorOverlayVisible, withCursorOverlayHidden } from "./cursorOverlay";

type RuntimeEvaluateResponse = { result: { type: string; value: boolean } };
type Send = (method: string, params?: Record<string, unknown>) => Promise<RuntimeEvaluateResponse>;

function createCdp(events: string[], expressions: string[], hideResult = true): CdpSession {
  return {
    send: vi.fn<Send>(async (_method, params) => {
      const expression = String(params?.expression ?? "");
      expressions.push(expression);
      if (expression.includes("depth+1")) {
        events.push("hide");
        return { result: { type: "boolean", value: hideResult } };
      }
      events.push("restore");
      return { result: { type: "boolean", value: true } };
    }),
  } as unknown as CdpSession;
}

afterEach(() => vi.useRealTimers());

describe("withCursorOverlayHidden", () => {
  it("hides presence visuals during capture and restores them afterward", async () => {
    const events: string[] = [];
    const expressions: string[] = [];
    const cdp = createCdp(events, expressions);

    await expect(
      withCursorOverlayHidden(cdp, async () => {
        events.push("capture");
        return "image";
      }),
    ).resolves.toBe("image");

    expect(events).toEqual(["hide", "capture", "restore"]);
    expect(expressions[0]).toContain("#__poracode_cursor__");
    expect(expressions[0]).toContain("[data-poracode-cursor-ripple]");
  });

  it("restores presence visuals when capture fails", async () => {
    const events: string[] = [];
    const cdp = createCdp(events, []);

    await expect(
      withCursorOverlayHidden(cdp, async () => {
        events.push("capture");
        throw new Error("capture failed");
      }),
    ).rejects.toThrow("capture failed");

    expect(events).toEqual(["hide", "capture", "restore"]);
  });

  it("still captures when the page overlay cannot be hidden", async () => {
    const events: string[] = [];
    const cdp = {
      send: vi.fn<Send>(async () => {
        events.push("hide-failed");
        throw new Error("page detached");
      }),
    } as unknown as CdpSession;

    await expect(
      withCursorOverlayHidden(cdp, async () => {
        events.push("capture");
        return "image";
      }),
    ).resolves.toBe("image");

    expect(events).toEqual(["hide-failed", "capture"]);
  });

  it("does not let a stalled hide evaluation block capture", async () => {
    vi.useFakeTimers();
    const cdp = {
      send: vi.fn<Send>(() => new Promise<RuntimeEvaluateResponse>(() => {})),
    } as unknown as CdpSession;
    const capture = vi.fn<() => Promise<string>>().mockResolvedValue("image");

    const result = withCursorOverlayHidden(cdp, capture);
    await vi.advanceTimersByTimeAsync(300);

    await expect(result).resolves.toBe("image");
    expect(capture).toHaveBeenCalledOnce();
  });

  it("does not let a stalled restore evaluation delay the captured result", async () => {
    vi.useFakeTimers();
    let evaluation = 0;
    const cdp = {
      send: vi.fn<Send>(async () => {
        evaluation += 1;
        if (evaluation === 1) {
          return { result: { type: "boolean", value: true } };
        }
        return await new Promise<RuntimeEvaluateResponse>(() => {});
      }),
    } as unknown as CdpSession;

    const result = withCursorOverlayHidden(cdp, async () => "image");
    await vi.advanceTimersByTimeAsync(300);

    await expect(result).resolves.toBe("image");
  });
});

describe("setCursorOverlayVisible", () => {
  it("adds and removes the persistent session visibility style", async () => {
    const expressions: string[] = [];
    const cdp = createCdp([], expressions);

    await setCursorOverlayVisible(cdp, false);
    await setCursorOverlayVisible(cdp, true);

    expect(expressions[0]).toContain("__poracode_session_overlay_hide__");
    expect(expressions[0]).toContain("visibility:hidden");
    expect(expressions[1]).toContain("__poracode_session_overlay_hide__");
    expect(expressions[1]).toContain("?.remove()");
  });
});
