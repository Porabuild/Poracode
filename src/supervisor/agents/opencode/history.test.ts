import { describe, expect, it, vi } from "vitest";
import type { OpenCodeClient } from "./clientTypes";
import { readOpenCodeMessages, rollbackOpenCodeMessages } from "./history";

function fixture() {
  const list = vi.fn<(...args: unknown[]) => Promise<unknown>>();
  const stage = vi.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
  const commit = vi.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
  return {
    list,
    stage,
    commit,
    client: {
      message: { list },
      session: { revert: { stage, commit } },
    } as unknown as OpenCodeClient,
  };
}
const message = (id: string, type: string, created: number) => ({ id, type, time: { created } });

describe("OpenCode conversation history", () => {
  it("reads every page and orders user turns independently of assistant tool steps", async () => {
    const { client, list, stage, commit } = fixture();
    list
      .mockResolvedValueOnce({
        data: [message("u1", "user", 1), message("a1", "assistant", 2)],
        cursor: { next: "p2" },
      })
      .mockResolvedValueOnce({
        data: [message("a2", "assistant", 3), message("u2", "user", 4)],
        cursor: {},
      });
    await rollbackOpenCodeMessages(client, "s", 1);
    expect(list).toHaveBeenLastCalledWith({ sessionID: "s", cursor: "p2" }, expect.any(Object));
    expect(stage).toHaveBeenCalledWith({ sessionID: "s", messageID: "u2", files: false });
    expect(commit).toHaveBeenCalledWith({ sessionID: "s" });
  });
  it("rejects a repeated cursor rather than looping or returning incomplete history", async () => {
    const { client, list } = fixture();
    list.mockResolvedValue({ data: [], cursor: { next: "repeat" } });
    await expect(readOpenCodeMessages(client, "s")).rejects.toThrow("repeated history cursor");
    expect(list).toHaveBeenCalledTimes(2);
  });
  it("does not commit a failed or out-of-range revert", async () => {
    const { client, list, stage, commit } = fixture();
    list.mockResolvedValue({ data: [message("u", "user", 1)], cursor: {} });
    await expect(rollbackOpenCodeMessages(client, "s", 2)).rejects.toThrow("exceeds");
    stage.mockRejectedValueOnce(new Error("stage failed"));
    await expect(rollbackOpenCodeMessages(client, "s", 1)).rejects.toThrow("stage failed");
    expect(commit).not.toHaveBeenCalled();
  });
});
