import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { connect, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HOST_CONTROL_MAX_REQUEST_BYTES,
  HOST_CONTROL_PROTOCOL_VERSION,
} from "@/shared/hostControlProtocol";
import { HostControlServer, type HostControlContext } from "./HostControlServer";
import { HostOwnerLease } from "./hostOwnerLease";
import { resolveHostRootPaths } from "./hostRootPaths";
import { prepareOwnedHostRoot } from "./hostRootManifest";
import { readHostControlDiscovery } from "./hostControlDiscovery";
import { createHostControlRequestProof } from "./hostControlAuth";
import { callHostControl } from "./hostControlClient";

const cleanups: Array<() => Promise<void>> = [];

async function fixture(issue?: (context: HostControlContext) => string | Promise<string>) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-control-input-")));
  const paths = resolveHostRootPaths(join(root, "profile"));
  const lease = HostOwnerLease.acquire(paths, "headless");
  prepareOwnedHostRoot(lease);
  const issuePairing = vi.fn<(context: HostControlContext) => string | Promise<string>>(
    issue ?? (() => "https://fixture.test/pair#token=synthetic"),
  );
  const control = new HostControlServer({
    lease,
    issuePairing,
    describe: () => ({
      state: "ready",
      remoteProtocolVersion: 12,
      endpoint: null,
      capabilities: {
        ssh: true,
        browserPanel: false,
        chromeBridge: true,
        computerUse: true,
        nativeSecrets: false,
        portForward: true,
      },
    }),
  });
  const sockets = new Set<Socket>();
  cleanups.push(async () => {
    for (const socket of sockets) socket.destroy();
    await control.dispose();
    lease.release();
    rmSync(root, { recursive: true, force: true });
  });
  await control.start();
  const discovery = readHostControlDiscovery(paths);
  async function openWire() {
    const opened = Promise.withResolvers<void>();
    const closed = Promise.withResolvers<void>();
    const client = connect({ host: "127.0.0.1", port: discovery.transport.port });
    sockets.add(client);
    client.once("connect", () => opened.resolve());
    client.on("error", opened.reject);
    client.once("close", () => {
      sockets.delete(client);
      closed.resolve();
    });
    let response = "";
    client.on("data", (bytes: Buffer) => {
      response = `${response}${bytes.toString("utf8")}`.slice(0, 20_000);
    });
    const timer = setTimeout(() => {
      opened.reject(new Error("Synthetic control connection did not open."));
      client.destroy();
    }, 4_000);
    try {
      await opened.promise;
    } finally {
      clearTimeout(timer);
    }
    return {
      client,
      closed: closed.promise,
      response: () => response,
    };
  }
  function signed(body: Buffer, framing = `Content-Length: ${body.length}`) {
    const authority = `127.0.0.1:${discovery.transport.port}`;
    const proof = createHostControlRequestProof(discovery.token, {
      method: "POST",
      path: "/control",
      authority,
      body,
    });
    return `POST /control HTTP/1.1\r\nHost: ${authority}\r\nAuthorization: ${proof}\r\nContent-Type: application/json\r\n${framing}\r\nConnection: close\r\n\r\n`;
  }
  function makeBody(size?: number) {
    const json = JSON.stringify({
      version: HOST_CONTROL_PROTOCOL_VERSION,
      requestId: randomUUID(),
      ownerGeneration: lease.generation,
      operation: "issue-pairing",
      payload: {},
    });
    return Buffer.from(size ? json.padEnd(size) : json);
  }
  return { paths, control, issuePairing, socket: openWire, signed, body: makeBody };
}

async function within<T>(work: Promise<T>, milliseconds: number): Promise<T> {
  const deadline = Promise.withResolvers<never>();
  const timer = setTimeout(
    () => deadline.reject(new Error("Synthetic control operation exceeded its test deadline.")),
    milliseconds,
  );
  try {
    return await Promise.race([work, deadline.promise]);
  } finally {
    clearTimeout(timer);
  }
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

describe("owner control input admission", () => {
  it("accepts a signed request at the exact byte limit", async () => {
    const test = await fixture();
    const wire = await test.socket();
    const body = test.body(HOST_CONTROL_MAX_REQUEST_BYTES);
    wire.client.end(Buffer.concat([Buffer.from(test.signed(body)), body]));
    await within(wire.closed, 1_000);
    expect(wire.response()).toContain("HTTP/1.1 200");
    expect(test.issuePairing).toHaveBeenCalledOnce();
  });

  it.each(["declared", "chunked"])("refuses an oversized %s body before dispatch", async (kind) => {
    const test = await fixture();
    const wire = await test.socket();
    const body = test.body(HOST_CONTROL_MAX_REQUEST_BYTES + 1);
    if (kind === "declared") wire.client.write(test.signed(body));
    else {
      wire.client.write(test.signed(body, "Transfer-Encoding: chunked"));
      wire.client.write(`${body.length.toString(16)}\r\n`);
      wire.client.write(body);
      wire.client.write("\r\n0\r\n\r\n");
    }
    await within(wire.closed, 1_000);
    expect(wire.response()).not.toContain("HTTP/1.1 200");
    expect(test.issuePairing).not.toHaveBeenCalled();
  });

  it("refuses oversized headers before reading or authenticating the body", async () => {
    const test = await fixture();
    const wire = await test.socket();
    const body = test.body();
    wire.client.write(
      test.signed(body, `Content-Length: ${body.length}\r\nX-Synthetic: ${"x".repeat(4_096)}`),
    );
    await within(wire.closed, 1_000);
    expect(wire.response()).not.toContain("HTTP/1.1 200");
    expect(test.issuePairing).not.toHaveBeenCalled();
  });

  it.each(["headers", "body"])("applies an absolute deadline to dripping %s", async (part) => {
    const test = await fixture();
    const wire = await test.socket();
    const started = performance.now();
    if (part === "headers") wire.client.write("POST /control HTTP/1.1\r\nX-Synthetic: ");
    else wire.client.write(test.signed(test.body(), "Transfer-Encoding: chunked"));
    const drip = setInterval(() => {
      wire.client.write(part === "headers" ? "a" : "1\r\n \r\n");
    }, 100);
    try {
      await within(wire.closed, 3_500);
      expect(performance.now() - started).toBeGreaterThanOrEqual(1_750);
      expect(wire.response()).not.toContain("HTTP/1.1 200");
      expect(test.issuePairing).not.toHaveBeenCalled();
    } finally {
      clearInterval(drip);
    }
  });

  it("refuses a ninth connection and recovers admission after an existing connection closes", async () => {
    const test = await fixture();
    const held: Array<Awaited<ReturnType<typeof test.socket>>> = [];
    for (let index = 0; index < 8; index++) held.push(await test.socket());
    const excess = await test.socket();
    await within(excess.closed, 1_000);
    expect(excess.response()).toBe("");
    held[0]!.client.destroy();
    await held[0]!.closed;
    await expect(callHostControl(test.paths, "describe")).resolves.toMatchObject({
      result: { operations: ["describe", "issue-pairing"] },
    });
    expect(test.issuePairing).not.toHaveBeenCalled();
  });

  it("bounds admitted continuations after their clients disconnect and recovers after their join", async () => {
    const release = Promise.withResolvers<void>();
    const test = await fixture(async (context) => {
      await release.promise;
      context.assertActive();
      return "https://fixture.test/pair#token=late";
    });
    const calls: Array<Promise<unknown>> = [];
    try {
      for (let index = 0; index < 16; index++) {
        const abort = new AbortController();
        const call = callHostControl(test.paths, "issue-pairing", { signal: abort.signal }).catch(
          (error: unknown) => error,
        );
        calls.push(call);
        await vi.waitFor(() => expect(test.issuePairing).toHaveBeenCalledTimes(index + 1));
        abort.abort();
        expect(await call).toBeInstanceOf(Error);
      }
      const excess = await test.socket();
      const body = test.body();
      excess.client.end(Buffer.concat([Buffer.from(test.signed(body)), body]));
      await within(excess.closed, 1_000);
      expect(excess.response()).toContain("HTTP/1.1 503");
      expect(test.issuePairing).toHaveBeenCalledTimes(16);
      release.resolve();
      await vi.waitFor(async () => {
        await expect(callHostControl(test.paths, "describe")).resolves.toMatchObject({
          result: { state: "ready" },
        });
      });
    } finally {
      release.resolve();
      await Promise.allSettled(calls);
    }
  });
});
