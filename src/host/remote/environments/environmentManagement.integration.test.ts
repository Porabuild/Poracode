import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { composeHostEnvironments } from "@/host/environments/composeHostEnvironments";
import type { EnvironmentPublicProjection } from "@/shared/environments";
import type { RemoteAccessScope } from "@/shared/remote";
import { RemoteAuthStore } from "../auth";
import { RemoteAccessServer } from "../RemoteAccessServer";
import { baseOptions, startParentHost, startUpstream } from "./environmentProxyTestFixtures";
import { environmentRemoteAccessOptions } from "./environmentRemoteAccessOptions";
import type { EnvironmentProxyGatewayLike } from "./types";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
  vi.restoreAllMocks();
});

async function startHost(mode: "complete" | "runtime-only" | "absent" = "complete") {
  const root = await mkdtemp(join(tmpdir(), "poracode-environment-http-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const environments = await composeHostEnvironments({
    lease: { paths: { dataRoot: root }, generation: "test", assertActive() {} },
    baseDir: root,
    inputs: { mainBundleDir: root, agentPluginsDir: root, wslHelpersDir: root },
    runtimeProvider: async () => ({ hash: "a".repeat(64) }),
    createSshManager: () => ({
      connect: async () => {
        throw new Error("SSH is not part of this HTTP composition fixture");
      },
      disconnect: async () => {},
      dispose: async () => {},
    }),
  });
  cleanup.push(() => environments.dispose());
  const auth = new RemoteAuthStore();
  let server!: RemoteAccessServer;
  let gateway: EnvironmentProxyGatewayLike | undefined;
  const configured = environmentRemoteAccessOptions(environments.runtimeService, auth, () => {
    const info = server.getInfo();
    if (!info) throw new Error("server is not listening");
    return info;
  });
  server = new RemoteAccessServer(
    baseOptions({
      authStore: auth,
      ...(mode === "absent" ? {} : { environmentManagement: configured.environmentManagement }),
      ...(mode === "complete"
        ? {
            environmentProxy: (deps) => {
              gateway = configured.environmentProxy(deps);
              return gateway;
            },
          }
        : {}),
    }),
  );
  cleanup.push(() => server.dispose());
  const info = await server.start();
  const token = (scopes?: readonly RemoteAccessScope[]): string => {
    const issued = auth.issuePairingCredential(scopes ? { scopes } : undefined);
    return auth.exchangePairingCredential({ credential: issued.credential }).accessToken;
  };
  const request = (path: string, accessToken: string, body?: unknown, signal?: AbortSignal) =>
    fetch(new URL(path, info.httpBaseUrl), {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
  return { server, environments, info, token, request, gateway: () => gateway };
}

it("serves the real environment authority over authenticated HTTP with CAS and viewer restrictions", async () => {
  const host = await startHost();
  const manager = host.token();
  const viewer = host.token(["session:read"]);
  const created = await host.request("/api/environments", manager, {
    label: "Build box",
    target: "dev@example.test",
    desired: "disabled",
  });
  expect(created.status).toBe(200);
  const { environment } = (await created.json()) as { environment: EnvironmentPublicProjection };
  expect(host.environments.runtimeService.getPublic(environment.environmentId)).toEqual(
    environment,
  );
  const listed = await host.request("/api/environments", viewer);
  expect(await listed.json()).toEqual({ environments: [environment] });
  const denied = await host.request(
    `/api/environments/${environment.environmentId}/delete`,
    viewer,
    {
      expectedRevision: environment.revision,
    },
  );
  expect(denied.status).toBe(403);
  const stale = await host.request(`/api/environments/${environment.environmentId}`, manager, {
    expectedRevision: environment.revision + 1,
    patch: { label: "Wrong" },
  });
  expect(stale.status).toBe(409);
  expect(host.environments.runtimeService.getPublic(environment.environmentId)?.label).toBe(
    "Build box",
  );
  const descriptor = await fetch(
    new URL("/.well-known/poracode/environment", host.info.httpBaseUrl),
  );
  expect(await descriptor.json()).toMatchObject({
    capabilities: { sshEnvironments: { versions: [1] } },
  });
  const ticket = await host.request(
    `/api/environments/${environment.environmentId}/websocket-ticket`,
    manager,
    {},
  );
  expect(ticket.status).toBe(200);
  expect(await ticket.json()).toMatchObject({
    ticket: expect.any(String),
    expiresAt: expect.any(String),
  });
  await host.server.dispose();
  expect(() =>
    host.gateway()?.mintWebSocketTicket({
      parentAccessToken: manager,
      environmentId: environment.environmentId,
    }),
  ).toThrow("not available");
});

it.each(["runtime-only", "absent"] as const)(
  "does not advertise a partial %s composition",
  async (mode) => {
    const host = await startHost(mode);
    const descriptor = await fetch(
      new URL("/.well-known/poracode/environment", host.info.httpBaseUrl),
    );
    const body = (await descriptor.json()) as { capabilities?: { sshEnvironments?: unknown } };
    expect(body.capabilities?.sshEnvironments).toBeUndefined();
    const response = await host.request("/api/environments", host.token());
    expect(response.status).toBe(503);
  },
);

it("detaches a disconnected HTTP caller through the runtime signal", async () => {
  const host = await startHost();
  const env = await host.environments.runtimeService.create({
    label: "Build box",
    target: "dev@example.test",
    desired: "disabled",
  });
  const entered = Promise.withResolvers<AbortSignal>();
  vi.spyOn(host.environments.runtimeService, "connect").mockImplementation((_id, options) => {
    const signal = options?.signal;
    if (!signal) throw new Error("HTTP adapter did not provide a signal");
    entered.resolve(signal);
    return new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  });
  const caller = new AbortController();
  const response = host
    .request(`/api/environments/${env.environmentId}/connect`, host.token(), {}, caller.signal)
    .then(
      () => "resolved",
      () => "rejected",
    );
  const signal = await entered.promise;
  expect(signal.aborted).toBe(false);
  caller.abort();
  expect(await response).toBe("rejected");
  await vi.waitFor(() => expect(signal.aborted).toBe(true));
});

it("server disposal itself cancels and joins its active environment proxy leg", async () => {
  const host = await startParentHost(cleanup);
  const upstream = await startUpstream(cleanup, (_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.write("stream stays open");
  });
  host.targets.connect("env-1", upstream.port);
  const response = await host.proxyFetch("env-1", "/api/stream");
  const body = response.text().then(
    () => "complete",
    () => "cancelled",
  );
  expect(host.gateway.activeLegCount()).toBe(1);
  // No direct gateway.dispose(): the production listener owns this teardown.
  await host.server.dispose();
  expect(await body).toBe("cancelled");
  expect(host.gateway.activeLegCount()).toBe(0);
  await vi.waitFor(() => expect(upstream.lastResponse()?.destroyed).toBe(true));
});
