import { afterEach, describe, expect, it } from "vitest";
import {
  issueTicket,
  openSocket,
  pairAndAuth,
  readWsMessage,
  startLab,
} from "./helpers/testClient.ts";

describe("websocket ticket single-use", () => {
  let harness: Awaited<ReturnType<typeof startLab>> | undefined;

  afterEach(async () => {
    await harness?.stop();
    harness = undefined;
  });

  it("consumes a ticket on connect and rejects reuse", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read"]);
    const issued = await issueTicket(harness.httpBaseUrl, accessToken);
    expect(issued.status).toBe(200);
    expect(issued.ticket.startsWith("lc_ws_")).toBe(true);

    const first = openSocket(harness.wsBaseUrl, issued.ticket);
    await new Promise<void>((resolve, reject) => {
      first.once("open", () => resolve());
      first.once("error", reject);
    });
    expect(await readWsMessage(first)).toMatchObject({ type: "ready", seq: 0 });
    first.close();

    const reuseStatus = await new Promise<number>((resolve, reject) => {
      const second = openSocket(harness!.wsBaseUrl, issued.ticket);
      const timer = setTimeout(() => reject(new Error("ticket reuse did not fail")), 3_000);
      second.once("unexpected-response", (_req, response) => {
        clearTimeout(timer);
        resolve(response.statusCode ?? 0);
        second.terminate();
      });
      second.once("open", () => {
        clearTimeout(timer);
        second.close();
        reject(new Error("reused ticket opened a socket"));
      });
      second.once("error", () => {
        // unexpected-response also emits error; ignore if already resolved
      });
    });
    expect(reuseStatus).toBe(401);
  });

  it("rejects an expired or consumed ticket", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read"]);
    const issued = await issueTicket(harness.httpBaseUrl, accessToken);
    expect(issued.status).toBe(200);
    harness.lab.applyCheckpoint("expire-tickets");
    const reuseStatus = await new Promise<number>((resolve, reject) => {
      const socket = openSocket(harness!.wsBaseUrl, issued.ticket);
      const timer = setTimeout(() => reject(new Error("expired ticket did not fail")), 3_000);
      socket.once("unexpected-response", (_req, response) => {
        clearTimeout(timer);
        resolve(response.statusCode ?? 0);
        socket.terminate();
      });
      socket.once("open", () => {
        clearTimeout(timer);
        socket.close();
        reject(new Error("expired ticket opened a socket"));
      });
      socket.once("error", () => undefined);
    });
    expect(reuseStatus).toBe(401);
  });

  it("requires session:read to mint a ticket", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["projects:manage"]);
    const issued = await issueTicket(harness.httpBaseUrl, accessToken);
    expect(issued.status).toBe(403);
  });
});
