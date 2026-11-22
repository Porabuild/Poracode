import { randomBytes } from "node:crypto";
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import {
  computeEtag,
  etagMatches,
  writeCompressedJson,
  writeNegotiatedJson,
} from "./httpCompression";
import { writeHardenedImageResponse } from "./httpResponses";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
});

async function serve(body: string): Promise<string> {
  const server = createServer((req, res) => {
    void writeNegotiatedJson(req, res, 200, body);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/`;
}

/** A body large and redundant enough to compress well. */
const bigBody = JSON.stringify({
  items: Array.from({ length: 400 }, (_, i) => ({
    id: i,
    kind: "assistant_message",
    text: "the quick brown fox",
  })),
});

describe("computeEtag", () => {
  it("is stable for identical bodies and differs for different ones", () => {
    expect(computeEtag("a")).toBe(computeEtag("a"));
    expect(computeEtag("a")).not.toBe(computeEtag("b"));
  });

  it("is quoted so it is a valid HTTP entity-tag", () => {
    expect(computeEtag("a")).toMatch(/^"[A-Za-z0-9_-]+-[A-Za-z0-9_-]+"$/);
  });
});

describe("etagMatches", () => {
  const req = (value: string | undefined) =>
    ({ headers: value === undefined ? {} : { "if-none-match": value } }) as never;

  it("matches an exact tag, a weak tag, a list, and a wildcard", () => {
    expect(etagMatches(req('"abc"'), '"abc"')).toBe(true);
    expect(etagMatches(req('W/"abc"'), '"abc"')).toBe(true);
    expect(etagMatches(req('"other", "abc"'), '"abc"')).toBe(true);
    expect(etagMatches(req("*"), '"abc"')).toBe(true);
  });

  it("does not match a different tag or a missing header", () => {
    expect(etagMatches(req('"other"'), '"abc"')).toBe(false);
    expect(etagMatches(req(undefined), '"abc"')).toBe(false);
  });
});

describe("writeNegotiatedJson", () => {
  it("gzips a large body for a client that accepts it", async () => {
    const url = await serve(bigBody);
    const response = await fetch(url, { headers: { "accept-encoding": "gzip" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(response.headers.get("vary")).toBe("Accept-Encoding, Authorization");
    // `fetch` decodes transparently, so compare against the original body.
    expect(await response.text()).toBe(bigBody);
  });

  it("compresses with brotli when the client prefers br", async () => {
    const url = await serve(bigBody);
    const response = await fetch(url, { headers: { "accept-encoding": "br, gzip" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-encoding")).toBe("br");
    expect(await response.text()).toBe(bigBody);
  });

  it("compresses substantially", async () => {
    const url = await serve(bigBody);
    // `fetch` hides the encoded length, so read the raw socket response.
    const response = await fetch(url, { headers: { "accept-encoding": "gzip" } });
    const encodedLength = Number(response.headers.get("content-length"));
    await response.arrayBuffer();
    expect(encodedLength).toBeGreaterThan(0);
    expect(encodedLength).toBeLessThan(Buffer.byteLength(bigBody) / 3);
  });

  it("sends plain JSON when the client does not accept gzip", async () => {
    const url = await serve(bigBody);
    const response = await fetch(url, { headers: { "accept-encoding": "identity" } });
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(await response.text()).toBe(bigBody);
  });

  it("leaves a small body uncompressed", async () => {
    const url = await serve('{"ok":true}');
    const response = await fetch(url, { headers: { "accept-encoding": "gzip" } });
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(await response.text()).toBe('{"ok":true}');
  });

  it("barely shrinks an inline base64 image, unlike transcript JSON", async () => {
    // Documents why compression alone is not the answer for image payloads.
    // Base64 is not incompressible — it uses only 64 of 256 byte values, so
    // deflate reliably recovers ~25% — but that is nowhere near the >3x it gets
    // on redundant transcript JSON. Images have to leave the payload instead.
    const imageBody = JSON.stringify({ images: [randomBytes(8192).toString("base64")] });
    const url = await serve(imageBody);
    const response = await fetch(url, { headers: { "accept-encoding": "gzip" } });
    const encodedLength = Number(response.headers.get("content-length"));
    await response.arrayBuffer();
    const ratio = Buffer.byteLength(imageBody) / encodedLength;
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeLessThan(1.6);
  });

  it("answers 304 with no body when the client's ETag still matches", async () => {
    const url = await serve(bigBody);
    const first = await fetch(url, { headers: { "accept-encoding": "gzip" } });
    const etag = first.headers.get("etag");
    await first.arrayBuffer();
    expect(etag).toBeTruthy();

    const second = await fetch(url, {
      headers: { "accept-encoding": "gzip", "if-none-match": etag! },
    });
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
  });

  it("returns a fresh 200 once the body changes", async () => {
    const url = await serve(bigBody);
    const first = await fetch(url);
    const etag = first.headers.get("etag");
    await first.arrayBuffer();

    const otherUrl = await serve(`${bigBody} `);
    const second = await fetch(otherUrl, { headers: { "if-none-match": etag! } });
    expect(second.status).toBe(200);
  });

  it("produces a body the standard gzip reader can inflate", async () => {
    const server = createServer((req, res) => {
      void writeNegotiatedJson(req, res, 200, bigBody);
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    // Bypass fetch's transparent decoding to assert real gzip framing.
    const raw = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const request = httpRequest(
        `http://127.0.0.1:${port}/`,
        { headers: { "accept-encoding": "gzip" } },
        (res) => {
          expect(res.headers["content-encoding"]).toBe("gzip");
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => resolve(Buffer.concat(chunks)));
        },
      );
      request.on("error", reject);
      request.end();
    });
    expect(gunzipSync(raw).toString()).toBe(bigBody);
  });

  it("revalidates hardened image responses with ETag and 304", async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const server = createServer((req, res) => {
      writeHardenedImageResponse(res, {
        req,
        contentType: "image/png",
        data: bytes,
        cacheControl: "private, max-age=300",
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/`;

    const first = await fetch(url);
    expect(first.status).toBe(200);
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();
    expect(Buffer.from(await first.arrayBuffer())).toEqual(bytes);

    const second = await fetch(url, { headers: { "if-none-match": etag! } });
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
  });

  it("compresses large JSON RPC bodies with writeCompressedJson without ETag headers", async () => {
    const server = createServer((req, res) => {
      void writeCompressedJson(req, res, 200, bigBody);
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/`, {
      method: "POST",
      headers: { "accept-encoding": "gzip" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(response.headers.get("vary")).toBe("Accept-Encoding");
    expect(response.headers.get("etag")).toBeNull();
    expect(await response.text()).toBe(bigBody);
  });
});
