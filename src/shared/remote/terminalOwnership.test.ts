import { describe, expect, it, vi } from "vitest";
import { RemoteTerminalOwnership } from "./terminalOwnership";

describe("RemoteTerminalOwnership", () => {
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
