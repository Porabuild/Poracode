import { describe, expect, it, vi } from "vitest";
import type { HostPort, OAuthToken, UsageSnapshot } from "@poracode/agents-usage";
import { defaultSharedSettings } from "@/shared/settings";
import { createDevinUsageProfileSource } from "./usageProfiles";
import { resolveDevinExecutionContext } from "./profileContext";

const { collect } = vi.hoisted(() => ({
  collect: vi.fn<(id: string, host: HostPort) => Promise<UsageSnapshot>>(),
}));
vi.mock("@poracode/agents-usage", () => ({ createUsageCollectorRegistry: () => ({ collect }) }));
vi.mock("./profileContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./profileContext")>()),
  resolveDevinExecutionContext: vi.fn<typeof resolveDevinExecutionContext>(),
}));

function fixtureSettings() {
  const settings = structuredClone(defaultSharedSettings);
  const config = (auth: Record<string, string>) => ({ version: 1, auth, runtimeTarget: "local" });
  settings.agentInstances = {
    owner: { id: "owner", driver: "devin", config: config({ kind: "isolated-owner" }) },
    reference: {
      id: "reference",
      driver: "devin",
      config: config({ kind: "owner-reference", ownerId: "owner" }),
    },
    shared: { id: "shared", driver: "devin", config: config({ kind: "native-default" }) },
    disabled: {
      id: "disabled",
      driver: "devin",
      enabled: false,
      config: config({ kind: "isolated-owner" }),
    },
    broken: {
      id: "broken",
      driver: "devin",
      config: config({ kind: "owner-reference", ownerId: "missing" }),
    },
  };
  return settings;
}
const native: OAuthToken = { accessToken: "native-token" };
const host: HostPort = {
  now: () => 123,
  credentials: { getOAuthToken: async () => native, getSecret: async () => undefined },
  http: {
    request: async () => {
      throw new Error("Unexpected HTTP");
    },
  },
};

function resolvedContext() {
  vi.mocked(resolveDevinExecutionContext).mockResolvedValue({
    ok: true,
    context: {
      generation: "opaque-owner-generation",
      roots: { credentialsPath: "/owned/account/credentials.toml" },
    },
  } as Awaited<ReturnType<typeof resolveDevinExecutionContext>>);
}

describe("Devin usage account attribution", () => {
  it("collects one meter per login source without provisioning roots", async () => {
    resolvedContext();
    const scoped: OAuthToken = { accessToken: "isolated-token" };
    const readScopedCredentials = vi.fn<(path: string) => Promise<OAuthToken | undefined>>(
      async () => scoped,
    );
    const source = createDevinUsageProfileSource(fixtureSettings(), { readScopedCredentials });
    expect(source.collectors.map((entry) => entry.providerId)).toEqual(["devin", "devin:owner"]);
    collect.mockImplementation(async (_id: string, scopedHost: HostPort) => ({
      providerId: "devin",
      status: "ok",
      fetchedAt: 123,
      windows: [],
      account: { label: (await scopedHost.credentials.getOAuthToken("devin"))?.accessToken },
    }));
    const snapshots = await Promise.all(source.collectors.map((entry) => entry.collect(host)));
    expect(snapshots.map((entry) => entry.providerId)).toEqual(["devin", "devin:owner"]);
    expect(readScopedCredentials).toHaveBeenCalledWith("/owned/account/credentials.toml");
    expect(resolveDevinExecutionContext).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { provision: false },
    );
    const calls = collect.mock.calls.slice(-2);
    expect(await (calls[0]![1] as HostPort).credentials.getOAuthToken("devin")).toEqual(native);
    expect(await (calls[1]![1] as HostPort).credentials.getOAuthToken("devin")).toEqual(scoped);
  });

  it("changes opaque cache identity on credential replacement or logout", async () => {
    resolvedContext();
    let credential: OAuthToken | undefined = { accessToken: "private-account-a" };
    const source = createDevinUsageProfileSource(fixtureSettings(), {
      readScopedCredentials: async () => credential,
    });
    const owner = source.collectors.find((entry) => entry.providerId === "devin:owner")!;
    const first = await owner.cacheIdentity!(host);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain("private-account-a");
    credential = { accessToken: "private-account-b" };
    expect(await owner.cacheIdentity!(host)).not.toEqual(first);
    credential = undefined;
    expect(await owner.cacheIdentity!(host)).not.toEqual(first);
  });

  it("never falls back to native credentials for an unavailable isolated root", async () => {
    vi.mocked(resolveDevinExecutionContext).mockResolvedValue({
      ok: false,
      code: "provision-failed",
      message: "private diagnostic",
    });
    const readScopedCredentials = vi.fn<(path: string) => Promise<OAuthToken | undefined>>(
      async () => native,
    );
    const owner = createDevinUsageProfileSource(fixtureSettings(), { readScopedCredentials })
      .collectors[1]!;
    const before = collect.mock.calls.length;
    expect(await owner.collect(host)).toEqual({
      providerId: "devin:owner",
      status: "unsupported",
      fetchedAt: 123,
      windows: [],
    });
    expect(collect.mock.calls).toHaveLength(before);
    expect(readScopedCredentials).not.toHaveBeenCalled();
  });
});
