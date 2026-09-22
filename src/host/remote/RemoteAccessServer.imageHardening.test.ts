import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteAccessServer, type RemoteAccessServerOptions } from "./RemoteAccessServer";

const dbGetThreadRuntimeItemCommitted = vi.fn<(...args: unknown[]) => unknown>();

vi.mock("@/host/db", () => ({
  dbGetThreadRuntimeItemCommitted: (...args: unknown[]) => dbGetThreadRuntimeItemCommitted(...args),
  dbGetThreads: vi.fn<(...args: unknown[]) => unknown>(() => []),
  dbGetThread: vi.fn<(...args: unknown[]) => unknown>(() => null),
  dbGetProject: vi.fn<(...args: unknown[]) => unknown>(() => null),
  dbGetState: vi.fn<(...args: unknown[]) => unknown>(() => null),
  dbSetState: vi.fn<(...args: unknown[]) => unknown>(),
}));

const servers: RemoteAccessServer[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.dispose()));
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  dbGetThreadRuntimeItemCommitted.mockReset();
});

function createServer(): RemoteAccessServer {
  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "1.0.0",
    identity: { desktopId: "desktop-test", label: "Test Desktop" },
    host: "127.0.0.1",
    port: 0,
    callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
  });
  servers.push(server);
  return server;
}

async function issueToken(info: { pairingUrl: string; httpBaseUrl: string }): Promise<string> {
  const credential = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
  expect(credential).toBeTruthy();
  const response = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      scopes: ["session:read"],
      client: { label: "Image hardening", deviceType: "browser" },
    }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x08]);
const SVG_TEXT = `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="4" height="4"/></svg>`;

describe("RemoteAccessServer image response hardening (Gate 6 item 4.4)", () => {
  it("serves /api/files/image with CSP sandbox, nosniff, and a fixed inline filename", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-remote-image-headers-"));
    tempDirs.push(dir);
    writeFileSync(join(dir, "client-controlled name.png"), PNG_BYTES);
    const server = createServer();
    const info = await server.start();
    const token = await issueToken(info);

    const url = new URL("/api/files/image", info.httpBaseUrl);
    url.searchParams.set("path", join(dir, "client-controlled name.png"));
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toBe("sandbox");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    // Inline for rendering, but the filename is host-chosen — never the
    // client-visible host path, never client-controlled text.
    expect(response.headers.get("content-disposition")).toBe('inline; filename="image.png"');
    expect(response.headers.get("cache-control")).toBe("private, max-age=300");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PNG_BYTES);
  });

  it("serves local SVG files as attachment", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-remote-image-headers-"));
    tempDirs.push(dir);
    writeFileSync(join(dir, "vector.svg"), SVG_TEXT);
    const server = createServer();
    const info = await server.start();
    const token = await issueToken(info);

    const url = new URL("/api/files/image", info.httpBaseUrl);
    url.searchParams.set("path", join(dir, "vector.svg"));
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(response.headers.get("content-security-policy")).toBe("sandbox");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="image.svg"');
  });

  it("applies the same hardened headers to runtime image references (SVG attaches)", async () => {
    const server = createServer();
    const info = await server.start();
    const token = await issueToken(info);

    dbGetThreadRuntimeItemCommitted.mockReturnValue({
      id: "item-1",
      payload: { images: [SVG_TEXT] },
    });

    const url = new URL("/api/threads/thread-1/items/item-1/image", info.httpBaseUrl);
    url.searchParams.set("path", JSON.stringify(["images", 0]));
    const svgResponse = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(svgResponse.status).toBe(200);
    expect(svgResponse.headers.get("content-type")).toBe("image/svg+xml");
    expect(svgResponse.headers.get("content-security-policy")).toBe("sandbox");
    expect(svgResponse.headers.get("x-content-type-options")).toBe("nosniff");
    expect(svgResponse.headers.get("content-disposition")).toBe('attachment; filename="image.svg"');

    // A raster image keeps inline disposition with the fixed filename, and the
    // long-lived runtime cache header survives the hardening.
    dbGetThreadRuntimeItemCommitted.mockReturnValue({
      id: "item-1",
      payload: { images: [`data:image/png;base64,${PNG_BYTES.toString("base64")}`] },
    });
    const pngResponse = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(pngResponse.status).toBe(200);
    expect(pngResponse.headers.get("content-type")).toBe("image/png");
    expect(pngResponse.headers.get("content-disposition")).toBe('inline; filename="image.png"');
    expect(pngResponse.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(pngResponse.headers.get("content-security-policy")).toBe("sandbox");
  });
});
