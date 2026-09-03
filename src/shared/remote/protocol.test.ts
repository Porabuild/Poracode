import { describe, expect, it } from "vitest";
import { defaultSharedSettings } from "../settings";
import { LAUNCH_REMOTE_SERVER_SCRIPT } from "../sshRemoteScripts";
import {
  PORACODE_REMOTE_PROTOCOL_VERSION,
  pickRemoteSettings,
  remotePushRegistrationSchema,
  remoteSettingsPatchSchema,
  remoteShellSnapshotSchema,
  remoteThreadSnapshotSchema,
} from "./protocol";

describe("remote thread snapshots", () => {
  const thread = {
    id: "thread-1",
    projectId: "project-1",
    title: "Thread",
    agentKind: "claude",
    config: { model: "default" },
    status: "working",
    attention: "none",
    canResumeWithConfig: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("accepts authoritative background tasks and legacy snapshots without them", () => {
    const base = {
      snapshotSeq: 1,
      thread,
      runtimeItems: [],
      completedTurns: [],
      contextUsage: null,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    expect(remoteThreadSnapshotSchema.parse(base).backgroundTasks).toBeUndefined();
    expect(
      remoteThreadSnapshotSchema.parse({
        ...base,
        backgroundTasks: [{ taskId: "task-1", kind: "command", description: "pnpm test" }],
      }).backgroundTasks,
    ).toEqual([{ taskId: "task-1", kind: "command", description: "pnpm test" }]);
  });

  it("preserves a thread's pinned WSL execution environment", () => {
    expect(
      remoteThreadSnapshotSchema.parse({
        snapshotSeq: 1,
        thread: {
          ...thread,
          config: {
            model: "default",
            executionEnvironment: { kind: "wsl", distro: "Ubuntu-24.04" },
          },
        },
        runtimeItems: [],
        completedTurns: [],
        contextUsage: null,
        updatedAt: "2026-01-01T00:00:00.000Z",
      }).thread.config.executionEnvironment,
    ).toEqual({ kind: "wsl", distro: "Ubuntu-24.04" });
    expect(PORACODE_REMOTE_PROTOCOL_VERSION).toBe(9);
    expect(LAUNCH_REMOTE_SERVER_SCRIPT).toContain("descriptor.protocolVersion === 9");
  });
});

describe("remote push registrations", () => {
  const subscription = {
    endpoint: "https://web.push.apple.com/subscription-1",
    expirationTime: null,
    keys: { p256dh: "key-1", auth: "auth-1" },
  };

  it("accepts an installed-web-app subscription and route base", () => {
    expect(
      remotePushRegistrationSchema.parse({
        deviceId: "browser-1234",
        platform: "web",
        webPushSubscription: subscription,
        webAppBasePath: "/app",
      }),
    ).toMatchObject({ platform: "web", webPushSubscription: subscription });
  });

  it("rejects native credentials on web and web subscriptions on native", () => {
    expect(
      remotePushRegistrationSchema.safeParse({
        deviceId: "browser-1234",
        platform: "web",
        deviceToken: "not-allowed",
        webPushSubscription: subscription,
        webAppBasePath: "/",
      }).success,
    ).toBe(false);
    expect(
      remotePushRegistrationSchema.safeParse({
        deviceId: "native-1234",
        platform: "ios",
        webPushSubscription: subscription,
      }).success,
    ).toBe(false);
  });
});

describe("remote project snapshots", () => {
  it("strip MCP definitions because env and headers may contain secrets", () => {
    const snapshot = remoteShellSnapshotSchema.parse({
      snapshotSeq: 1,
      projects: [
        {
          id: "project-1",
          name: "Project",
          location: { kind: "posix", path: "/repo" },
          createdAt: "2026-01-01T00:00:00.000Z",
          mcpServers: [
            {
              id: "secret-server",
              name: "private",
              description: "",
              enabled: true,
              timeoutMs: 30_000,
              transport: {
                type: "http",
                url: "https://example.test/mcp",
                headers: { Authorization: "Bearer secret" },
              },
            },
          ],
        },
      ],
      threads: [],
      runtimeSummariesByThread: {},
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(snapshot.projects).toHaveLength(1);
    expect(snapshot.projects[0]).not.toHaveProperty("mcpServers");
    expect(JSON.stringify(snapshot)).not.toContain("Bearer secret");
  });
});

describe("remote settings", () => {
  it("exposes composer MCP enablement without exposing custom MCP definitions", () => {
    const settings = pickRemoteSettings({
      ...defaultSharedSettings,
      enabledMcpServers: { browser: true, crossagents: false, "computer-use": true },
      disabledBuiltInMcpServers: { chrome: true },
      mcpServers: [
        {
          id: "secret-server",
          name: "private",
          description: "",
          enabled: true,
          timeoutMs: 30_000,
          transport: {
            type: "http",
            url: "https://example.test/mcp",
            headers: { Authorization: "Bearer secret" },
          },
        },
      ],
    });

    expect(settings.enabledMcpServers).toEqual({
      browser: true,
      crossagents: false,
      "computer-use": true,
    });
    expect(settings.disabledBuiltInMcpServers).toEqual({ chrome: true });
    expect(settings).not.toHaveProperty("mcpServers");
    expect(JSON.stringify(settings)).not.toContain("Bearer secret");
  });

  it("does not inject empty MCP maps into an unrelated settings patch", () => {
    expect(remoteSettingsPatchSchema.parse({ titleGenProvider: "claude" })).toEqual({
      titleGenProvider: "claude",
    });
  });

  it("never exposes or accepts sensitive agent settings", () => {
    const settings = pickRemoteSettings({
      ...defaultSharedSettings,
      agentSettings: {
        cursor: {
          structuredRuntime: "sdk",
          sdkApiKey: "lc-safe:encrypted-secret",
        },
      },
    });

    expect(settings.agentSettings.cursor).toEqual({ structuredRuntime: "sdk" });
    expect(
      remoteSettingsPatchSchema.parse({
        agentSettings: {
          cursor: {
            structuredRuntime: "acp",
            sdkApiKey: "plaintext-secret",
          },
        },
      }).agentSettings?.cursor,
    ).toEqual({ structuredRuntime: "acp" });
  });
});
