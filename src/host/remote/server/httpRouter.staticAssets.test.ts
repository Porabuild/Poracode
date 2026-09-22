import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { RemoteAccessServer, type RemoteAccessServerOptions } from "../RemoteAccessServer";

/**
 * Route-precedence and deep-link-refresh coverage for the bundled web client
 * (plan D2) against a real HTTP listener: the bundled build must win over the
 * pairing-page fallbacks, the SPA fallback must answer navigations only, and
 * API/auth/static traffic must never be swallowed by it.
 *
 * The install-layout root is redirected to a temp fixture through the module
 * seam, so no test writes into the repository tree.
 */

let bundledRoot = "";

vi.mock("../bundledWebClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../bundledWebClient")>();
  return { ...actual, resolveBundledWebClientDir: () => bundledRoot };
});

vi.mock("@/host/db", () => ({
  addRuntimePersistenceHealthListener: vi.fn<(...args: unknown[]) => () => void>(() => () => {}),
  dbApplyThreadRuntimeEvents: vi.fn<(...args: unknown[]) => void>(),
  dbGetThreadRuntimeItem: vi.fn<(...args: unknown[]) => unknown>(() => null),
  dbGetThreads: vi.fn<(...args: unknown[]) => unknown[]>(() => []),
  dbGetThread: vi.fn<(...args: unknown[]) => unknown>(() => null),
  dbGetProject: vi.fn<(...args: unknown[]) => unknown>(() => null),
  dbGetState: vi.fn<(...args: unknown[]) => unknown>(() => null),
  dbReplaceThreadRuntimeSnapshot: vi.fn<(...args: unknown[]) => void>(),
  dbSetState: vi.fn<(...args: unknown[]) => void>(),
  runRuntimeControlWrite: vi.fn<(...args: unknown[]) => { ok: boolean }>(() => ({ ok: true })),
}));

const INDEX_MARKER = "BUNDLED-INDEX-MARKER";
const WORKER_MARKER = "BUNDLED-WORKER-MARKER";
const MANIFEST_MARKER = "Bundled manifest";

const servers: RemoteAccessServer[] = [];
let fixtureRoot = "";
let templateRoot = "";
let missingRoot = "";

beforeAll(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), "poracode-router-web-"));
  templateRoot = mkdtempSync(join(tmpdir(), "poracode-router-template-"));
  missingRoot = join(tmpdir(), "poracode-router-web-missing");
  mkdirSync(join(fixtureRoot, "assets"));
  mkdirSync(join(fixtureRoot, "poracode-ssh-runtime"));
  writeFileSync(join(fixtureRoot, "index.html"), `<!doctype html><title>${INDEX_MARKER}</title>`);
  writeFileSync(
    join(fixtureRoot, "manifest.webmanifest"),
    `{"name":"${MANIFEST_MARKER}","start_url":"/"}`,
  );
  writeFileSync(join(fixtureRoot, "service-worker.js"), `const ${WORKER_MARKER} = true;`);
  writeFileSync(join(fixtureRoot, "app-icon.svg"), '<svg id="bundled-icon"></svg>');
  writeFileSync(join(fixtureRoot, "notification.mp3"), Buffer.from("bundled-audio"));
  writeFileSync(join(fixtureRoot, "assets/app-abc123.js"), 'console.log("bundled-asset");');
  writeFileSync(join(fixtureRoot, "poracode-ssh-runtime/manifest.json"), '{"archive":"bundled"}');
  writeFileSync(join(fixtureRoot, "poracode-ssh-runtime/runtime.bin"), Buffer.from("bundled-bin"));
  // The desktop/checkout renderer build ships the raw worker template; the
  // router must keep the pairing worker for it.
  writeFileSync(join(templateRoot, "index.html"), `<!doctype html><title>${INDEX_MARKER}</title>`);
  writeFileSync(
    join(templateRoot, "service-worker.js"),
    'const BUILD_VERSION = "__PORACODE_BUILD_VERSION__";',
  );
  bundledRoot = fixtureRoot;
});

afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(templateRoot, { recursive: true, force: true });
});

afterEach(async () => {
  bundledRoot = fixtureRoot;
  await Promise.all(servers.splice(0).map((server) => server.dispose()));
});

function createServer(overrides: Partial<RemoteAccessServerOptions> = {}): RemoteAccessServer {
  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "1.0.0",
    identity: { desktopId: "desktop-static-test", label: "Static Assets Test" },
    host: "127.0.0.1",
    port: 0,
    callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    tls: null,
    ...overrides,
  });
  servers.push(server);
  return server;
}

describe("bundled web client route precedence", () => {
  it("serves the bundled build instead of the pairing artifacts", async () => {
    const info = await createServer().start();

    const document = await fetch(new URL("/", info.httpBaseUrl));
    expect(document.status).toBe(200);
    expect(document.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await document.text()).toContain(INDEX_MARKER);

    const manifest = await fetch(new URL("/manifest.webmanifest", info.httpBaseUrl));
    expect(manifest.status).toBe(200);
    expect(await manifest.text()).toContain(MANIFEST_MARKER);

    const worker = await fetch(new URL("/service-worker.js", info.httpBaseUrl));
    expect(worker.status).toBe(200);
    expect(worker.headers.get("cache-control")).toBe("no-cache, no-store, must-revalidate");
    const workerBody = await worker.text();
    expect(workerBody).toContain(WORKER_MARKER);
    expect(workerBody).not.toContain("poracode-remote-local");

    const icon = await fetch(new URL("/app-icon.svg", info.httpBaseUrl));
    expect(await icon.text()).toContain("bundled-icon");

    const audio = await fetch(new URL("/notification.mp3", info.httpBaseUrl));
    expect(audio.status).toBe(200);
    expect(audio.headers.get("content-type")).toBe("audio/mpeg");

    const asset = await fetch(new URL("/assets/app-abc123.js", info.httpBaseUrl));
    expect(asset.status).toBe(200);
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");

    const runtime = await fetch(new URL("/poracode-ssh-runtime/manifest.json", info.httpBaseUrl));
    expect(runtime.status).toBe(200);
    expect(await runtime.json()).toEqual({ archive: "bundled" });
  });

  it("answers HEAD for bundled files without a body", async () => {
    const info = await createServer().start();
    const response = await fetch(new URL("/manifest.webmanifest", info.httpBaseUrl), {
      method: "HEAD",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/manifest+json; charset=utf-8");
    expect(await response.text()).toBe("");
  });

  it("serves byte ranges for bundled media", async () => {
    const info = await createServer().start();
    const response = await fetch(new URL("/notification.mp3", info.httpBaseUrl), {
      headers: { range: "bytes=0-3" },
    });
    expect(response.status).toBe(206);
    expect(await response.text()).toBe("bund");
  });

  it("refreshes deep links through the bundled app shell", async () => {
    const info = await createServer().start();
    const response = await fetch(
      new URL("/thread/thread-1?host=https%3A%2F%2Fexample", info.httpBaseUrl),
      {
        headers: { accept: "text/html,application/xhtml+xml" },
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toContain(INDEX_MARKER);
  });

  it("never lets the SPA fallback swallow API errors, auth or files", async () => {
    const info = await createServer().start();

    const unauthorized = await fetch(new URL("/api/snapshot", info.httpBaseUrl), {
      headers: { accept: "text/html" },
    });
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("content-type")).toContain("application/json");

    const unknownApi = await fetch(new URL("/api/does-not-exist", info.httpBaseUrl), {
      headers: { accept: "text/html" },
    });
    expect(unknownApi.status).toBe(404);
    expect(unknownApi.headers.get("content-type")).toContain("application/json");

    const missingAsset = await fetch(new URL("/assets/missing.js", info.httpBaseUrl), {
      headers: { accept: "text/html" },
    });
    expect(missingAsset.status).toBe(404);
    expect(missingAsset.headers.get("content-type")).not.toContain("text/html");

    const arbitraryFile = await fetch(new URL("/secrets.json", info.httpBaseUrl), {
      headers: { accept: "text/html" },
    });
    expect(arbitraryFile.status).toBe(404);
    expect(arbitraryFile.headers.get("content-type")).not.toContain("text/html");

    const programmatic = await fetch(new URL("/thread/thread-1", info.httpBaseUrl));
    expect(programmatic.status).toBe(404);
  });

  it("falls back to the pairing worker for an unfinalized bundled build", async () => {
    bundledRoot = templateRoot;
    const info = await createServer().start();

    const document = await fetch(new URL("/", info.httpBaseUrl));
    expect(await document.text()).toContain(INDEX_MARKER);

    const worker = await fetch(new URL("/service-worker.js", info.httpBaseUrl));
    expect(worker.status).toBe(200);
    expect(await worker.text()).toContain("poracode-remote-local-1.0.0");
  });

  it("keeps the pairing entry when the install layout ships no web client", async () => {
    bundledRoot = missingRoot;
    const info = await createServer().start();

    const document = await fetch(new URL("/", info.httpBaseUrl));
    expect(document.status).toBe(200);
    const html = await document.text();
    expect(html).toContain("Poracode");
    expect(html).toContain('rel="manifest"');
    expect(html).not.toContain(INDEX_MARKER);

    const manifest = await fetch(new URL("/manifest.webmanifest", info.httpBaseUrl));
    expect(manifest.status).toBe(200);
    await expect(manifest.json()).resolves.toMatchObject({ name: "Poracode", start_url: "/" });

    const worker = await fetch(new URL("/service-worker.js", info.httpBaseUrl));
    expect(worker.status).toBe(200);
    expect(await worker.text()).toContain("poracode-remote-local-1.0.0");

    const icon = await fetch(new URL("/app-icon.svg", info.httpBaseUrl));
    expect(icon.status).toBe(200);
    expect(icon.headers.get("content-type")).toContain("image/svg+xml");

    // No pairing equivalent: the bundled-only paths stay truthful 404s.
    const audio = await fetch(new URL("/notification.mp3", info.httpBaseUrl));
    expect(audio.status).toBe(404);
    const runtime = await fetch(new URL("/poracode-ssh-runtime/manifest.json", info.httpBaseUrl));
    expect(runtime.status).toBe(404);

    // And an unmatched navigation stays a 404 instead of pretending to be the app.
    const deepLink = await fetch(new URL("/thread/thread-1", info.httpBaseUrl), {
      headers: { accept: "text/html" },
    });
    expect(deepLink.status).toBe(404);
  });

  it("holds the ingress slot until a slow static response completes", async () => {
    writeFileSync(join(fixtureRoot, "assets/slow.bin"), Buffer.alloc(4 * 1024 * 1024, 9));
    const info = await createServer({ maxConcurrentIngressWork: 1 }).start();
    const origin = new URL(info.httpBaseUrl);
    const socket = connect(Number(origin.port), origin.hostname);
    socket.on("error", () => {});
    try {
      await once(socket, "connect");
      socket.write("GET /assets/slow.bin HTTP/1.1\r\nHost: localhost\r\n\r\n");
      const [head] = (await once(socket, "data")) as [Buffer];
      expect(head.length).toBeGreaterThan(0);
      // Stop reading: the response is now in flight but cannot finish, so its
      // request lifetime (and the single ingress slot it holds) stays open.
      socket.pause();
      const blocked = await fetch(new URL("/assets/app-abc123.js", info.httpBaseUrl));
      expect(blocked.status).toBe(503);
      socket.destroy();
      await vi.waitFor(async () => {
        const released = await fetch(new URL("/assets/app-abc123.js", info.httpBaseUrl));
        expect(released.status).toBe(200);
      });
    } finally {
      socket.destroy();
    }
  });

  it("tears an in-flight static stream down on shutdown instead of draining it", async () => {
    writeFileSync(join(fixtureRoot, "assets/shutdown.bin"), Buffer.alloc(32 * 1024 * 1024, 5));
    const server = createServer({
      maxConcurrentIngressWork: 1,
      shutdownConnectionGraceMs: 100,
    });
    const info = await server.start();
    const origin = new URL(info.httpBaseUrl);
    const socket = connect(Number(origin.port), origin.hostname);
    socket.on("error", () => {});
    try {
      await once(socket, "connect");
      socket.write("GET /assets/shutdown.bin HTTP/1.1\r\nHost: localhost\r\n\r\n");
      const [head] = (await once(socket, "data")) as [Buffer];
      expect(head.length).toBeGreaterThan(0);
      // Stop reading far beyond any socket buffer: the transfer cannot finish
      // on its own and still holds the only ingress slot.
      socket.pause();
      const blocked = await fetch(new URL("/assets/app-abc123.js", info.httpBaseUrl));
      expect(blocked.status).toBe(503);
      const started = Date.now();
      await expect(server.dispose()).resolves.toBeUndefined();
      // Disposal is bounded by the 100 ms connection grace, not by draining
      // the stalled response.
      expect(Date.now() - started).toBeLessThan(5_000);
    } finally {
      socket.destroy();
    }
  });
});
