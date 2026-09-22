import { describe, expect, it, vi } from "vitest";
import {
  parseDesktopLoopbackFrame,
  routeDesktopLoopbackFrame,
  validateDesktopLoopbackFrame,
  type DesktopLoopbackFramePorts,
} from "./desktopLoopbackFrames";

describe("private desktop loopback frame vocabulary (A3)", () => {
  it("validates an already parsed value for the worker path", () => {
    expect(
      validateDesktopLoopbackFrame({
        type: "event",
        seq: 2,
        event: { type: "git-changed", projectId: "p" },
      }),
    ).toEqual({
      kind: "event",
      seq: 2,
      space: "loopback",
      event: { type: "git-changed", projectId: "p" },
    });
    expect(
      validateDesktopLoopbackFrame({
        type: "desktop-event",
        seq: 3,
        event: { type: "provider-usage-all", snapshots: [] },
      }),
    ).toEqual({
      kind: "event",
      seq: 3,
      space: "ipc",
      event: { type: "provider-usage-all", snapshots: [] },
    });
  });

  it("defaults the space per stream and rejects unknown spaces", () => {
    const event = validateDesktopLoopbackFrame({
      type: "event",
      seq: 1,
      event: { type: "noop" },
    });
    expect(event.kind === "event" && event.space).toBe("loopback");
    expect(
      validateDesktopLoopbackFrame({
        type: "event",
        seq: 1,
        space: "loopback",
        event: { type: "noop" },
      }),
    ).toMatchObject({ kind: "event", space: "loopback" });
    expect(
      validateDesktopLoopbackFrame({
        type: "event",
        seq: 1,
        space: "carrier-pigeon",
        event: { type: "noop" },
      }),
    ).toEqual({ kind: "invalid" });
  });

  it("rejects malformed envelopes, cursors and payloads", () => {
    expect(validateDesktopLoopbackFrame(null)).toEqual({ kind: "invalid" });
    expect(validateDesktopLoopbackFrame([])).toEqual({ kind: "invalid" });
    expect(validateDesktopLoopbackFrame({ type: "event", event: null })).toEqual({
      kind: "invalid",
    });
    expect(validateDesktopLoopbackFrame({ type: "event", event: [] })).toEqual({
      kind: "invalid",
    });
    expect(validateDesktopLoopbackFrame({ type: "event", event: {} })).toEqual({
      kind: "invalid",
    });
    expect(
      validateDesktopLoopbackFrame({ type: "event", seq: 0, event: { type: "noop" } }),
    ).toEqual({ kind: "invalid" });
    expect(
      validateDesktopLoopbackFrame({ type: "event", seq: "2", event: { type: "noop" } }),
    ).toEqual({ kind: "invalid" });
    expect(validateDesktopLoopbackFrame({ type: "unknown" })).toEqual({ kind: "invalid" });
    expect(parseDesktopLoopbackFrame("{")).toEqual({ kind: "invalid" });
  });

  it("accepts the private terminal frames and routes them as server frames", () => {
    for (const type of [
      "terminal-output",
      "terminal-watch-result",
      "terminal-watch-baseline-chunk",
    ]) {
      const frame = validateDesktopLoopbackFrame({ type, id: "t1" });
      expect(frame.kind).toBe("terminal");
    }
    const onServerFrame = vi.fn<(message: unknown) => boolean>(() => true);
    const ports: DesktopLoopbackFramePorts = {
      dispatch: vi.fn<DesktopLoopbackFramePorts["dispatch"]>(),
      requestRebuild: vi.fn<() => void>(),
      onServerFrame,
      onPong: vi.fn<(id: string | undefined) => void>(),
    };
    routeDesktopLoopbackFrame(
      validateDesktopLoopbackFrame({ type: "terminal-output", id: "t1", data: "x" }),
      ports,
    );
    expect(onServerFrame).toHaveBeenCalledWith({ type: "terminal-output", id: "t1", data: "x" });
  });

  it("routes pong, rebuild and events to their ports and ignores invalid", () => {
    const dispatch = vi.fn<DesktopLoopbackFramePorts["dispatch"]>();
    const requestRebuild = vi.fn<() => void>();
    const onPong = vi.fn<(id: string | undefined) => void>();
    const onResyncRequired = vi.fn<() => void>();
    const ports: DesktopLoopbackFramePorts = { dispatch, requestRebuild, onPong, onResyncRequired };

    routeDesktopLoopbackFrame(validateDesktopLoopbackFrame({ type: "pong", id: "9" }), ports);
    expect(onPong).toHaveBeenCalledWith("9");
    routeDesktopLoopbackFrame(validateDesktopLoopbackFrame({ type: "resync-required" }), ports);
    expect(requestRebuild).toHaveBeenCalledOnce();
    // A resync may hide catalog membership/order changes: the wiring's bounded
    // catalog recovery is told on the same frame (rows-only reconciliation
    // must not wait out the reconcile interval).
    expect(onResyncRequired).toHaveBeenCalledOnce();
    routeDesktopLoopbackFrame(
      validateDesktopLoopbackFrame({ type: "event", seq: 5, event: { type: "noop" } }),
      ports,
    );
    routeDesktopLoopbackFrame({ kind: "invalid" }, ports);
    routeDesktopLoopbackFrame({ kind: "ready" }, ports);
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: "noop" }, 5, "loopback");
    expect(onResyncRequired).toHaveBeenCalledOnce();
  });
});
