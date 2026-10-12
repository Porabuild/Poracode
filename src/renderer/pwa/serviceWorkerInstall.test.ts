import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const workerSource = readFileSync(
  resolve(import.meta.dirname, "../../../public/service-worker.js"),
  "utf8",
);
const origin = "https://app.example";
const oldName = "poracode-pwa-previous-released-build";
const currentName = "poracode-pwa-__PORACODE_BUILD_VERSION__";
const shell = '<!doctype html><script type="module" src="/assets/current.js"></script>';
const html = (body: string) => new Response(body, { headers: { "content-type": "text/html" } });
const script = () =>
  new Response("export const build = 'current';", {
    headers: { "content-type": "application/javascript" },
  });

type WorkerEvent = {
  waitUntil(work: Promise<unknown>): void;
  data?: unknown;
  request?: { method: string; url: string; mode: RequestMode };
  respondWith?(response: Promise<Response> | Response): void;
};

/** Exercise actual worker handlers and Cache semantics, without a browser scheduler. */
function workerFixture() {
  const stores = new Map<string, Map<string, Response>>();
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const timers: Array<{ callback: () => void; delay: number }> = [];
  const deleted: string[] = [];
  let claims = 0;
  let skips = 0;
  const key = (input: string | { url: string }) =>
    new URL(typeof input === "string" ? input : input.url, origin).href;
  const state = {
    offline: false,
    routes: new Map<string, () => Response>([
      ["/", () => html(shell)],
      ["/manifest.webmanifest", () => new Response("{}")],
      ["/app-icon.svg", () => new Response("<svg/>")],
      ["/assets/current.js", script],
    ]),
  };
  const fetch = async (input: string | { url: string }) => {
    const url = new URL(key(input));
    if (state.offline) throw new TypeError("simulated offline network");
    const route = state.routes.get(url.pathname);
    if (!route) throw new TypeError(`simulated unavailable resource: ${url.pathname}`);
    return route();
  };
  const caches = {
    async open(name: string) {
      let store = stores.get(name);
      if (!store) {
        store = new Map();
        stores.set(name, store);
      }
      const entries = store;
      return {
        match: async (input: string | { url: string }) => entries.get(key(input))?.clone(),
        put: async (input: string | { url: string }, response: Response) => {
          entries.set(key(input), response.clone());
        },
        add: async (input: string | { url: string }) => {
          const response = await fetch(input);
          if (!response.ok) throw new TypeError("Cache.add non-success response");
          // Cache.add accepts HTTP-200 HTML; the worker must reject it for build assets.
          entries.set(key(input), response.clone());
        },
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => {
      deleted.push(name);
      return stores.delete(name);
    },
    match: async (input: string | { url: string }) => {
      for (const store of stores.values()) {
        const found = store.get(key(input));
        if (found) return found.clone();
      }
      return undefined;
    },
  };
  const previousShell = '<!doctype html><script src="/assets/previous.js"></script>';
  stores.set(
    oldName,
    new Map([
      [key("/"), html(previousShell)],
      [key("/assets/previous.js"), new Response("previous();")],
    ]),
  );
  stores.set("unrelated-cache", new Map());
  runInNewContext(workerSource, {
    URL,
    Response,
    caches,
    fetch,
    setTimeout: (callback: () => void, delay: number) => timers.push({ callback, delay }),
    self: {
      location: new URL(`${origin}/service-worker.js`),
      addEventListener: (type: string, listener: (event: WorkerEvent) => void) =>
        listeners.set(type, listener),
      skipWaiting: () => skips++,
      clients: { claim: async () => claims++ },
    },
  });
  async function dispatch(type: string, event: Omit<WorkerEvent, "waitUntil"> = {}) {
    const work: Promise<unknown>[] = [];
    const listener = listeners.get(type);
    if (!listener) throw new Error(`Missing ${type} listener`);
    listener({ ...event, waitUntil: (promise) => work.push(promise) });
    return Promise.all(work);
  }
  return {
    state,
    stores,
    deleted,
    previousShell,
    get claims() {
      return claims;
    },
    get skips() {
      return skips;
    },
    lifecycle: (type: string) => dispatch(type),
    async upgrade() {
      await dispatch("install");
      await dispatch("activate");
    },
    message: (urls: string[]) =>
      dispatch("message", { data: { type: "cache-build-assets", urls } }),
    async request(path: string, mode: RequestMode) {
      let response: Promise<Response> | undefined;
      const lifetime = dispatch("fetch", {
        request: { method: "GET", url: key(path), mode },
        respondWith: (value) => {
          response = Promise.resolve(value);
        },
      });
      for (const timer of timers.splice(0)) {
        expect(timer.delay).toBe(500);
        timer.callback();
      }
      try {
        if (!response) throw new Error("Request was not intercepted");
        return await response;
      } finally {
        await lifetime;
      }
    },
  };
}

describe("service-worker shell installation and offline integrity", () => {
  it("retires the previous cache only after a complete shell installs", async () => {
    const fixture = workerFixture();
    await fixture.upgrade();
    expect(fixture.skips).toBe(0);
    expect(fixture.deleted).toEqual([oldName]);
    expect(fixture.claims).toBe(1);
    expect(fixture.stores.has("unrelated-cache")).toBe(true);
    fixture.state.offline = true;
    expect(await (await fixture.request("/thread/resume", "navigate")).text()).toBe(shell);
    expect(await (await fixture.request("/assets/current.js", "cors")).text()).toContain(
      "build = 'current'",
    );
  });

  it("rejects a missing shell while retaining the previous offline build", async () => {
    const fixture = workerFixture();
    fixture.state.offline = true;
    await expect(fixture.upgrade()).rejects.toThrow("simulated offline");
    expect(fixture.deleted).toEqual([]);
    expect(fixture.claims).toBe(0);
    expect(await (await fixture.request("/", "navigate")).text()).toBe(fixture.previousShell);
    expect(await (await fixture.request("/assets/previous.js", "cors")).text()).toBe("previous();");
  });

  it("rejects an incomplete entry module without retiring the usable previous build", async () => {
    const fixture = workerFixture();
    fixture.state.routes.set("/assets/current.js", () => {
      throw new TypeError("network interrupted");
    });
    await expect(fixture.upgrade()).rejects.toThrow("network interrupted");
    expect(fixture.deleted).toEqual([]);
    expect(fixture.claims).toBe(0);
    fixture.state.offline = true;
    expect(await (await fixture.request("/", "navigate")).text()).toBe(fixture.previousShell);
  });

  it("does not replace the previous build with an HTTP-200 error page", async () => {
    const fixture = workerFixture();
    fixture.state.routes.set("/", () => html("<h1>Temporarily unavailable</h1>"));
    await expect(fixture.upgrade()).rejects.toThrow("no build assets");
    expect(fixture.deleted).toEqual([]);
    expect(fixture.claims).toBe(0);
  });

  it("rejects an HTTP-200 HTML fallback before caching it as an entry module", async () => {
    const fixture = workerFixture();
    fixture.state.routes.set("/assets/current.js", () => html(shell));
    await expect(fixture.upgrade()).rejects.toThrow("build asset");
    expect(fixture.stores.get(currentName)?.has(`${origin}/assets/current.js`)).toBe(false);
    expect(fixture.deleted).toEqual([]);
    expect(fixture.claims).toBe(0);
  });

  it("does not poison optional prewarming and retries when a real script is available", async () => {
    const fixture = workerFixture();
    fixture.state.routes.set("/assets/current.js", () => html(shell));
    await fixture.message([`${origin}/assets/current.js`]);
    expect(fixture.stores.get(currentName)?.has(`${origin}/assets/current.js`)).toBe(false);
    fixture.state.routes.set("/assets/current.js", script);
    await fixture.message([`${origin}/assets/current.js`]);
    fixture.state.offline = true;
    expect(await (await fixture.request("/assets/current.js", "cors")).text()).toContain(
      "build = 'current'",
    );
  });

  it("refuses a poisoned legacy cache hit offline and repairs it online", async () => {
    const fixture = workerFixture();
    fixture.stores.set(currentName, new Map([[`${origin}/assets/current.js`, html(shell)]]));
    fixture.state.offline = true;
    await expect(fixture.request("/assets/current.js", "cors")).rejects.toThrow(
      "simulated offline",
    );
    fixture.state.offline = false;
    await fixture.message([`${origin}/assets/current.js`]);
    fixture.state.offline = true;
    expect(await (await fixture.request("/assets/current.js", "cors")).text()).toContain(
      "build = 'current'",
    );
  });

  it("keeps manifest and icon fetches optional for a complete runnable shell", async () => {
    const fixture = workerFixture();
    for (const path of ["/manifest.webmanifest", "/app-icon.svg"]) {
      fixture.state.routes.set(path, () => {
        throw new TypeError("optional resource unavailable");
      });
    }
    await fixture.upgrade();
    fixture.state.offline = true;
    expect(await (await fixture.request("/", "navigate")).text()).toBe(shell);
    expect(await (await fixture.request("/assets/current.js", "cors")).text()).toContain(
      "build = 'current'",
    );
  });
});
