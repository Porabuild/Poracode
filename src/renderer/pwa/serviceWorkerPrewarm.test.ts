import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const workerSource = readFileSync(
  resolve(import.meta.dirname, "../../../public/service-worker.js"),
  "utf8",
);

function workerFixture() {
  const ready = new Set<string>();
  const cache = {
    match: vi.fn<
      (url: string, options?: CacheQueryOptions) => Promise<{ headers: Headers } | undefined>
    >(async (url, _options) =>
      ready.has(url)
        ? { headers: new Headers({ "content-type": "application/javascript" }) }
        : undefined,
    ),
    put: vi.fn<(url: string, response: Response) => Promise<void>>(async (url, _response) => {
      ready.add(url);
    }),
  };
  const fetch = vi.fn<(url: string) => Promise<Response>>(
    async (_url) =>
      new Response("export default 1", { headers: { "content-type": "application/javascript" } }),
  );
  type MessageEvent = { data: unknown; waitUntil(work: Promise<unknown>): void };
  const listeners = new Map<string, (event: MessageEvent) => void>();
  const open = vi.fn<() => Promise<typeof cache>>(async () => cache);
  runInNewContext(workerSource, {
    URL,
    fetch,
    caches: { open },
    self: {
      location: new URL("https://app.example/hosted/service-worker.js"),
      addEventListener: (type: string, handler: (event: MessageEvent) => void) => {
        listeners.set(type, handler);
      },
    },
  });
  return {
    cache,
    fetch,
    ready,
    open,
    post(urls: string[]): Promise<unknown> {
      let completion: Promise<unknown> | undefined;
      listeners.get("message")!({
        data: { type: "cache-build-assets", urls },
        waitUntil: (work) => {
          completion = work;
        },
      });
      if (!completion) throw new Error("Asset message did not join its work");
      return completion;
    },
  };
}

describe("service-worker build asset prewarming", () => {
  it("reuses immutable assets in its own cache, including Origin Vary variants", async () => {
    const fixture = workerFixture();
    fixture.ready.add("/hosted/assets/entry.js");
    await fixture.post(["https://app.example/hosted/assets/entry.js"]);
    expect(fixture.fetch).not.toHaveBeenCalled();
    expect(fixture.cache.match).toHaveBeenCalledWith("/hosted/assets/entry.js", {
      ignoreVary: true,
    });
    expect(fixture.open).toHaveBeenCalledWith("poracode-pwa-__PORACODE_BUILD_VERSION__");
  });

  it("joins overlapping snapshots while retaining each newly discovered asset", async () => {
    const fixture = workerFixture();
    const gate = Promise.withResolvers<void>();
    fixture.fetch.mockImplementation(async (_url) => {
      await gate.promise;
      return new Response("export default 1");
    });
    const first = fixture.post([
      "/hosted/assets/a.js",
      "/hosted/assets/b.js",
      "/hosted/assets/a.js",
    ]);
    const second = fixture.post(["/hosted/assets/b.js", "/hosted/assets/c.js"]);
    let joined = false;
    void Promise.all([first, second]).then(() => {
      joined = true;
    });
    try {
      await vi.waitFor(() => expect(fixture.fetch).toHaveBeenCalledTimes(3));
      expect(joined).toBe(false);
    } finally {
      gate.resolve();
      await Promise.all([first, second]);
    }
    expect([...fixture.ready].sort()).toEqual([
      "/hosted/assets/a.js",
      "/hosted/assets/b.js",
      "/hosted/assets/c.js",
    ]);
  });

  it("bounds active fills across different simultaneous messages without dropping assets", async () => {
    const fixture = workerFixture();
    const gate = Promise.withResolvers<void>();
    let active = 0;
    let peak = 0;
    fixture.fetch.mockImplementation(async (_url) => {
      peak = Math.max(peak, ++active);
      await gate.promise;
      active--;
      return new Response("export default 1");
    });
    const urls = Array.from({ length: 16 }, (_, index) => `/hosted/assets/${index}.js`);
    const first = fixture.post(urls.slice(0, 8));
    const second = fixture.post(urls.slice(8));
    try {
      await vi.waitFor(() => expect(fixture.fetch).toHaveBeenCalledTimes(4));
      expect(peak).toBe(4);
    } finally {
      gate.resolve();
      await Promise.all([first, second]);
    }
    expect(fixture.fetch).toHaveBeenCalledTimes(16);
    expect(fixture.ready.size).toBe(16);
    expect(peak).toBe(4);
    expect(active).toBe(0);
  });

  it("retires failed fills so a later notification can retry", async () => {
    const fixture = workerFixture();
    fixture.fetch.mockRejectedValueOnce(new Error("offline"));
    await fixture.post(["/hosted/assets/retry.js"]);
    expect(fixture.ready.size).toBe(0);
    await fixture.post(["/hosted/assets/retry.js"]);
    expect(fixture.ready.has("/hosted/assets/retry.js")).toBe(true);
    expect(fixture.fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps legacy HTML fallback entries eligible for repair", async () => {
    const fixture = workerFixture();
    fixture.cache.match.mockResolvedValueOnce({
      headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
    });
    await fixture.post(["/hosted/assets/stale.js"]);
    expect(fixture.fetch).toHaveBeenCalledExactlyOnceWith("/hosted/assets/stale.js");
  });

  it("refills an evicted asset without retaining a permanent completion index", async () => {
    const fixture = workerFixture();
    const url = "/hosted/assets/evicted.js";
    await fixture.post([url]);
    fixture.ready.delete(url);
    await fixture.post([url]);
    expect(fixture.ready.has(url)).toBe(true);
    expect(fixture.fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps other origins, runtime endpoints and other build roots outside prewarming", async () => {
    const fixture = workerFixture();
    await fixture.post([
      "https://elsewhere.example/hosted/assets/foreign.js",
      "/api/git/call",
      "/assets/other-build.js",
      "/hosted/assets/valid.js",
    ]);
    expect([...fixture.ready]).toEqual(["/hosted/assets/valid.js"]);
  });
});
