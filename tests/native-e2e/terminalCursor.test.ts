import { afterEach, describe, expect, it } from "vitest";
import { FIXTURE_TERMINAL_ID } from "./harness/labFixtures.ts";
import { openReadySocket, pairAndAuth, startLab } from "./helpers/testClient.ts";

describe("terminal cursor sync through a real socket", () => {
  let harness: Awaited<ReturnType<typeof startLab>> | undefined;

  afterEach(async () => {
    await harness?.stop();
    harness = undefined;
  });

  it("answers terminal-watch with a watch-result and live cursor-sync output", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read", "terminal:read"]);
    const { ws, next } = await openReadySocket(harness, accessToken);
    ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: FIXTURE_TERMINAL_ID,
        cursorSync: { version: 1, watchId: "watch-fixture-001" },
      }),
    );
    expect(await next()).toMatchObject({
      type: "terminal-watch-result",
      id: FIXTURE_TERMINAL_ID,
      cursorSync: {
        version: 1,
        watchId: "watch-fixture-001",
        result: { status: "ready", generation: "instance-fixture-aaa" },
      },
    });
    harness.lab.emit({
      kind: "terminal-output",
      terminalId: FIXTURE_TERMINAL_ID,
      data: "live frame",
    });
    expect(await next()).toMatchObject({
      type: "terminal-output",
      id: FIXTURE_TERMINAL_ID,
      data: "live frame",
      cursorSync: { version: 1, watchId: "watch-fixture-001" },
    });
    ws.send(JSON.stringify({ type: "terminal-unwatch", id: FIXTURE_TERMINAL_ID }));
    ws.send(JSON.stringify({ type: "ping", id: "after-unwatch" }));
    expect(await next()).toMatchObject({ type: "pong", id: "after-unwatch" });
    ws.close();
  });
});
