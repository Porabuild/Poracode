import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenCode } from "@opencode/client";
import type { AcquiredOpenCode2Server } from "./client";

const acquire = vi.hoisted(() => vi.fn<() => Promise<AcquiredOpenCode2Server>>());
vi.mock("./client", () => ({
  listOpenCode2LegacyOAuthCredentials: vi
    .fn<typeof import("./client").listOpenCode2LegacyOAuthCredentials>()
    .mockResolvedValue([]),
  acquireOpenCode2Server: acquire,
  resolveOpenCode2SessionDirectory: () => "/repo",
}));

import { openCode2DetectionSpec } from "./detection";

afterEach(() => vi.restoreAllMocks());

describe("OpenCode 2 catalog discovery", () => {
  it.each([
    { version: "2.0.26", pathField: "location" },
    { version: "2.0.26", pathField: "path" },
  ])("discovers providers and models on $version", async ({ version, pathField }) => {
    const model = {
      providerID: "upstream",
      id: "chat-model",
      name: "Chat model",
      enabled: true,
      variants: [{ id: "high" }],
      limit: { context: 128_000 },
    };
    const catalog: Record<string, unknown> = {
      "/api/plugin": [{ source: { type: "builtin" }, state: { status: "active" } }],
      "/api/model": [model],
      "/api/model/default": model,
      "/api/provider": [{ id: "upstream", name: "Upstream" }],
      "/api/agent": [{ id: "plan", name: "Plan", mode: "primary", hidden: false }],
      "/api/command": [],
      "/api/skill": [
        { id: "review", name: "Review", [pathField]: "/repo/.agents/skills/review/SKILL.md" },
      ],
      "/api/integration": [
        {
          id: "upstream",
          name: "Upstream",
          connections: [{ type: "credential", id: "key", label: "Work" }],
        },
      ],
    };
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("location[directory]")).toBe("/repo");
      return Response.json({ location: { directory: "/repo" }, data: catalog[url.pathname] });
    });
    const dispose = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    acquire.mockResolvedValue({
      client: OpenCode.make({ baseUrl: "http://localhost:4096", fetch }),
      dispose,
    } as unknown as AcquiredOpenCode2Server);
    const ctx = {
      location: { kind: "posix" as const, path: "/repo" },
      executablePath: "opencode2",
      version,
    };
    const [capabilities, status] = await Promise.all([
      openCode2DetectionSpec.capabilitiesProbe?.(ctx),
      openCode2DetectionSpec.statusProbe?.(ctx),
    ]);
    expect(capabilities).toMatchObject({
      models: [{ id: "upstream/chat-model", label: "Chat model" }],
      subProviders: [{ id: "upstream", label: "Upstream" }],
      modelEfforts: { "upstream/chat-model": ["high"] },
      modes: ["agent", "plan"],
      slashCommands: expect.arrayContaining([
        expect.objectContaining({ skillName: "review", skillScope: "project" }),
      ]),
    });
    expect(status).toMatchObject({
      authState: "authenticated",
      providerMetadata: {
        connectedProviders: [{ id: "key", label: "Upstream", detail: "Work" }],
      },
    });
    expect(acquire).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledExactlyOnceWith({ closeServerIfIdle: true });
  });
});

it("refreshes models and capability metadata after a configured provider disconnects", async () => {
  const removedModel = {
    providerID: "openrouter",
    id: "chat",
    name: "Removed model",
    enabled: true,
    variants: [{ id: "high" }],
    limit: { context: 128_000 },
  };
  const retainedModel = {
    ...removedModel,
    providerID: "gateway",
    name: "Retained model",
    variants: [{ id: "low" }],
    limit: { context: 256_000 },
  };
  const catalog: Record<string, unknown> = {
    "/api/plugin": [{ source: { type: "builtin" }, state: { status: "active" } }],
    "/api/model": [removedModel, retainedModel],
    "/api/model/default": removedModel,
    "/api/provider": [
      {
        id: "openrouter",
        name: "OpenRouter",
        integrationID: "openrouter",
        activation: "enabled",
        package: "@opencode/ai/providers/openrouter",
      },
      {
        id: "gateway",
        name: "Gateway",
        integrationID: "connected",
        activation: "auto",
        package: "@opencode/ai/providers/openai-compatible",
      },
    ],
    "/api/agent": [],
    "/api/command": [],
    "/api/skill": [],
  };
  let connected = true;
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input) => {
    const url = new URL(String(input));
    const data =
      url.pathname === "/api/integration"
        ? [
            {
              id: "openrouter",
              name: "OpenRouter",
              connections: connected ? [{ type: "credential", id: "key", label: "API key" }] : [],
            },
            {
              id: "connected",
              name: "Connected",
              connections: [{ type: "env", name: "CONNECTED_API_KEY" }],
            },
          ]
        : catalog[url.pathname];
    return Response.json({ location: { directory: "/repo" }, data });
  });
  acquire.mockResolvedValue({
    client: OpenCode.make({ baseUrl: "http://localhost:4096", fetch }),
    dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as AcquiredOpenCode2Server);
  const ctx = {
    location: { kind: "posix" as const, path: "/repo" },
    executablePath: "opencode2",
    version: "2.0.26",
  };
  expect((await openCode2DetectionSpec.capabilitiesProbe?.(ctx))?.models).toHaveLength(2);
  connected = false;
  const capabilities = await openCode2DetectionSpec.capabilitiesProbe?.(ctx);
  expect(capabilities).toMatchObject({
    models: [{ id: "gateway/chat", label: "Retained model" }],
    subProviders: [{ id: "gateway", label: "Gateway" }],
    modelEfforts: { "gateway/chat": ["low"] },
    modelContextSizes: { "gateway/chat": ["256K"] },
    contextSizes: [{ id: "256K", label: "256K" }],
    efforts: [],
  });
  expect(capabilities?.modelContextSizes).not.toHaveProperty("openrouter/chat");
  expect(capabilities?.modelEfforts).not.toHaveProperty("openrouter/chat");
  expect(capabilities?.defaultEffort).toBeUndefined();
  connected = true;
  expect((await openCode2DetectionSpec.capabilitiesProbe?.(ctx))?.models).toHaveLength(2);
});
