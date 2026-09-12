import { afterEach, describe, expect, it } from "vitest";
import { createConnection } from "node:net";
import { startLab } from "./helpers/testClient.ts";

function canListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(true));
  });
}

describe("cleanup and port reuse", () => {
  const harnesses: Array<Awaited<ReturnType<typeof startLab>>> = [];

  afterEach(async () => {
    while (harnesses.length > 0) {
      await harnesses.pop()?.stop();
    }
  });

  it("releases host and control ports so a second lab can bind them", async () => {
    const first = await startLab();
    harnesses.push(first);
    const hostPort = first.hostPort;
    const controlPort = first.controlPort;
    expect(hostPort).toBeGreaterThan(0);
    expect(controlPort).toBeGreaterThan(0);
    await first.stop();
    harnesses.pop();

    await expect.poll(() => canListen(hostPort), { timeout: 3_000 }).toBe(true);
    await expect.poll(() => canListen(controlPort), { timeout: 3_000 }).toBe(true);

    const second = await startLab();
    harnesses.push(second);
    expect(second.hostPort).toBeGreaterThan(0);
    expect(second.controlPort).toBeGreaterThan(0);
    const env = await fetch(new URL("/.well-known/poracode/environment", second.httpBaseUrl));
    expect(env.status).toBe(200);
  });
});
