import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readBoundedNodeRequestBody } from "@/shared/http";
import {
  hostControlRequestSchema,
  HOST_CONTROL_PROTOCOL_VERSION,
} from "@/shared/hostControlProtocol";
import { HostOwnerLease } from "./hostOwnerLease";
import { resolveHostRootPaths } from "./hostRootPaths";
import { prepareOwnedHostRoot } from "./hostRootManifest";
import { publishHostControlDiscovery } from "./hostControlDiscovery";
import { callHostControl, HostControlUnsupportedOperationError } from "./hostControlClient";
import { authenticateHostControlRequest, createHostControlResponseProof } from "./hostControlAuth";

const cleanup: Array<() => Promise<void>> = [];

async function fixture(
  handle: (
    request: IncomingMessage,
    response: ServerResponse,
    secret: string,
  ) => void | Promise<void>,
) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-control-client-")));
  const paths = resolveHostRootPaths(join(root, "profile"));
  const owner = HostOwnerLease.acquire(paths, "headless");
  prepareOwnedHostRoot(owner);
  const secret = randomBytes(32).toString("base64url");
  const pending = new Set<Promise<void>>();
  const server = createServer((request, response) => {
    const work = Promise.resolve().then(() => handle(request, response, secret));
    pending.add(work);
    void work.catch(() => response.destroy()).finally(() => pending.delete(work));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing fixture listener.");
  publishHostControlDiscovery(owner, address.port, secret);
  cleanup.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await Promise.allSettled([...pending]);
    owner.release();
    rmSync(root, { recursive: true, force: true });
  });
  return { owner, paths };
}

async function receive(request: IncomingMessage, secret: string) {
  const body = await readBoundedNodeRequestBody(request, 4_096, () => new Error("fixture size"));
  const authorization = request.headers.authorization!;
  expect(
    authenticateHostControlRequest(secret, {
      authorization,
      method: request.method!,
      path: request.url!,
      authority: request.headers.host!,
      body,
    }),
  ).toBe(true);
  expect(authorization).not.toContain(secret);
  return {
    input: hostControlRequestSchema.parse(JSON.parse(body.toString("utf8"))),
    authorization,
  };
}

function replyBytes(input: { requestId: string; ownerGeneration: string }) {
  return Buffer.from(
    JSON.stringify({
      version: HOST_CONTROL_PROTOCOL_VERSION,
      requestId: input.requestId,
      ownerGeneration: input.ownerGeneration,
      ok: true,
      result: { pairingUrl: "https://fixture.example.test/pair#token=fixture" },
    }),
  );
}

afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});

describe("owner control client", () => {
  it("refuses a replacement listener that merely echoes stale discovery correlation", async () => {
    const test = await fixture(async (request, response) => {
      // This listener has no discovery secret. A process that reused the old
      // loopback port can read the request and echo its public correlation IDs.
      const body = await readBoundedNodeRequestBody(
        request,
        4_096,
        () => new Error("fixture size"),
      );
      const input = hostControlRequestSchema.parse(JSON.parse(body.toString("utf8")));
      response.setHeader("content-type", "application/json");
      response.end(replyBytes(input));
    });
    await expect(callHostControl(test.paths, "issue-pairing")).rejects.toThrow(/control/u);
  });

  it("accepts a mutually authenticated response with matching owner correlation", async () => {
    const test = await fixture(async (request, response, secret) => {
      const { input, authorization } = await receive(request, secret);
      const bytes = replyBytes(input);
      response.setHeader(
        "x-poracode-control-proof",
        createHostControlResponseProof(secret, authorization, 200, bytes),
      );
      response.end(bytes);
    });
    await expect(callHostControl(test.paths, "issue-pairing")).resolves.toMatchObject({
      ownerGeneration: test.owner.generation,
      result: { pairingUrl: "https://fixture.example.test/pair#token=fixture" },
    });
  });

  it.each(["body", "status", "secret", "reflection", "generation", "request-id"])(
    "rejects a modified response (%s)",
    async (changed) => {
      const test = await fixture(async (request, response, secret) => {
        const { input, authorization } = await receive(request, secret);
        let bytes = replyBytes({
          requestId: changed === "request-id" ? randomUUID() : input.requestId,
          ownerGeneration: changed === "generation" ? randomUUID() : input.ownerGeneration,
        });
        const proof =
          changed === "reflection"
            ? authorization.split(".").at(-1)!
            : createHostControlResponseProof(
                changed === "secret" ? randomBytes(32).toString("base64url") : secret,
                authorization,
                200,
                bytes,
              );
        if (changed === "body")
          bytes = Buffer.from(
            bytes.toString("utf8").replace("fixture.example.test", "foreign.example.test"),
          );
        response.statusCode = changed === "status" ? 500 : 200;
        response.setHeader("x-poracode-control-proof", proof);
        response.end(bytes);
      });
      await expect(callHostControl(test.paths, "issue-pairing")).rejects.toThrow(/control/u);
    },
  );

  it("rejects a previous call's signed response even when the caller keeps its mutation ID", async () => {
    let saved: { bytes: Buffer; proof: string } | undefined;
    let calls = 0;
    const test = await fixture(async (request, response, secret) => {
      calls++;
      const { input, authorization } = await receive(request, secret);
      saved ??= {
        bytes: replyBytes(input),
        proof: createHostControlResponseProof(secret, authorization, 200, replyBytes(input)),
      };
      response.setHeader("x-poracode-control-proof", saved.proof);
      response.end(saved.bytes);
    });
    const requestId = randomUUID();
    await callHostControl(test.paths, "issue-pairing", { requestId });
    await expect(callHostControl(test.paths, "issue-pairing", { requestId })).rejects.toThrow(
      /control/u,
    );
    expect(calls).toBe(2);
  });

  it("bounds a response before parsing and does not follow redirects", async () => {
    let calls = 0;
    const test = await fixture((_, response) => {
      calls++;
      response.statusCode = 302;
      response.setHeader("location", "http://127.0.0.1:1/control");
      response.end(" ".repeat(20_000));
    });
    await expect(callHostControl(test.paths, "describe")).rejects.toThrow(/control/u);
    expect(calls).toBe(1);
  });

  it("aborts a held response at its deadline without retrying the mutation", async () => {
    let calls = 0;
    const test = await fixture(() => {
      calls++;
    });
    await expect(callHostControl(test.paths, "issue-pairing", { timeoutMs: 30 })).rejects.toThrow(
      "Timed out",
    );
    expect(calls).toBe(1);
  });

  it("cancels a held response when its caller aborts", async () => {
    const entered = Promise.withResolvers<void>();
    const test = await fixture(() => entered.resolve());
    const controller = new AbortController();
    const call = callHostControl(test.paths, "describe", { signal: controller.signal });
    await entered.promise;
    controller.abort();
    await expect(call).rejects.toThrow("cancelled");
  });
});

describe("D4 status and admit client calls", () => {
  const statusResult = (dataRoot: string, profileNamespace: string) => ({
    profileNamespace,
    dataRoot,
    mode: "headless",
    state: "starting",
    admission: "held",
    endpoint: null,
    build: {
      version: "1.8.1",
      sourceRevision: null,
      entrypointSha256: "d".repeat(64),
      root: "/opt/poracode/releases/release-fixture",
      layoutKind: "prefix",
    },
  });

  it("classifies a pre-D4 empty authenticated 400 as an unsupported operation", async () => {
    const test = await fixture((_request, response) => {
      response.statusCode = 400;
      response.end();
    });
    await expect(callHostControl(test.paths, "status")).rejects.toBeInstanceOf(
      HostControlUnsupportedOperationError,
    );
  });

  it("never treats a signed 400 as an unsupported operation", async () => {
    const test = await fixture(async (request, response, secret) => {
      const { authorization } = await receive(request, secret);
      const bytes = Buffer.from("");
      response.statusCode = 400;
      response.setHeader(
        "x-poracode-control-proof",
        createHostControlResponseProof(secret, authorization, 400, bytes),
      );
      response.end(bytes);
    });
    await expect(callHostControl(test.paths, "status")).rejects.toThrow(
      "Invalid or unavailable host control response.",
    );
  });

  it("sends the admit expectation and verifies the signed status reply", async () => {
    let admitted: unknown;
    const test = await fixture(async (request, response, secret) => {
      const { input, authorization } = await receive(request, secret);
      admitted = input;
      const bytes = Buffer.from(
        JSON.stringify({
          version: HOST_CONTROL_PROTOCOL_VERSION,
          requestId: input.requestId,
          ownerGeneration: input.ownerGeneration,
          ok: true,
          result: {
            ...statusResult(test.paths.dataRoot, test.paths.profileNamespace),
            admission: "open",
          },
        }),
      );
      response.setHeader(
        "x-poracode-control-proof",
        createHostControlResponseProof(secret, authorization, 200, bytes),
      );
      response.end(bytes);
    });
    const reply = await callHostControl(test.paths, "admit", {
      payload: { expectedVersion: "1.8.1", expectedEntrypointSha256: "d".repeat(64) },
    });
    expect(admitted).toMatchObject({
      operation: "admit",
      payload: { expectedVersion: "1.8.1", expectedEntrypointSha256: "d".repeat(64) },
    });
    expect(reply.result).toMatchObject({ admission: "open" });
  });

  it("refuses a status reply that describes another profile", async () => {
    const test = await fixture(async (request, response, secret) => {
      const { input, authorization } = await receive(request, secret);
      const bytes = Buffer.from(
        JSON.stringify({
          version: HOST_CONTROL_PROTOCOL_VERSION,
          requestId: input.requestId,
          ownerGeneration: input.ownerGeneration,
          ok: true,
          result: statusResult("/other.host-v1", "/other"),
        }),
      );
      response.setHeader(
        "x-poracode-control-proof",
        createHostControlResponseProof(secret, authorization, 200, bytes),
      );
      response.end(bytes);
    });
    await expect(callHostControl(test.paths, "status")).rejects.toThrow(
      "Invalid or unavailable host control response.",
    );
  });
});
