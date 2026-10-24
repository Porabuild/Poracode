import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentVision } from "@/shared/agentVision";
import {
  toggleAgentVisionPictureInPicture,
  isAgentVisionPictureInPicture,
} from "./agentVisionPictureInPicture";

const fixture = vi.hoisted(() => ({
  stop: vi.fn<() => void>(),
  subscribe: vi.fn<(...args: unknown[]) => void>(),
}));
vi.mock("./agentVisionStream", () => ({
  subscribeAgentVisionStream: (...args: unknown[]) => {
    fixture.subscribe(...args);
    return fixture.stop;
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Agent Vision picture-in-picture", () => {
  it("keeps its managed live subscription and releases capture on native close", async () => {
    const ownerId = undefined;
    let element: HTMLVideoElement | null = null;
    const trackStop = vi.fn<() => void>();
    const draw = vi.fn<() => void>();
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: draw,
      clearRect: vi.fn<() => void>(),
    } as unknown as CanvasRenderingContext2D);
    Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", {
      configurable: true,
      value: () => ({ getTracks: () => [{ stop: trackStop }] }),
    });
    Object.defineProperty(HTMLVideoElement.prototype, "requestPictureInPicture", {
      configurable: true,
      value: function (this: HTMLVideoElement) {
        element = this;
        return Promise.resolve({});
      },
    });
    Object.defineProperty(document, "pictureInPictureElement", {
      configurable: true,
      get: () => element,
    });
    Object.defineProperty(document, "exitPictureInPicture", {
      configurable: true,
      value: async () => {
        const video = element;
        element = null;
        video?.dispatchEvent(new Event("leavepictureinpicture"));
      },
    });
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        naturalWidth = 960;
        naturalHeight = 540;
        decode() {
          return Promise.resolve();
        }
      },
    );
    const vision: AgentVision = {
      version: 1,
      streamVersion: 1,
      source: "browser",
      toolName: "wait",
      status: "running",
      updatedAt: 1,
      image: "data:image/jpeg;base64,aGVsbG8=",
    };
    await toggleAgentVisionPictureInPicture(ownerId, "thread", vision);
    expect(isAgentVisionPictureInPicture(ownerId, "thread")).toBe(true);
    expect(fixture.subscribe).toHaveBeenCalledWith(ownerId, "thread", expect.any(Function));
    const onFrame = fixture.subscribe.mock.calls[0]![2] as (frame: AgentVision) => void;
    onFrame({ ...vision, source: "computer" });
    await Promise.resolve();
    expect(draw).toHaveBeenCalledTimes(2);
    await document.exitPictureInPicture();
    expect(isAgentVisionPictureInPicture(ownerId, "thread")).toBe(false);
    expect(fixture.stop).toHaveBeenCalledOnce();
    expect(trackStop).toHaveBeenCalledOnce();
    expect(pause).toHaveBeenCalledOnce();
  });
});
