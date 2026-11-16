import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setImmediate } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import { MessageChannel } from "node:worker_threads";
import { describe, expect, it, vi } from "vitest";

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

type FixtureClient = {
  type: "window";
  url: string;
  postMessage(message: unknown, ports: MessagePort[]): void;
  navigate(url: string): Promise<unknown>;
};

type WorkerEvent = {
  waitUntil(work: Promise<unknown>): void;
  data?: unknown;
  source?: { scriptURL: string } | FixtureClient;
  request?: { method: string; url: string; mode: RequestMode; cache: RequestCache };
  respondWith?(response: Promise<Response> | Response): void;
};

/** Exercise actual worker handlers and Cache semantics, without a browser scheduler. */
function workerFixture(source = workerSource) {
  const stores = new Map<string, Map<string, Response>>();
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const timers: Array<{ callback: () => void; delay: number }> = [];
  const deleted: string[] = [];
  let claims = 0;
  let skips = 0;
  const controlMessages: unknown[] = [];
  const workerIdentity = { scriptURL: `${origin}/service-worker.js` };
  const key = (input: string | { url: string }) =>
    new URL(typeof input === "string" ? input : input.url, origin).href;
  const state = {
    offline: false,
    clients: [] as FixtureClient[],
    installing: false,
    routes: new Map<string, () => Response | Promise<Response>>([
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
  runInNewContext(source, {
    URL,
    Response,
    caches,
    fetch,
    MessageChannel,
    clearTimeout,
    setTimeout: (callback: () => void, delay: number) => {
      if (delay !== 500) return setTimeout(callback, delay);
      timers.push({ callback, delay });
      return 0;
    },
    self: {
      location: new URL(`${origin}/service-worker.js`),
      addEventListener: (type: string, listener: (event: WorkerEvent) => void) =>
        listeners.set(type, listener),
      skipWaiting: () => skips++,
      clients: { claim: async () => claims++, matchAll: async () => state.clients },
      registration: {
        get installing() {
          return state.installing ? {} : null;
        },
        active: { postMessage: (message: unknown) => controlMessages.push(message) },
      },
    },
  });
  async function dispatch(type: string, event: Omit<WorkerEvent, "waitUntil"> = {}) {
    const work: Promise<unknown>[] = [];
    const listener = listeners.get(type);
    if (!listener) throw new Error(`Missing ${type} listener`);
    listener({ ...event, waitUntil: (promise) => work.push(promise) });
    return Promise.all(work);
  }
  function startRequest(path: string, mode: RequestMode, cache: RequestCache = "default") {
    let response: Promise<Response> | undefined;
    const lifetime = dispatch("fetch", {
      request: { method: "GET", url: key(path), mode, cache },
      respondWith: (value) => {
        response = Promise.resolve(value);
      },
    });
    for (const timer of timers.splice(0)) {
      expect(timer.delay).toBe(500);
      timer.callback();
    }
    if (!response) throw new Error("Request was not intercepted");
    return { response, lifetime };
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
    refresh: () => dispatch("message", { data: controlMessages.shift(), source: workerIdentity }),
    activateWaiting: () => dispatch("message", { data: { type: "activate-build" } }),
    checkBuild: (version: string, client: FixtureClient) =>
      dispatch("message", { data: { type: "check-build", version }, source: client }),
    startRequest,
    async request(path: string, mode: RequestMode, cache: RequestCache = "default") {
      const { response, lifetime } = startRequest(path, mode, cache);
      try {
        return await response;
      } finally {
        await lifetime;
      }
    },
  };
}

describe("service-worker shell installation and offline integrity", () => {
  it.each(["no-cache", "reload"] as const)(
    "waits for the current deployment with cache mode %s instead of serving the previous shell",
    async (cache) => {
      const fixture = workerFixture();
      const network = Promise.withResolvers<Response>();
      fixture.state.routes.set("/threads", () => network.promise);

      // Start from a released cache whose entry module exists but whose
      // not-yet-loaded lazy modules were removed by a newer deployment.
      const pending = fixture.startRequest("/threads", "navigate", cache);
      await setImmediate();
      network.resolve(html(shell));

      const response = await pending.response;
      await pending.lifetime;
      expect(await response.text()).toBe(shell);
    },
  );

  it("keeps the fast cached shell fallback for ordinary slow navigations", async () => {
    const fixture = workerFixture();
    const network = Promise.withResolvers<Response>();
    fixture.state.routes.set("/threads", () => network.promise);
    const pending = fixture.startRequest("/threads", "navigate");
    const response = await pending.response;
    network.resolve(html(shell));
    await pending.lifetime;
    expect(await response.text()).toBe(fixture.previousShell);
  });

  it.each(["no-cache", "reload"] as const)(
    "preserves the previous offline shell when cache mode %s cannot reach the network",
    async (cache) => {
      const fixture = workerFixture();
      fixture.state.offline = true;
      const response = await fixture.request("/threads", "navigate", cache);
      expect(await response.text()).toBe(fixture.previousShell);
      expect(fixture.deleted).toEqual([]);
    },
  );

  it("activates a complete shell immediately while retaining the previous asset graph", async () => {
    const fixture = workerFixture();
    await fixture.upgrade();
    expect(fixture.skips).toBe(1);
    expect(fixture.deleted).toEqual([]);
    expect(fixture.claims).toBe(1);
    expect(fixture.stores.has("unrelated-cache")).toBe(true);
    fixture.state.offline = true;
    expect(await (await fixture.request("/thread/resume", "navigate")).text()).toBe(shell);
    expect(await (await fixture.request("/assets/current.js", "cors")).text()).toContain(
      "build = 'current'",
    );
    expect(await (await fixture.request("/assets/previous.js", "cors")).text()).toBe("previous();");
  });

  it("accepts the activation handshake after an installed update reaches waiting", async () => {
    const fixture = workerFixture();
    await fixture.activateWaiting();
    expect(fixture.skips).toBe(1);
    expect(fixture.deleted).toEqual([]);
  });

  it("keeps the installed offline shell when an online navigation sees a newer deployment", async () => {
    const fixture = workerFixture();
    await fixture.upgrade();
    const nextShell = shell.replaceAll("current", "next");
    fixture.state.routes.set("/", () => html(nextShell));
    expect(await (await fixture.request("/", "navigate", "reload")).text()).toBe(nextShell);
    fixture.state.offline = true;
    expect(await (await fixture.request("/", "navigate")).text()).toBe(shell);
  });

  it("bounds retained build caches without deleting unrelated origin data", async () => {
    const fixture = workerFixture();
    fixture.stores.set("poracode-pwa-legacy-failed-install", new Map());
    await fixture.upgrade();
    expect(fixture.deleted).toEqual([]);
    await fixture.refresh();
    expect(fixture.deleted).toEqual([oldName, "poracode-pwa-legacy-failed-install"]);
    expect(fixture.stores.has("unrelated-cache")).toBe(true);
  });

  it("joins all client navigations and retains legacy graphs until every client has the new build", async () => {
    const fixture = workerFixture();
    const gate = Promise.withResolvers<void>();
    const versions = ["previous", "previous"];
    let navigations = 0;
    for (const index of [0, 1]) {
      fixture.state.clients.push({
        type: "window",
        url: `${origin}/thread/${index}?host=saved#resume`,
        postMessage: (_message, ports) => ports[0]!.postMessage({ version: versions[index] }),
        navigate: async (url) => {
          const target = new URL(url);
          expect(target.pathname).toBe(`/thread/${index}`);
          expect(target.searchParams.get("host")).toBe("saved");
          expect(target.searchParams.has("__poracode_reload")).toBe(true);
          expect(target.hash).toBe("#resume");
          navigations++;
          await gate.promise;
          versions[index] = "__PORACODE_BUILD_VERSION__";
        },
      });
    }
    // Debris from a released worker must not displace the still-live graph.
    fixture.stores.set("poracode-pwa-legacy-failed-install", new Map());
    await fixture.upgrade();
    let settled = false;
    const refresh = fixture.refresh().then(() => {
      settled = true;
    });
    try {
      await vi.waitFor(() => expect(navigations).toBe(2));
      expect(settled).toBe(false);
      expect(fixture.deleted).toEqual([]);
      fixture.state.offline = true;
      expect(await (await fixture.request("/assets/previous.js", "cors")).text()).toBe(
        "previous();",
      );
    } finally {
      gate.resolve();
      await refresh;
    }
    expect(settled).toBe(true);
    expect(fixture.stores.has(oldName)).toBe(false);
    expect(fixture.stores.has(currentName)).toBe(true);
  });

  it("keeps a legacy client's graph if its navigation fails", async () => {
    const fixture = workerFixture();
    fixture.state.clients.push({
      type: "window",
      url: `${origin}/thread/1`,
      postMessage: (_message, ports) => ports[0]!.postMessage({ version: "previous" }),
      navigate: async () => {
        throw new Error("navigation interrupted");
      },
    });
    await fixture.upgrade();
    await fixture.refresh();
    expect(fixture.deleted).toEqual([]);
    fixture.state.offline = true;
    expect(await (await fixture.request("/assets/previous.js", "cors")).text()).toBe("previous();");
  });

  it("does not prune the active build when an installing worker receives optional warming", async () => {
    const fixture = workerFixture();
    await fixture.message([`${origin}/assets/current.js`]);
    expect(fixture.deleted).toEqual([]);
    expect(fixture.stores.has(oldName)).toBe(true);
    fixture.state.offline = true;
    expect(await (await fixture.request("/assets/previous.js", "cors")).text()).toBe("previous();");
  });

  it("refreshes a resumed old document when this worker was already activated", async () => {
    const fixture = workerFixture();
    let version = "previous";
    let navigations = 0;
    const client: FixtureClient = {
      type: "window",
      url: `${origin}/thread/resumed`,
      postMessage: (_message, ports) => ports[0]!.postMessage({ version }),
      navigate: async () => {
        navigations++;
        version = "__PORACODE_BUILD_VERSION__";
      },
    };
    fixture.state.clients.push(client);
    await fixture.upgrade();
    await fixture.checkBuild("previous", client);
    expect(navigations).toBe(1);
    expect(fixture.stores.has(oldName)).toBe(false);
  });

  it("does not reload a newer document back through an older worker during installation", async () => {
    const fixture = workerFixture();
    let navigations = 0;
    const client: FixtureClient = {
      type: "window",
      url: `${origin}/thread/newer-document`,
      postMessage: (_message, ports) => ports[0]!.postMessage({ version: "next" }),
      navigate: async () => {
        navigations++;
      },
    };
    fixture.state.clients.push(client);
    await fixture.upgrade();
    fixture.state.installing = true;
    await fixture.checkBuild("next", client);
    expect(navigations).toBe(0);
    expect(fixture.deleted).toEqual([]);
  });

  it("does not let a retiring active worker delete the next worker's in-progress cache", async () => {
    const fixture = workerFixture();
    await fixture.upgrade();
    const futureName = "poracode-pwa-next-install";
    fixture.stores.set(futureName, new Map());
    await fixture.refresh();
    expect(fixture.stores.has(oldName)).toBe(false);
    expect(fixture.stores.has(currentName)).toBe(true);
    expect(fixture.stores.has(futureName)).toBe(true);
  });

  it("rejects a missing shell while retaining the previous offline build", async () => {
    const fixture = workerFixture();
    fixture.state.offline = true;
    await expect(fixture.upgrade()).rejects.toThrow("simulated offline");
    expect(fixture.deleted).toEqual([currentName]);
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
    expect(fixture.deleted).toEqual([currentName]);
    expect(fixture.claims).toBe(0);
    expect(fixture.stores.has(currentName)).toBe(false);
    fixture.state.offline = true;
    expect(await (await fixture.request("/", "navigate")).text()).toBe(fixture.previousShell);
  });

  it("rejects an update missing a required dynamic startup chunk even when the entry is cached", async () => {
    const fixture = workerFixture(
      workerSource.replace(
        '"__PORACODE_STARTUP_ASSET_URLS__"',
        JSON.stringify(["assets/current.js", "assets/remoteBridge-current.js"]),
      ),
    );
    await expect(fixture.upgrade()).rejects.toThrow("remoteBridge-current.js");
    expect(fixture.skips).toBe(0);
    expect(fixture.stores.has(currentName)).toBe(false);
    expect(fixture.stores.has(oldName)).toBe(true);
    fixture.state.offline = true;
    expect(await (await fixture.request("/", "navigate")).text()).toBe(fixture.previousShell);
  });

  it("rejects a different deployment's shell during installation", async () => {
    const fixture = workerFixture();
    fixture.state.routes.set("/", () =>
      html('<meta name="poracode-build-version" content="another-deployment">' + shell),
    );
    await expect(fixture.upgrade()).rejects.toThrow("deployment changed");
    expect(fixture.skips).toBe(0);
    expect(fixture.deleted).toEqual([currentName]);
    expect(fixture.stores.has(oldName)).toBe(true);
  });

  it("does not replace the previous build with an HTTP-200 error page", async () => {
    const fixture = workerFixture();
    fixture.state.routes.set("/", () => html("<h1>Temporarily unavailable</h1>"));
    await expect(fixture.upgrade()).rejects.toThrow("no build assets");
    expect(fixture.deleted).toEqual([currentName]);
    expect(fixture.claims).toBe(0);
  });

  it("rejects an HTTP-200 HTML fallback before caching it as an entry module", async () => {
    const fixture = workerFixture();
    fixture.state.routes.set("/assets/current.js", () => html(shell));
    await expect(fixture.upgrade()).rejects.toThrow("build asset");
    expect(fixture.stores.has(currentName)).toBe(false);
    expect(fixture.deleted).toEqual([currentName]);
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
