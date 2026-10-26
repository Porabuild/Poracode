import type { ForgeKind, ForgeRepository } from "@/shared/contracts";
import { ForgeApi, type ForgeHttpRequest } from "./api";
import { FORGE_CAPABILITIES } from "./connection";

// Shared by the adapter test suites: a repository bound to a fixture account and
// a route-table HTTP transport that fails on any request the test did not expect.

export function testSource(forge: ForgeKind): ForgeRepository {
  return {
    forge,
    host: "https://forge.example",
    repository: "team/app",
    remote: "origin",
    account: { forge, host: "https://forge.example", login: "viewer" },
    capabilities: structuredClone(FORGE_CAPABILITIES[forge]),
  };
}

/** Routes are keyed `"METHOD path"`, with the path below `/api/` and no query string. */
export function testTransport(routes: Record<string, unknown>) {
  const requests: ForgeHttpRequest[] = [];
  const api = new ForgeApi(
    "https://forge.example/api",
    { Authorization: "Bearer fixture" },
    async (request) => {
      requests.push(request);
      const path = new URL(request.url).pathname.replace(/^\/api\//, "");
      const key = `${request.method} ${path}`;
      if (!(key in routes)) throw new Error(`Unexpected request: ${key}`);
      const body = routes[key];
      return {
        status: 200,
        headers: {},
        body: typeof body === "string" ? body : JSON.stringify(body),
      };
    },
  );
  return {
    api,
    requests,
    writes: () =>
      requests
        .filter((r) => r.method !== "GET")
        .map((r) => ({
          method: r.method,
          path: new URL(r.url).pathname,
          query: new URL(r.url).search,
          body: r.body ? (JSON.parse(r.body) as unknown) : undefined,
        })),
  };
}
