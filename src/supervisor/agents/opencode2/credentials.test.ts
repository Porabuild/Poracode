import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  legacy: vi.fn<typeof import("./client").listOpenCode2LegacyOAuthCredentials>(),
  acquire: vi.fn<typeof import("./client").acquireOpenCode2Server>(),
  remove: vi.fn<typeof import("./client").removeOpenCode2Credential>(),
}));
vi.mock("./client", () => ({
  listOpenCode2LegacyOAuthCredentials: mocks.legacy,
  acquireOpenCode2Server: mocks.acquire,
  removeOpenCode2Credential: mocks.remove,
  resolveOpenCode2SessionDirectory: () => "/fixture",
}));
import {
  buildOpenCode2StatusFromIntegrations,
  openCode2ConnectedProviders,
  readOpenCode2Integrations,
  readOpenCode2LegacyProviders,
  manageOpenCode2Credentials,
} from "./credentials";

beforeEach(() => {
  mocks.legacy.mockReset().mockResolvedValue([]);
  mocks.acquire.mockReset();
  mocks.remove.mockReset().mockResolvedValue(undefined);
});

it("shows removable legacy OAuth rows without reporting native authentication", async () => {
  mocks.legacy.mockResolvedValue([
    {
      id: "legacy-oauth",
      integrationID: "fixture",
      label: "Work",
      active: true,
      value: {
        type: "oauth",
        methodID: "fixture",
        access: "synthetic-access",
        refresh: "synthetic-refresh",
        expires: 200,
      },
    },
  ]);
  const legacy = await readOpenCode2LegacyProviders({ kind: "posix", path: "/fixture" }, []);
  expect(legacy).toEqual([
    {
      id: "legacy-oauth",
      label: "fixture · Work",
      detail: "Previous sessions; sign in again for new threads.",
    },
  ]);
  expect(buildOpenCode2StatusFromIntegrations([], legacy)).toEqual({
    authState: "missing",
    providerMetadata: { connectedProviders: legacy },
  });
});

it("routes sign-out through the two-database revocation barrier", async () => {
  const dispose = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  mocks.acquire.mockResolvedValue({
    client: {
      integration: { list: vi.fn<() => Promise<{ data: [] }>>().mockResolvedValue({ data: [] }) },
    },
    dispose,
  } as unknown as import("./client").AcquiredOpenCode2Server);
  const result = await manageOpenCode2Credentials({
    env: { kind: "native" },
    action: "remove",
    credentialId: "legacy-oauth",
  });
  expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ kind: process.platform === "win32" ? "windows" : "posix" }),
    "legacy-oauth",
  );
  expect(result.providers).toEqual([]);
  expect(dispose).toHaveBeenCalledTimes(1);
});

describe("readOpenCode2Integrations", () => {
  it("splits stored credentials from environment-backed providers", () => {
    expect(
      readOpenCode2Integrations([
        {
          id: "anthropic",
          name: "Anthropic",
          connections: [
            { type: "credential", id: "cred_1", label: "work key" },
            { type: "env", name: "ANTHROPIC_API_KEY" },
          ],
        },
        { id: "opencode", name: "OpenCode Zen", connections: [] },
      ]),
    ).toEqual([
      {
        id: "anthropic",
        name: "Anthropic",
        credentials: [{ id: "cred_1", label: "work key" }],
        envBacked: true,
      },
      { id: "opencode", name: "OpenCode Zen", credentials: [], envBacked: false },
    ]);
  });
});

describe("openCode2ConnectedProviders", () => {
  it("emits one removable row per stored credential", () => {
    expect(
      openCode2ConnectedProviders([
        {
          id: "anthropic",
          name: "Anthropic",
          credentials: [
            { id: "cred_1", label: "work key" },
            { id: "cred_2", label: "personal key" },
          ],
          envBacked: false,
        },
      ]),
    ).toEqual([
      { label: "Anthropic", id: "cred_1", detail: "work key" },
      { label: "Anthropic", id: "cred_2", detail: "personal key" },
    ]);
  });

  it("drops a credential label that only repeats the provider name", () => {
    expect(
      openCode2ConnectedProviders([
        {
          id: "opencode",
          name: "OpenCode Zen",
          credentials: [{ id: "cred_3", label: "OpenCode Zen" }],
          envBacked: false,
        },
      ]),
    ).toEqual([{ label: "OpenCode Zen", id: "cred_3" }]);
  });

  it("omits environment-backed providers, which have nothing to sign out of", () => {
    expect(
      openCode2ConnectedProviders([
        { id: "anthropic", name: "Anthropic", credentials: [], envBacked: true },
      ]),
    ).toEqual([]);
  });
});

describe("buildOpenCode2StatusFromIntegrations", () => {
  it("reports the connected providers it can manage", () => {
    expect(
      buildOpenCode2StatusFromIntegrations([
        {
          id: "opencode",
          name: "OpenCode Zen",
          credentials: [{ id: "cred_1", label: "OpenCode Zen" }],
          envBacked: false,
        },
      ]),
    ).toEqual({
      authState: "authenticated",
      providerMetadata: { connectedProviders: [{ label: "OpenCode Zen", id: "cred_1" }] },
    });
  });

  it("stays authenticated for an environment-backed provider with no stored credential", () => {
    expect(
      buildOpenCode2StatusFromIntegrations([
        { id: "anthropic", name: "Anthropic", credentials: [], envBacked: true },
      ]),
    ).toEqual({ authState: "authenticated" });
  });

  it("reports missing auth when nothing is connected", () => {
    expect(
      buildOpenCode2StatusFromIntegrations([
        { id: "opencode", name: "OpenCode Zen", credentials: [], envBacked: false },
      ]),
    ).toEqual({ authState: "missing" });
  });
});
