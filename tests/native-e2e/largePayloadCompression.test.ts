import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findRepoRoot, detectHeadlessServerEntrypoint } from "./harness/paths.ts";
import { ProcessCleanup } from "./harness/processCleanup.ts";
import { startRealHost, type RealHostHandle } from "./harness/realHost.ts";
import { ConstrainedTcpProxy } from "./helpers/constrainedTcpProxy.ts";
import { HostLoadSampler } from "./helpers/hostLoadSampler.ts";
import { acquireDeviceCredential, allocateLoopbackPort } from "./helpers/profileClientFactory.ts";

const repoRoot = findRepoRoot();
const entrypoint = detectHeadlessServerEntrypoint(repoRoot);
const evidenceDir = join(repoRoot, "tmp/v2-production-review/large-payload");
const THREAD_COUNT = 256;
const ITEM_COUNT = 120;
const HISTORY_THREAD = "payload-thread-0";
const profiles = [
  { rttMs: 150, bitsPerSecond: 1_000_000 },
  { rttMs: 600, bitsPerSecond: 128_000 },
  { rttMs: 1_500, bitsPerSecond: 32_000 },
] as const;

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

function itemText(item: number): string {
  return Array.from(
    { length: 20 },
    (_, line) =>
      `Review ${item}, source src/features/module-${item}/action-${line}.ts: ` +
      `preserve request ordering and Unicode 漢字🌐; checksum ${sha256(`${item}:${line}`)}\n`,
  ).join("");
}

/** Seed only this disposable database. Reads still use the real authenticated
 * production routes; this fixture does not claim provider execution/write-path coverage. */
function seedPayloads(baseDir: string): void {
  const db = new DatabaseSync(join(baseDir, "state.sqlite"));
  try {
    const project = db.prepare("SELECT id FROM projects WHERE name = ?").get("native-e2e-fixture");
    if (!project) throw new Error("Missing owned project fixture");
    const insertThread = db.prepare(
      "INSERT INTO threads (id, project_id, title, agent_kind, config, status, attention, " +
        "presentation_mode, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const insertItem = db.prepare(
      "INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload, streams) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    db.exec("BEGIN");
    for (let index = 0; index < THREAD_COUNT; index++) {
      insertThread.run(
        `payload-thread-${index}`,
        project.id!,
        `Review module ${index}: reconnect, concurrency and Unicode 漢字🌐 ${sha256(String(index)).slice(0, 16)}`,
        "codex",
        JSON.stringify({ model: "fixture-model", effort: "medium", mode: "agent" }),
        "inactive",
        "none",
        "gui",
        index,
        "2026-09-08T00:00:00.000Z",
        "2026-09-08T00:00:00.000Z",
      );
    }
    for (let index = 0; index < ITEM_COUNT; index++) {
      insertItem.run(
        HISTORY_THREAD,
        `payload-item-${index}`,
        index,
        "assistant_message",
        "completed",
        "{}",
        JSON.stringify({ text: itemText(index) }),
      );
    }
    db.exec("COMMIT");
  } finally {
    db.close();
  }
}

async function readRaw(url: string, token: string, encoding: string, etag?: string) {
  const started = performance.now();
  return new Promise<{
    status: number;
    body: Buffer;
    decoded: Buffer;
    elapsedMs: number;
    encoding: string | undefined;
    etag: string | undefined;
  }>((resolve, reject) => {
    const req = request(
      url,
      {
        headers: {
          authorization: `Bearer ${token}`,
          "accept-encoding": encoding,
          connection: "close",
          ...(etag ? { "if-none-match": etag } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("error", reject);
        res.on("end", () => {
          try {
            const body = Buffer.concat(chunks);
            resolve({
              status: res.statusCode ?? 0,
              body,
              decoded: res.headers["content-encoding"] === "gzip" ? gunzipSync(body) : body,
              elapsedMs: performance.now() - started,
              encoding: res.headers["content-encoding"],
              etag: res.headers.etag,
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.setTimeout(240_000, () => req.destroy(new Error("Payload read timed out")));
    req.on("error", reject);
    req.end();
  });
}

describe.skipIf(!entrypoint)(
  "large persisted payloads over the production remote HTTP routes",
  () => {
    let host: RealHostHandle;
    let accessToken: string;
    const cleanup = new ProcessCleanup();
    const sampler = new HostLoadSampler();
    const measurements: unknown[] = [];

    beforeAll(async () => {
      mkdirSync(evidenceDir, { recursive: true });
      host = await startRealHost({
        port: await allocateLoopbackPort(),
        repoRoot,
        cleanup,
        baseDirRoot: join(repoRoot, "tmp/.tmp/large-payload"),
      });
      assert(!host.blockers.some((item) => item.code === "pair-json-unavailable"));
      ({ accessToken } = await acquireDeviceCredential(host, "large-payload"));
      seedPayloads(host.baseDir);
      writeFileSync(
        join(evidenceDir, "artifact.json"),
        JSON.stringify(
          {
            serverSha256: sha256(readFileSync(host.entrypoint)),
            node: process.version,
            threadCount: THREAD_COUNT,
            runtimeItemCount: ITEM_COUNT,
            runtimeTextBytes: Array.from({ length: ITEM_COUNT }, (_, i) =>
              Buffer.byteLength(itemText(i)),
            ).reduce((a, b) => a + b, 0),
            fixture:
              "Disposable persisted rows; no provider launch. Actual authenticated production read routes.",
          },
          null,
          2,
        ),
      );
      sampler.start();
    }, 120_000);

    afterAll(async () => {
      sampler.stop();
      writeFileSync(
        join(evidenceDir, "measurements.json"),
        JSON.stringify(
          {
            measurements,
            hostLoad: sampler.summary(),
            samples: sampler.allSamples(),
            accounting:
              "Body bytes are raw HTTP entity bytes before content decoding; proxy bytes also include HTTP headers, exclude TCP/IP. Each direction is paced per connection; no loss or shared aggregate bandwidth model.",
          },
          null,
          2,
        ),
      );
      await host?.stop();
      await cleanup.shutdown();
    }, 30_000);

    for (const profile of profiles) {
      it(`preserves snapshot/history with gzip and conditional reads at ${profile.bitsPerSecond}bps`, async () => {
        const proxy = await ConstrainedTcpProxy.start({
          label: `payload-${profile.bitsPerSecond}`,
          upstreamHost: "127.0.0.1",
          upstreamPort: host.hostPort,
          oneWayDelayMs: profile.rttMs / 2,
          bytesPerSecond: profile.bitsPerSecond / 8,
        });
        try {
          for (const route of [
            "/api/snapshot",
            `/api/threads/${HISTORY_THREAD}/history/items?limit=500`,
          ]) {
            const from = Date.now();
            const before = proxy.stats();
            const url = `http://127.0.0.1:${proxy.port}${route}`;
            const identity = await readRaw(url, accessToken, "identity");
            const afterIdentity = proxy.stats();
            const compressed = await readRaw(url, accessToken, "gzip");
            const afterCompressed = proxy.stats();
            expect(identity.status).toBe(200);
            expect(compressed.status).toBe(200);
            expect(identity.encoding).toBeUndefined();
            expect(compressed.encoding).toBe("gzip");
            const plain = JSON.parse(identity.decoded.toString());
            const inflated = JSON.parse(compressed.decoded.toString());
            if (route === "/api/snapshot") {
              assert.equal(inflated.threads.length, THREAD_COUNT);
              assert.deepEqual(inflated.threads, plain.threads);
              assert.deepEqual(inflated.runtimeSummariesByThread, plain.runtimeSummariesByThread);
            } else {
              assert(compressed.decoded.equals(identity.decoded));
              assert.equal(inflated.items.length, ITEM_COUNT);
              assert.deepEqual(
                inflated.items.map((item: { streams: { text: string } }) => item.streams.text),
                Array.from({ length: ITEM_COUNT }, (_, i) => itemText(i)),
              );
            }
            expect(compressed.etag).toBeTruthy();
            const cached = await readRaw(url, accessToken, "gzip", compressed.etag);
            const afterCached = proxy.stats();
            // Snapshot sequence may change on unrelated live events; history page is stable.
            if (route !== "/api/snapshot") assert.equal(cached.status, 304);
            else assert([200, 304].includes(cached.status));
            if (cached.status === 304) assert.equal(cached.body.length, 0);
            const measurement = {
              profile,
              route,
              identityBytes: identity.body.length,
              gzipBytes: compressed.body.length,
              gzipDecodedBytes: compressed.decoded.length,
              decodedSha256: sha256(compressed.decoded),
              wholeBodyIdentical: compressed.decoded.equals(identity.decoded),
              identityMs: identity.elapsedMs,
              gzipMs: compressed.elapsedMs,
              conditionalStatus: cached.status,
              conditionalMs: cached.elapsedMs,
              identityWireBytes:
                afterIdentity.serverToClient.bytesForwarded - before.serverToClient.bytesForwarded,
              gzipWireBytes:
                afterCompressed.serverToClient.bytesForwarded -
                afterIdentity.serverToClient.bytesForwarded,
              conditionalWireBytes:
                afterCached.serverToClient.bytesForwarded -
                afterCompressed.serverToClient.bytesForwarded,
              hostLoad: sampler.window(from, Date.now()),
            };
            measurements.push(measurement);
            writeFileSync(
              join(evidenceDir, `progress-${profile.bitsPerSecond}.json`),
              JSON.stringify(measurements, null, 2),
            );
            console.log(
              `[payload] ${profile.bitsPerSecond}bps ${route}: ${identity.body.length} → ${compressed.body.length} bytes; conditional ${cached.status}`,
            );
          }
        } finally {
          await proxy.close();
        }
      }, 240_000);
    }
  },
);
