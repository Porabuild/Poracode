import { describe, expect, it } from "vitest";
import { rendererIpcInterests, shouldDispatchRendererIpcEvent } from "./rendererDeliveryPolicy";

const interests = {
  terminalThreadIds: ["terminal-1"],
  runtimeThreadIds: ["runtime-1"],
};

describe("renderer delivery policy", () => {
  it("keeps direct-stream reconnect and replay exclusive from main IPC", () => {
    expect(rendererIpcInterests(true, interests)).toEqual({
      terminalThreadIds: [],
      runtimeThreadIds: [],
    });
    expect(shouldDispatchRendererIpcEvent(true)).toBe(false);
  });

  it("retains IPC as the compatibility path when no direct stream exists", () => {
    expect(rendererIpcInterests(false, interests)).toBe(interests);
    expect(shouldDispatchRendererIpcEvent(false)).toBe(true);
  });
});
