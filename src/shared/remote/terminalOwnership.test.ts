import { describe, expect, it, vi } from "vitest";
import { RemoteTerminalOwnership } from "./terminalOwnership";

describe("RemoteTerminalOwnership", () => {
  it.each(["desktop-1", "desktop-2"])(
    "keeps a newer start owned by %s when an older start fails",
    async (nextOwner) => {
      const ownership = new RemoteTerminalOwnership<string>();
      const pending = Promise.withResolvers<void>();
      const oldStart = ownership.start("shell-1", "desktop-1", () => pending.promise);
      await ownership.start("shell-1", nextOwner, async () => undefined);
      pending.reject(new Error("old start failed"));
      await expect(oldStart).rejects.toThrow("old start failed");
      expect(ownership.owner("shell-1")).toBe(nextOwner);
    },
  );

  it("keeps a newer same-host start when an older close completes", async () => {
    const ownership = new RemoteTerminalOwnership<string>();
    await ownership.start("shell-1", "desktop-1", async () => undefined);
    const pending = Promise.withResolvers<void>();
    const closing = ownership.close("shell-1", () => pending.promise);
    await ownership.start("shell-1", "desktop-1", async () => undefined);
    pending.resolve();
    await closing;
    expect(ownership.owner("shell-1")).toBe("desktop-1");
  });

  it("registers before start and rolls back a failed start", async () => {
    const ownership = new RemoteTerminalOwnership<string>();
    const start = vi.fn<() => Promise<void>>(async () => {
      expect(ownership.owner("shell-1")).toBe("desktop-1");
      throw new Error("offline");
    });

    await expect(ownership.start("shell-1", "desktop-1", start)).rejects.toThrow("offline");
    expect(ownership.owner("shell-1")).toBeUndefined();
  });

  it("retains ownership after a failed close and releases it after success", async () => {
    const ownership = new RemoteTerminalOwnership<string>();
    await ownership.start("shell-1", "desktop-1", async () => undefined);
    const close = vi
      .fn<(owner: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);

    await expect(ownership.close("shell-1", close)).rejects.toThrow("offline");
    expect(ownership.owner("shell-1")).toBe("desktop-1");
    await expect(ownership.close("shell-1", close)).resolves.toEqual({
      routed: true,
      result: undefined,
    });
    expect(ownership.owner("shell-1")).toBeUndefined();
  });
});
