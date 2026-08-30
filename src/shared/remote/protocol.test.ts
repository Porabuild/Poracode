import { describe, expect, it } from "vitest";
import { defaultSharedSettings } from "../settings";
import {
  pickRemoteSettings,
  remotePushRegistrationSchema,
  remoteSettingsPatchSchema,
  remoteShellSnapshotSchema,
  remoteTerminalCursorSchema,
  remoteTerminalOutputCursorSyncV1Schema,
  remoteTerminalWatchResultReadySchema,
  remoteWebSocketServerMessageSchema,
  TERMINAL_CURSOR_SYNC_VERSION,
} from "./protocol";

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
    expect(
      remotePushRegistrationSchema.safeParse({
        deviceId: "native-1234",
        platform: "ios",
        routing: {
          version: 1,
          clientConnectionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          desktopId: "bad\u0000desktop",
        },
      }).success,
    ).toBe(false);
  });

  it("accepts complete native push-routing v1 and normalizes its UUID", () => {
    expect(
      remotePushRegistrationSchema.parse({
        deviceId: "native-1234",
        platform: "ios",
        routing: {
          version: 1,
          clientConnectionId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
          desktopId: "desktop-1",
        },
      }).routing,
    ).toEqual({
      version: 1,
      clientConnectionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      desktopId: "desktop-1",
    });
  });

  it("accepts native alert preferences and rejects them on web", () => {
    const alertPreferences = {
      sound: false,
      statuses: { done: true, needsAttention: false, error: true },
    };
    expect(
      remotePushRegistrationSchema.parse({
        deviceId: "native-1234",
        platform: "ios",
        alertPreferences,
      }).alertPreferences,
    ).toEqual(alertPreferences);
    expect(
      remotePushRegistrationSchema.safeParse({
        deviceId: "browser-1234",
        platform: "web",
        webPushSubscription: subscription,
        webAppBasePath: "/",
        alertPreferences,
      }).success,
    ).toBe(false);
  });

  it("rejects malformed, incomplete, and web push-routing identities", () => {
    expect(
      remotePushRegistrationSchema.safeParse({
        deviceId: "native-1234",
        platform: "android",
        routing: { version: 1, clientConnectionId: "not-a-uuid", desktopId: "desktop-1" },
      }).success,
    ).toBe(false);
    expect(
      remotePushRegistrationSchema.safeParse({
        deviceId: "native-1234",
        platform: "android",
        routing: { version: 1, desktopId: "desktop-1" },
      }).success,
    ).toBe(false);
    expect(
      remotePushRegistrationSchema.safeParse({
        deviceId: "browser-1234",
        platform: "web",
        webPushSubscription: subscription,
        webAppBasePath: "/",
        routing: {
          version: 1,
          clientConnectionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          desktopId: "desktop-1",
        },
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

  it("exposes and accepts the selected host's worktree placement settings", () => {
    const settings = pickRemoteSettings({
      ...defaultSharedSettings,
      worktreeStorageMode: "global",
      worktreeBasePath: "D:\\worktrees",
      wslWorktreeBasePath: "/mnt/wsl-worktrees",
    });

    expect(settings).toMatchObject({
      worktreeStorageMode: "global",
      worktreeBasePath: "D:\\worktrees",
      wslWorktreeBasePath: "/mnt/wsl-worktrees",
    });
    expect(
      remoteSettingsPatchSchema.parse({
        worktreeStorageMode: "project-relative",
        worktreeBasePath: "E:\\worktrees",
        wslWorktreeBasePath: "/home/me/worktrees",
      }),
    ).toEqual({
      worktreeStorageMode: "project-relative",
      worktreeBasePath: "E:\\worktrees",
      wslWorktreeBasePath: "/home/me/worktrees",
    });
  });

  it("keeps AI helper fast mode on the selected host", () => {
    const settings = pickRemoteSettings({
      ...defaultSharedSettings,
      titleGenFast: true,
      commitGenFast: true,
      conflictResolverFast: true,
      wslTitleGenFast: true,
      wslCommitGenFast: true,
      wslConflictResolverFast: true,
    });

    expect(settings).toMatchObject({
      titleGenFast: true,
      commitGenFast: true,
      conflictResolverFast: true,
      wslTitleGenFast: true,
      wslCommitGenFast: true,
      wslConflictResolverFast: true,
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

describe("remote terminal cursor-sync schemas", () => {
  const validReady = {
    status: "ready" as const,
    generation: "gen-1",
    fromCursor: 0,
    toCursor: 5,
    data: "hello",
    processState: "running" as const,
    terminalSize: { cols: 80, rows: 24 },
  };

  it("accepts ready ranges with matching UTF-16 data length and generation null", () => {
    expect(remoteTerminalWatchResultReadySchema.parse(validReady)).toEqual(validReady);
    const nullGen = {
      ...validReady,
      generation: null,
      fromCursor: 10,
      toCursor: 10,
      data: "",
      processState: "exited" as const,
      terminalSize: null,
    };
    expect(remoteTerminalWatchResultReadySchema.parse(nullGen)).toEqual(nullGen);

    const unicode = "a\u{1F600}e\u0301";
    expect(unicode.length).toBe(5);
    expect(
      remoteTerminalWatchResultReadySchema.parse({
        ...validReady,
        fromCursor: 100,
        toCursor: 100 + unicode.length,
        data: unicode,
      }).data.length,
    ).toBe(5);
  });

  it("rejects reversed, mismatched, fractional, and unsafe cursors on ready results", () => {
    expect(
      remoteTerminalWatchResultReadySchema.safeParse({
        ...validReady,
        fromCursor: 6,
        toCursor: 5,
      }).success,
    ).toBe(false);
    expect(
      remoteTerminalWatchResultReadySchema.safeParse({
        ...validReady,
        fromCursor: 0,
        toCursor: 4,
        data: "hello",
      }).success,
    ).toBe(false);
    expect(remoteTerminalCursorSchema.safeParse(1.5).success).toBe(false);
    expect(remoteTerminalCursorSchema.safeParse(-1).success).toBe(false);
    expect(remoteTerminalCursorSchema.safeParse(Number.MAX_SAFE_INTEGER + 1).success).toBe(false);
    expect(
      remoteTerminalWatchResultReadySchema.safeParse({
        ...validReady,
        fromCursor: 1.5,
        toCursor: 6.5,
      }).success,
    ).toBe(false);
  });

  it("rejects reversed/mismatched output cursorSync while preserving legacy frames", () => {
    expect(
      remoteTerminalOutputCursorSyncV1Schema.parse({
        version: TERMINAL_CURSOR_SYNC_VERSION,
        watchId: "w1",
        generation: "g1",
        fromCursor: 0,
        toCursor: 3,
      }),
    ).toMatchObject({ fromCursor: 0, toCursor: 3 });

    expect(
      remoteTerminalOutputCursorSyncV1Schema.safeParse({
        version: TERMINAL_CURSOR_SYNC_VERSION,
        watchId: "w1",
        generation: "g1",
        fromCursor: 5,
        toCursor: 3,
      }).success,
    ).toBe(false);

    expect(
      remoteWebSocketServerMessageSchema.safeParse({
        type: "terminal-output",
        id: "t1",
        data: "hi",
        cursorSync: {
          version: TERMINAL_CURSOR_SYNC_VERSION,
          watchId: "w1",
          generation: "g1",
          fromCursor: 0,
          toCursor: 5,
        },
      }).success,
    ).toBe(false);

    const legacy = remoteWebSocketServerMessageSchema.parse({
      type: "terminal-output",
      id: "t1",
      data: "legacy frame",
    });
    expect(legacy).toEqual({ type: "terminal-output", id: "t1", data: "legacy frame" });
    expect(legacy).not.toHaveProperty("cursorSync");

    const matched = remoteWebSocketServerMessageSchema.parse({
      type: "terminal-output",
      id: "t1",
      data: "abc",
      cursorSync: {
        version: TERMINAL_CURSOR_SYNC_VERSION,
        watchId: "w1",
        generation: "g1",
        fromCursor: 10,
        toCursor: 13,
      },
    });
    expect(matched).toMatchObject({
      data: "abc",
      cursorSync: { fromCursor: 10, toCursor: 13 },
    });
  });
});
