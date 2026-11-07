import { mkdtempSync, rmSync } from "node:fs";
import { get, Server } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { afterEach, expect, it, vi } from "vitest";
import type { McpServer } from "@/shared/contracts";
import { McpOAuthService } from "./McpOAuthService";
import { McpOAuthRefresh } from "./McpOAuthRefresh";

const authenticate = vi.hoisted(() => vi.fn<typeof import("@modelcontextprotocol/client").auth>());
vi.mock("@modelcontextprotocol/client", async (original) => ({
  ...(await original<typeof import("@modelcontextprotocol/client")>()),
  auth: authenticate,
}));

const fixtures: Array<{ service: McpOAuthService; directory: string }> = [];
afterEach(async () => {
  for (const { service, directory } of fixtures.splice(0)) {
    await service.dispose();
    rmSync(directory, { recursive: true, force: true });
  }
  vi.unstubAllGlobals();
  authenticate.mockReset();
});

const server: McpServer = {
  id: "lifetime-fixture",
  name: "lifetime-fixture",
  description: "",
  enabled: true,
  timeoutMs: 30_000,
  transport: { type: "http", url: "https://issuer.invalid/mcp", headers: {} },
};

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "poracode-mcp-lifetime-"));
  const service = new McpOAuthService({ baseDir: directory });
  fixtures.push({ service, directory });
  return service;
}

it("joins an invalidated refresh after it leaves the active lookup", async () => {
  const refresh = new McpOAuthRefresh();
  const entered = Promise.withResolvers<AbortSignal>();
  const release = Promise.withResolvers<void>();
  const pending = refresh.run(
    "fixture",
    async (signal) => {
      entered.resolve(signal);
      await release.promise;
      signal.throwIfAborted();
      return "late-token";
    },
    30_000,
  );
  const signal = await entered.promise;
  refresh.invalidate("fixture");
  expect(signal.aborted).toBe(true);
  let retired = false;
  const disposing = Promise.resolve(refresh.dispose()).then(() => {
    retired = true;
  });
  try {
    await setImmediate();
    expect(retired).toBe(false);
  } finally {
    release.resolve();
    await disposing;
    await expect(pending).resolves.toBeUndefined();
  }
});

it.each(["cancel", "shutdown"] as const)(
  "joins held initial discovery on %s and fences late credential writes",
  async (action) => {
    const service = fixture();
    const controller = new AbortController();
    const entered = Promise.withResolvers<AbortSignal>();
    const release = Promise.withResolvers<void>();
    let callback = "";
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (_input, init) => {
        entered.resolve(init!.signal!);
        await release.promise;
        return new Response(null);
      }),
    );
    authenticate.mockImplementation(async (provider, options) => {
      callback = String(provider.redirectUrl);
      await options.fetchFn!("https://issuer.invalid/discovery");
      await provider.saveTokens!({ access_token: "late-token", token_type: "Bearer" });
      return "AUTHORIZED";
    });
    let completed = false;
    const beginning = service
      .beginForCredential(server, undefined, controller.signal)
      .then((result) => {
        completed = true;
        return result;
      });
    const signal = await entered.promise;
    if (action === "cancel") controller.abort();
    let disposed = false;
    const disposing =
      action === "shutdown"
        ? Promise.resolve(service.dispose()).then(() => {
            disposed = true;
          })
        : undefined;
    try {
      expect(signal.aborted).toBe(true);
      await setImmediate();
      expect(completed).toBe(false);
      expect(disposed).toBe(false);
    } finally {
      release.resolve();
      await disposing;
    }
    await expect(beginning).resolves.toMatchObject({ status: "error" });
    expect(service.status().authenticatedUrls).toEqual([]);
    await expect(
      new Promise<void>((resolve, reject) => {
        const request = get(callback, (response) => {
          response.resume();
          resolve();
        });
        request.on("error", reject);
      }),
    ).rejects.toMatchObject({ code: "ECONNREFUSED" });
  },
);

it("joins a held callback exchange before wait or shutdown can finish", async () => {
  const service = fixture();
  const entered = Promise.withResolvers<AbortSignal>();
  const release = Promise.withResolvers<void>();
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (_input, init) => {
      entered.resolve(init!.signal!);
      await release.promise;
      return new Response(null);
    }),
  );
  authenticate.mockImplementation(async (provider, options) => {
    if (!options.authorizationCode) {
      const url = new URL("https://issuer.invalid/authorize");
      url.searchParams.set("redirect_uri", String(provider.redirectUrl));
      url.searchParams.set("state", await provider.state!());
      await provider.redirectToAuthorization(url);
      return "REDIRECT";
    }
    await options.fetchFn!("https://issuer.invalid/token");
    await provider.saveTokens!({ access_token: "late-token", token_type: "Bearer" });
    return "AUTHORIZED";
  });
  const begun = await service.begin({ server });
  if (begun.status !== "redirect") throw new Error("Expected redirect");
  const authorization = new URL(begun.authorizationUrl);
  const callback = new URL(authorization.searchParams.get("redirect_uri")!);
  callback.searchParams.set("state", authorization.searchParams.get("state")!);
  callback.searchParams.set("code", "fixture-code");
  await new Promise<void>((resolve, reject) => {
    get(callback, (response) => {
      response.resume();
      response.once("end", resolve);
    }).once("error", reject);
  });
  const signal = await entered.promise;
  let waited = false;
  let disposed = false;
  const waiting = service.wait({ flowId: begun.flowId }).then((result) => {
    waited = true;
    return result;
  });
  const disposing = Promise.resolve(service.dispose()).then(() => {
    disposed = true;
  });
  try {
    expect(signal.aborted).toBe(true);
    await setImmediate();
    expect(waited).toBe(false);
    expect(disposed).toBe(false);
  } finally {
    release.resolve();
    await disposing;
  }
  await expect(waiting).resolves.toMatchObject({ status: "error" });
  expect(service.status().authenticatedUrls).toEqual([]);
});

it("closes owned partial callback connections before reporting shutdown", async () => {
  const service = fixture();
  let callback = "";
  authenticate.mockImplementation(async (provider) => {
    callback = String(provider.redirectUrl);
    await provider.redirectToAuthorization(new URL("https://issuer.invalid/authorize"));
    return "REDIRECT";
  });
  const begun = await service.begin({ server });
  expect(begun.status).toBe("redirect");
  const socket = connect({ host: "127.0.0.1", port: Number(new URL(callback).port) });
  const closed = Promise.withResolvers<void>();
  socket.once("close", () => closed.resolve());
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
  socket.write("GET /callback HTTP/1.1\r\nHost: 127.0.0.1\r\n");
  try {
    await service.dispose();
    await expect.poll(() => socket.destroyed, { timeout: 1_000 }).toBe(true);
    await closed.promise;
    expect(socket.destroyed).toBe(true);
  } finally {
    socket.destroy();
  }
});

it("refuses a pre-cancelled or disposed sign-in before discovery", async () => {
  const service = fixture();
  const controller = new AbortController();
  controller.abort();
  await expect(
    service.beginForCredential(server, undefined, controller.signal),
  ).resolves.toMatchObject({ status: "error" });
  expect(authenticate).not.toHaveBeenCalled();
  await service.dispose();
  await expect(service.begin({ server })).resolves.toMatchObject({ status: "error" });
  expect(authenticate).not.toHaveBeenCalled();
});

it("joins a callback listener still opening when cancellation arrives", async () => {
  const service = fixture();
  const controller = new AbortController();
  const close = vi.spyOn(Server.prototype, "close");
  authenticate.mockRejectedValue(new Error("Discovery must not run after cancellation"));
  try {
    const beginning = service.beginForCredential(server, undefined, controller.signal);
    controller.abort();
    await expect(beginning).resolves.toMatchObject({ status: "error" });
    expect(authenticate).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
    expect(close.mock.contexts[0]).toMatchObject({ listening: false });
  } finally {
    close.mockRestore();
  }
});

it("does not report success after caller cancellation during listener retirement", async () => {
  const service = fixture();
  const controller = new AbortController();
  const originalClose = Server.prototype.close;
  const close = vi.spyOn(Server.prototype, "close");
  close.mockImplementation(function (this: Server, ...args: Parameters<Server["close"]>) {
    controller.abort();
    return originalClose.apply(this, args);
  });
  authenticate.mockResolvedValue("AUTHORIZED");
  try {
    await expect(
      service.beginForCredential(server, undefined, controller.signal),
    ).resolves.toMatchObject({ status: "error" });
    expect(controller.signal.aborted).toBe(true);
  } finally {
    close.mockRestore();
  }
});
