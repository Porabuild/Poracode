import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { resolveRefToSelector } from "./pageDriver";

describe("page driver installation and references", () => {
  it("replaces the previous unversioned driver and executes in one browser round trip", async () => {
    const oldResolve = vi.fn<() => string>(() => "#wrong");
    const window = {
      __poracodeBrowserDriver: { resolveRefToSelector: oldResolve },
      __lcRefs: new Map([["@e1", { id: "target", isConnected: true }]]),
    };
    const executeJavaScript = vi.fn<(script: string) => Promise<unknown>>(async (script: string) =>
      runInNewContext(script, { window, CSS: { escape: (id: string) => id } }),
    );
    expect(await resolveRefToSelector({ executeJavaScript }, "@e1")).toBe("#target");
    expect(executeJavaScript).toHaveBeenCalledOnce();
    expect(oldResolve).not.toHaveBeenCalled();
  });

  it("rejects a detached target even when its id can be reused by a replacement", async () => {
    const window = { __lcRefs: new Map([["@e1", { id: "target", isConnected: false }]]) };
    const executeJavaScript = async (script: string) => runInNewContext(script, { window });
    expect(await resolveRefToSelector({ executeJavaScript }, "@e1")).toBeNull();
  });
});
