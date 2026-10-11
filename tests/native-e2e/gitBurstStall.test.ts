import { connect } from "node:net";
import { describe, expect, it } from "vitest";
import { startBlackholeListener } from "./helpers/gitBurstStall.ts";

describe("Git burst black-hole fixture", () => {
  it("closes while an accepted socket is still connected", async () => {
    const blackhole = await startBlackholeListener();
    const url = new URL(blackhole.url);
    const socket = connect(Number(url.port), url.hostname);
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    await blackhole.accepted;
    const socketClosed = new Promise<void>((resolve) => socket.once("close", resolve));

    await expect(blackhole.close()).resolves.toBeUndefined();
    await socketClosed;
    expect(socket.destroyed).toBe(true);
  });
});
