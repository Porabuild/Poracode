import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenCode } from "@opencode/client";
import type { AcquiredOpenCode2Server } from "./client";

const acquire = vi.hoisted(() => vi.fn<() => Promise<AcquiredOpenCode2Server>>());
vi.mock("./client", () => ({
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
