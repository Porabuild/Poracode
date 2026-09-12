import { afterEach, describe, expect, it } from "vitest";
import { pairingTokenFromUrl } from "./harness/wireLab.ts";
import {
  controlRequest,
  exchangeToken,
  issueTicket,
  openBufferedSocket,
  openReadySocket,
  openSocket,
  pairAndAuth,
  readWsMessage,
  startLab,
} from "./helpers/testClient.ts";

describe("fault timing and cancellation", () => {
  let harness: Awaited<ReturnType<typeof startLab>> | undefined;

  afterEach(async () => {
    await harness?.stop();
    harness = undefined;
  });

  it("delays token exchange by the configured amount", async () => {
    harness = await startLab();
    const credential = pairingTokenFromUrl(harness.lab.issuePairingUrl().pairingUrl);
    harness.lab.setFault({ kind: "delay-token", delayMs: 80 });
    const started = Date.now();
    const result = await exchangeToken(harness.httpBaseUrl, credential, ["session:read"]);
    expect(result.status).toBe(200);
    expect(Date.now() - started).toBeGreaterThanOrEqual(70);
  });

  it("cancels a ticket request before a complete response", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read"]);
    harness.lab.setFault({ kind: "cancel-ticket" });
    await expect(issueTicket(harness.httpBaseUrl, accessToken)).rejects.toThrow(
      /fetch|network|socket|ECONNRESET|abort/i,
    );
  });

  it("injects 401, 403, and redirect on the token route", async () => {
    harness = await startLab();
    const credential = pairingTokenFromUrl(harness.lab.issuePairingUrl().pairingUrl);
    harness.lab.setFault({ kind: "unauthorized", routeId: "token-exchange" });
    expect((await exchangeToken(harness.httpBaseUrl, credential, ["session:read"])).status).toBe(
      401,
    );

    harness.lab.clearFault();
    harness.lab.setFault({ kind: "forbidden", routeId: "token-exchange" });
    const next = pairingTokenFromUrl(harness.lab.issuePairingUrl().pairingUrl);
    expect((await exchangeToken(harness.httpBaseUrl, next, ["session:read"])).status).toBe(403);

    harness.lab.clearFault();
    harness.lab.setFault({ kind: "redirect", routeId: "token-exchange", location: "/elsewhere" });
    const redirected = await fetch(new URL("/oauth/token", harness.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grantType: "pairing-token", credential: "x" }),
      redirect: "manual",
    });
    expect(redirected.status).toBe(302);
    expect(redirected.headers.get("location")).toBe("/elsewhere");
  });

  it("closes the socket before ready when asked", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read"]);
    const ticket = await issueTicket(harness.httpBaseUrl, accessToken);
    harness.lab.setFault({ kind: "socket-pre-ready-close" });
    const ws = openSocket(harness.wsBaseUrl, ticket.ticket);
    const closeCode = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("socket did not close")), 3_000);
      ws.once("close", (code) => {
        clearTimeout(timer);
        resolve(code);
      });
      ws.once("error", () => {
        // close still follows
      });
    });
    expect(closeCode).toBeGreaterThanOrEqual(1000);
  });

  it("closes with 1008 after ready when session expiry is injected", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read"]);
    harness.lab.setFault({ kind: "close-1008" });
    const ticket = await issueTicket(harness.httpBaseUrl, accessToken);
    const socket = openBufferedSocket(harness.wsBaseUrl, ticket.ticket);
    const closed = new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("missing 1008 close")), 3_000);
      socket.ws.once("close", (closeCode) => {
        clearTimeout(timer);
        resolve(closeCode);
      });
    });
    expect(await socket.next()).toMatchObject({ type: "ready" });
    expect(await closed).toBe(1008);
  });

  it("emits malformed and unknown envelopes via the control plane", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read"]);
    const { ws, next } = await openReadySocket(harness, accessToken);
    const malformed = await controlRequest(harness, "/v1/frames/malformed", {
      method: "POST",
    });
    expect(malformed.status).toBe(200);
    expect(await next()).toBe("{not-json");

    const unknown = await controlRequest(harness, "/v1/frames/unknown", {
      method: "POST",
    });
    expect(unknown.status).toBe(200);
    expect(await next()).toMatchObject({ type: "lab-unknown-envelope" });
    ws.close();
  });

  it("opens a reconnect-race window before ready", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read"]);
    const ticket = await issueTicket(harness.httpBaseUrl, accessToken);
    harness.lab.setFault({ kind: "reconnect-race", delayMs: 40 });
    const started = Date.now();
    const ws = openSocket(harness.wsBaseUrl, ticket.ticket);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    expect(await readWsMessage(ws)).toMatchObject({ type: "ready" });
    expect(Date.now() - started).toBeGreaterThanOrEqual(30);
    ws.close();
  });

  it("injects an oversized body, 401, 403, and redirect through named fixtures", async () => {
    harness = await startLab();
    harness.lab.activateFaultFixture("oversized-body-token");
    const oversized = await fetch(new URL("/oauth/token", harness.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grantType: "pairing-token", credential: "x" }),
    });
    expect(oversized.status).toBe(200);
    expect(Number(oversized.headers.get("content-length"))).toBeGreaterThan(1024 * 1024);
    expect((await oversized.text()).length).toBeGreaterThan(1024 * 1024);

    harness.lab.activateFaultFixture("clear");
    harness.lab.activateFaultFixture("unauthorized-token");
    expect(
      (
        await fetch(new URL("/oauth/token", harness.httpBaseUrl), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ grantType: "pairing-token", credential: "x" }),
        })
      ).status,
    ).toBe(401);

    harness.lab.activateFaultFixture("clear");
    harness.lab.activateFaultFixture("forbidden-token");
    expect(
      (
        await fetch(new URL("/oauth/token", harness.httpBaseUrl), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ grantType: "pairing-token", credential: "x" }),
        })
      ).status,
    ).toBe(403);

    harness.lab.activateFaultFixture("clear");
    harness.lab.activateFaultFixture("redirect-token");
    const redirected = await fetch(new URL("/oauth/token", harness.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grantType: "pairing-token", credential: "x" }),
      redirect: "manual",
    });
    expect(redirected.status).toBe(302);
    expect(redirected.headers.get("location")).toBe("/elsewhere");
  });
});
