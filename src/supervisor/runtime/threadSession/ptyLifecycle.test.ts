import { describe, expect, it, vi } from "vitest";
import type { IPty } from "node-pty";
import type { SessionRuntime } from "../sessionTypes";
import { PtyLifecycle } from "./ptyLifecycle";

function runtimeWithResize(resize: IPty["resize"]): SessionRuntime {
  return {
    pty: { resize } as IPty,
    ptyExited: false,
  } as SessionRuntime;
}

describe("PtyLifecycle.resize", () => {
  it.each(["Cannot resize a pty that has already exited", "ioctl(2) failed, ENOTTY"])(
    "treats the node-pty exit race as an expected outcome: %s",
    (message) => {
      const lifecycle = new PtyLifecycle();
      const session = runtimeWithResize(() => {
        throw new Error(message);
      });

      expect(() => lifecycle.resize(session, 120, 40)).not.toThrow();
      expect(session.ptyExited).toBe(true);
    },
  );

  it("does not call native resize after lifecycle teardown", () => {
    const resize = vi.fn<IPty["resize"]>();
    const lifecycle = new PtyLifecycle();
    const session = runtimeWithResize(resize);
    session.ignoreExit = true;

    lifecycle.resize(session, 120, 40);

    expect(resize).not.toHaveBeenCalled();
  });

  it("propagates unrelated native resize failures", () => {
    const lifecycle = new PtyLifecycle();
    const session = runtimeWithResize(() => {
      throw new Error("native resize invariant failed");
    });

    expect(() => lifecycle.resize(session, 120, 40)).toThrow("native resize invariant failed");
    expect(session.ptyExited).toBe(false);
  });
});
