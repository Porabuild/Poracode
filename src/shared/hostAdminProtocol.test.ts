import { describe, expect, it } from "vitest";
import {
  hostAdminCommandSchema,
  hostAdminRequest,
  hostAdminRequestSchema,
  hostAdminV1RequestSchema,
  hostAdminV1ResultSchema,
  hostAdminResultSchema,
  hostAdminV2CommandSchema,
  hostAdminV3CommandSchema,
  hostAdminV4CommandSchema,
  hostAdminV5CommandSchema,
  hostAdminV6CommandSchema,
  hostAdminV7CommandSchema,
  hostAdminMcpChangeResultSchema,
  hostAdminMcpDefinitionSchema,
  hostAdminMcpDefinitionResultSchema,
  hostAdminMcpInventorySchema,
  hostAdminV8CommandSchema,
  hostAdminSessionListSchema,
  hostAdminSessionStopSchema,
  hostAdminSessionUpdateSchema,
  hostAdminV9CommandSchema,
  hostAdminMcpCreationCheckSchema,
  hostAdminV10CommandSchema,
  hostAdminV11CommandSchema,
  hostAdminPluginAccountsSchema,
} from "./hostAdminProtocol";

describe("local administration version custody", () => {
  it("negotiates exact request custody under admin23 and retains closed admin22", () => {
    const command = {
      action: "run-interactive-prepare" as const,
      command: {
        action: "run-prepare" as const,
        projectId: "project",
        agentKind: "neutral",
        model: "model",
        prompt: "Review",
      },
    };
    expect(hostAdminRequest(command)).toEqual({ adminVersion: 23, command });
    expect(hostAdminRequestSchema.parse({ adminVersion: 22, command })).toEqual({
      adminVersion: 22,
      command,
    });
    for (let adminVersion = 1; adminVersion <= 21; adminVersion++)
      expect(hostAdminRequestSchema.safeParse({ adminVersion, command }).success).toBe(false);
    expect(
      hostAdminRequestSchema.safeParse({
        adminVersion: 22,
        command: { ...command, command: { ...command.command, credentialKey: "foreign" } },
      }).success,
    ).toBe(false);
    expect(hostAdminRequestSchema.safeParse({ adminVersion: 24, command }).success).toBe(false);
    expect(
      hostAdminResultSchema.parse({ adminVersion: 22, outcome: { ok: true, data: {} } })
        .adminVersion,
    ).toBe(22);
    expect(
      hostAdminResultSchema.parse({ adminVersion: 23, outcome: { ok: true, data: {} } })
        .adminVersion,
    ).toBe(23);
    expect(
      hostAdminRequest({
        action: "run-request-read",
        runId: "187b821c-8453-4b8f-afd3-f5538851dabb",
      }).adminVersion,
    ).toBe(23);
  });

  it("opts tool streams into admin24 while keeping v23 run requests closed and valid", () => {
    const prepare = {
      action: "run-prepare" as const,
      projectId: "project",
      agentKind: "neutral",
      model: "model",
      prompt: "Inspect",
    };
    const optedIn = { action: "run-tool-events-prepare" as const, command: prepare };
    expect(hostAdminRequest(optedIn)).toEqual({ adminVersion: 24, command: optedIn });
    expect(hostAdminRequestSchema.safeParse({ adminVersion: 23, command: optedIn }).success).toBe(
      false,
    );
    expect(hostAdminRequest(prepare)).toEqual({ adminVersion: 15, command: prepare });
    expect(
      hostAdminRequestSchema.parse({
        adminVersion: 23,
        command: {
          action: "run-interactive-prepare",
          command: prepare,
        },
      }).adminVersion,
    ).toBe(23);
    expect(
      hostAdminResultSchema.parse({ adminVersion: 24, outcome: { ok: true, data: {} } })
        .adminVersion,
    ).toBe(24);
  });

  it.each([
    {
      action: "run-files-prepare",
      projectId: "project",
      agentKind: "neutral",
      model: "model",
      prompt: "Review",
      files: ["/owned/file.txt"],
    },
    {
      action: "run-resume-files-prepare",
      threadId: "thread",
      prompt: "Review",
      files: ["/owned/file.txt"],
    },
    {
      action: "run-directory-files-prepare",
      directory: "/owned/repo",
      agentKind: "neutral",
      model: "model",
      prompt: "Review",
      files: ["/owned/file.txt"],
    },
  ] as const)("requires closed v21 before file custody: %j", (command) => {
    const input = { ...command, files: [...command.files] };
    expect(hostAdminRequest(input)).toEqual({ adminVersion: 21, command });
    expect(hostAdminRequestSchema.parse(hostAdminRequest(input))).toEqual({
      adminVersion: 21,
      command,
    });
    for (let adminVersion = 1; adminVersion <= 20; adminVersion++)
      expect(hostAdminRequestSchema.safeParse({ adminVersion, command }).success).toBe(false);
    expect(
      hostAdminResultSchema.parse({ adminVersion: 21, outcome: { ok: true, data: {} } })
        .adminVersion,
    ).toBe(21);
    for (const extra of [
      { files: [] },
      { files: Array(17).fill("/owned/file.txt") },
      { files: [""] },
      { files: [{ path: "/owned/file.txt", data: "bytes" }] },
      { credentialKey: "foreign" },
      { data: "bytes" },
    ])
      expect(
        hostAdminRequestSchema.safeParse({ adminVersion: 21, command: { ...command, ...extra } })
          .success,
      ).toBe(false);
  });
  it.each([
    { action: "run-directory-options", directory: "/owned/repo", agentKind: "neutral" },
    {
      action: "run-directory-prepare",
      directory: "/owned/repo",
      agentKind: "neutral",
      model: "model",
      prompt: "Explain",
    },
  ] as const)("requires closed v20 before directory registration: %j", (command) => {
    expect(hostAdminRequest(command)).toEqual({ adminVersion: 20, command });
    for (let adminVersion = 1; adminVersion <= 19; adminVersion++)
      expect(hostAdminRequestSchema.safeParse({ adminVersion, command }).success).toBe(false);
    expect(hostAdminRequestSchema.safeParse({ adminVersion: 21, command }).success).toBe(false);
    expect(
      hostAdminResultSchema.safeParse({ adminVersion: 20, outcome: { ok: true, data: {} } })
        .success,
    ).toBe(true);
    expect(
      hostAdminResultSchema.safeParse({ adminVersion: 24, outcome: { ok: true, data: {} } })
        .success,
    ).toBe(true);
    for (const extra of [
      { projectId: "other" },
      { wslDistro: "Selected" },
      { credentialKey: "private" },
      { signal: {} },
      { account: "foreign" },
    ])
      expect(
        hostAdminRequestSchema.safeParse({ adminVersion: 20, command: { ...command, ...extra } })
          .success,
      ).toBe(false);
    expect(
      hostAdminRequest({
        action: "run-read",
        runId: "187b821c-8453-4b8f-afd3-f5538851dabb",
        cursor: 0,
      }).adminVersion,
    ).toBe(15);
  });
  it("keeps existing requests and replies readable by the closed v1 peer", () => {
    const request = hostAdminRequest({ action: "clients-list" });
    expect(request).toEqual({ adminVersion: 1, command: { action: "clients-list" } });
    expect(hostAdminV1RequestSchema.parse(request)).toEqual(request);
    const reply = { adminVersion: 1, outcome: { ok: true, data: { clients: [] } } };
    expect(hostAdminV1ResultSchema.parse(hostAdminResultSchema.parse(reply))).toEqual(reply);
  });

  it("requires v2 before a new action can reach an owner", () => {
    const command = { action: "providers-remove", instanceId: "work" } as const;
    expect(hostAdminCommandSchema.safeParse(command).success).toBe(false);
    expect(hostAdminRequestSchema.safeParse({ adminVersion: 1, command }).success).toBe(false);
    const request = hostAdminRequest(command);
    expect(request.adminVersion).toBe(2);
    expect(hostAdminV1RequestSchema.safeParse(request).success).toBe(false);
    expect(hostAdminRequestSchema.parse(request)).toEqual(request);
  });

  it.each([0, 25, 99])("refuses unsupported admin version %s", (adminVersion) => {
    expect(
      hostAdminRequestSchema.safeParse({ adminVersion, command: { action: "clients-list" } })
        .success,
    ).toBe(false);
    expect(
      hostAdminResultSchema.safeParse({ adminVersion, outcome: { ok: true, data: {} } }).success,
    ).toBe(false);
  });

  it.each([
    { kind: "rename", title: "New title" },
    { kind: "archive" },
    { kind: "unarchive" },
    { kind: "done" },
    { kind: "reopen" },
  ] as const)("isolates session metadata changes in closed v18 (%j)", (change) => {
    const command = { action: "sessions-update", threadId: "thread", change } as const;
    for (let adminVersion = 1; adminVersion <= 17; adminVersion++) {
      expect(hostAdminRequestSchema.safeParse({ adminVersion, command }).success).toBe(false);
      expect(
        hostAdminResultSchema.parse({ adminVersion, outcome: { ok: true, data: {} } }).adminVersion,
      ).toBe(adminVersion);
    }
    expect(hostAdminRequest(command)).toEqual({ adminVersion: 18, command });
    expect(hostAdminV1RequestSchema.safeParse(hostAdminRequest(command)).success).toBe(false);
  });

  it.each([
    { kind: "delete" },
    { kind: "rename", title: " " },
    { kind: "rename", title: "a".repeat(501) },
    { kind: "archive", force: true },
    { kind: "reopen", resume: true },
  ])("refuses unsupported session metadata payloads (%j)", (change) => {
    expect(
      hostAdminRequestSchema.safeParse({
        adminVersion: 18,
        command: { action: "sessions-update", threadId: "thread", change },
      }).success,
    ).toBe(false);
    expect(
      hostAdminSessionUpdateSchema.safeParse({
        formatVersion: 2,
        scope: "persisted-profile",
        change,
      }).success,
    ).toBe(false);
  });

  it("isolates passive inventory in closed v17 and preserves earlier version echoes", () => {
    const command = { action: "providers-inventory", refresh: false, wslDistro: "Ubuntu" } as const;
    for (let adminVersion = 1; adminVersion <= 16; adminVersion++) {
      expect(hostAdminRequestSchema.safeParse({ adminVersion, command }).success).toBe(false);
      expect(
        hostAdminResultSchema.parse({ adminVersion, outcome: { ok: true, data: {} } }).adminVersion,
      ).toBe(adminVersion);
    }
    expect(hostAdminRequest(command)).toEqual({ adminVersion: 17, command });
    expect(
      hostAdminResultSchema.parse({ adminVersion: 17, outcome: { ok: true, data: {} } })
        .adminVersion,
    ).toBe(17);
    for (const invalid of [
      { action: "providers-inventory" },
      { ...command, refresh: "false" },
      { ...command, wslDistro: "" },
      { ...command, runtime: "other" },
      { action: "providers-list" },
    ])
      expect(hostAdminRequestSchema.safeParse({ adminVersion: 17, command: invalid }).success).toBe(
        false,
      );
  });

  it("requires distinct closed v12 for catalog writes and retains prior version echoes", () => {
    const command = {
      action: "package-install",
      catalogId: "d41082c9-a0ae-49cd-a9e4-8ee7bce11f3d",
      entryName: "notes",
      reviewDigest: "ab".repeat(32),
    } as const;
    for (let adminVersion = 1; adminVersion <= 11; adminVersion++)
      expect(hostAdminRequestSchema.safeParse({ adminVersion, command }).success).toBe(false);
    expect(hostAdminRequest(command)).toEqual({ adminVersion: 12, command });
    expect(
      hostAdminResultSchema.parse({ adminVersion: 12, outcome: { ok: true, data: {} } })
        .adminVersion,
    ).toBe(12);
    for (const extra of [
      { credentialKey: "private" },
      { projectFsPath: "elsewhere" },
      { reviewDigest: "short" },
    ])
      expect(
        hostAdminRequestSchema.safeParse({ adminVersion: 12, command: { ...command, ...extra } })
          .success,
      ).toBe(false);
    expect(hostAdminRequest({ action: "plugins-list" }).adminVersion).toBe(4);
    expect(
      hostAdminRequest({ action: "plugin-accounts-list", pluginName: "notes" }).adminVersion,
    ).toBe(10);
  });

  it.each([
    { action: "sessions-export-start", threadId: "thread" },
    {
      action: "sessions-export-read",
      threadId: "thread",
      exportId: "d41082c9-a0ae-49cd-a9e4-8ee7bce11f3d",
      offset: 0,
    },
    {
      action: "sessions-export-cancel",
      threadId: "thread",
      exportId: "d41082c9-a0ae-49cd-a9e4-8ee7bce11f3d",
    },
  ] as const)("requires closed local v13 for snapshot export (%j)", (command) => {
    expect(hostAdminRequest(command)).toEqual({ adminVersion: 13, command });
    for (let adminVersion = 1; adminVersion <= 12; adminVersion++)
      expect(hostAdminRequestSchema.safeParse({ adminVersion, command }).success).toBe(false);
    for (const extra of [{ output: "private-path" }, { credentialKey: "private" }, { signal: {} }])
      expect(
        hostAdminRequestSchema.safeParse({ adminVersion: 13, command: { ...command, ...extra } })
          .success,
      ).toBe(false);
    expect(
      hostAdminResultSchema.parse({ adminVersion: 13, outcome: { ok: true, data: {} } })
        .adminVersion,
    ).toBe(13);
    expect(
      hostAdminRequestSchema.safeParse({ adminVersion: 13, command: { action: "clients-list" } })
        .success,
    ).toBe(false);
  });

  it.each([
    {
      action: "mcp-auth-start",
      operationId: "d41082c9-a0ae-49cd-a9e4-8ee7bce11f3d",
      serverId: "tools",
      expectedServerRevision: "ab".repeat(32),
    },
    {
      action: "mcp-auth-wait",
      operationId: "d41082c9-a0ae-49cd-a9e4-8ee7bce11f3d",
      serverId: "tools",
      expectedServerRevision: "ab".repeat(32),
    },
    {
      action: "plugin-account-start",
      operationId: "d41082c9-a0ae-49cd-a9e4-8ee7bce11f3d",
      pluginName: "fixture",
      serverName: "tools",
      label: "Work",
    },
    {
      action: "plugin-account-wait",
      operationId: "d41082c9-a0ae-49cd-a9e4-8ee7bce11f3d",
      pluginName: "fixture",
      serverName: "tools",
      accountId: "a41082c9-a0ae-49cd-a9e4-8ee7bce11f3d",
    },
    { action: "integration-auth-cancel", operationId: "d41082c9-a0ae-49cd-a9e4-8ee7bce11f3d" },
  ] as const)("requires closed local v11 for controlled login (%j)", (command) => {
    expect(hostAdminRequest(command)).toEqual({ adminVersion: 11, command });
    for (const adminVersion of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
      expect(hostAdminRequestSchema.safeParse({ adminVersion, command }).success).toBe(false);
    expect(
      hostAdminV11CommandSchema.safeParse({ ...command, credentialKey: "private" }).success,
    ).toBe(false);
    expect(hostAdminV11CommandSchema.safeParse({ ...command, signal: {} }).success).toBe(false);
    expect(
      hostAdminResultSchema.parse({ adminVersion: 11, outcome: { ok: true, data: {} } })
        .adminVersion,
    ).toBe(11);
  });

  it.each([
    { action: "plugin-accounts-list", pluginName: "fixture" },
    {
      action: "plugin-account-select",
      pluginName: "fixture",
      serverName: "tools",
      accountId: "a41082c9-a0ae-49cd-a9e4-8ee7bce11f3d",
    },
    {
      action: "plugin-account-logout",
      pluginName: "fixture",
      serverName: "tools",
      accountId: "a41082c9-a0ae-49cd-a9e4-8ee7bce11f3d",
    },
    { action: "mcp-auth-status", serverId: "tools" },
    { action: "mcp-auth-logout", serverId: "tools", expectedServerRevision: "ab".repeat(32) },
  ] as const)("keeps integration accounts in closed local v10 (%j)", (command) => {
    for (const adminVersion of [1, 2, 3, 4, 5, 6, 7, 8, 9])
      expect(hostAdminRequestSchema.safeParse({ adminVersion, command }).success).toBe(false);
    expect(hostAdminRequest(command)).toEqual({ adminVersion: 10, command });
    expect(
      hostAdminResultSchema.parse({ adminVersion: 10, outcome: { ok: true, data: {} } })
        .adminVersion,
    ).toBe(10);
    for (const extra of [
      { credentialKey: "private" },
      { url: "https://other.test/mcp" },
      { environment: {} },
    ])
      expect(hostAdminV10CommandSchema.safeParse({ ...command, ...extra }).success).toBe(false);
  });

  it("keeps plugin account output metadata-only and refuses future/private bodies", () => {
    const metadata = {
      formatVersion: 1,
      scope: "plugin-service-accounts",
      pluginName: "fixture",
      operation: "list",
      accounts: [],
    };
    expect(hostAdminPluginAccountsSchema.parse(metadata)).toEqual(metadata);
    for (const extra of [
      { formatVersion: 2 },
      { authorization: { status: "authorized" } },
      { token: "private" },
    ])
      expect(hostAdminPluginAccountsSchema.safeParse({ ...metadata, ...extra }).success).toBe(
        false,
      );
    expect(
      hostAdminV10CommandSchema.safeParse({ action: "plugin-account-login", pluginName: "fixture" })
        .success,
    ).toBe(false);
  });

  it("requires closed v9 for transport-free MCP creation checks while legacy writes stay v7", () => {
    const command = {
      action: "mcp-check-add",
      serverId: "exact-id",
      name: "fixture-server",
    } as const;
    for (const adminVersion of [1, 2, 3, 4, 5, 6, 7, 8])
      expect(hostAdminRequestSchema.safeParse({ adminVersion, command }).success).toBe(false);
    expect(hostAdminRequest(command)).toEqual({ adminVersion: 9, command });
    expect(
      hostAdminResultSchema.parse({ adminVersion: 9, outcome: { ok: true, data: {} } })
        .adminVersion,
    ).toBe(9);
    expect(hostAdminV9CommandSchema.safeParse({ action: "mcp-add", server: {} }).success).toBe(
      false,
    );
    for (const extra of [
      { transport: { type: "stdio", command: "private" } },
      { environment: {} },
      { credentialKey: "private" },
    ])
      expect(hostAdminV9CommandSchema.safeParse({ ...command, ...extra }).success).toBe(false);
    for (const name of ["poracode", "bad name", ""])
      expect(hostAdminV9CommandSchema.safeParse({ ...command, name }).success).toBe(false);
    const checked = {
      formatVersion: 1,
      scope: "saved-user",
      checked: true,
      serverId: command.serverId,
      name: command.name,
    };
    expect(hostAdminMcpCreationCheckSchema.parse(checked)).toEqual(checked);
    for (const extra of [
      { checked: false },
      { formatVersion: 2 },
      { scope: "plugin-account" },
      { secret: "private" },
    ])
      expect(hostAdminMcpCreationCheckSchema.safeParse({ ...checked, ...extra }).success).toBe(
        false,
      );
    expect(
      hostAdminRequest({
        action: "mcp-add",
        server: hostAdminMcpDefinitionSchema.parse({
          id: command.serverId,
          name: command.name,
          transport: { type: "stdio", command: "fixture" },
        }),
      }).adminVersion,
    ).toBe(7);
  });

  it.each([
    { action: "sessions-list", limit: 50 },
    { action: "sessions-inspect", threadId: "thread-fixture" },
    { action: "sessions-stop", threadId: "thread-fixture" },
  ] as const)("keeps session administration in closed inner v8 (%j)", (command) => {
    for (const adminVersion of [1, 2, 3, 4, 5, 6, 7])
      expect(hostAdminRequestSchema.safeParse({ adminVersion, command }).success).toBe(false);
    expect(hostAdminRequest(command)).toEqual({ adminVersion: 8, command });
    expect(
      hostAdminResultSchema.parse({ adminVersion: 8, outcome: { ok: true, data: {} } })
        .adminVersion,
    ).toBe(8);
    expect(hostAdminV8CommandSchema.safeParse({ ...command, unknown: true }).success).toBe(false);
  });

  it("bounds and defaults session reads and rejects ambiguous/future result bodies", () => {
    expect(hostAdminV8CommandSchema.parse({ action: "sessions-list" })).toEqual({
      action: "sessions-list",
      limit: 50,
    });
    for (const limit of [0, 101, 1.5])
      expect(hostAdminV8CommandSchema.safeParse({ action: "sessions-list", limit }).success).toBe(
        false,
      );
    expect(
      hostAdminV8CommandSchema.safeParse({ action: "sessions-list", cursor: "" }).success,
    ).toBe(false);
    expect(hostAdminV8CommandSchema.safeParse({ action: "clients-list" }).success).toBe(false);
    const body = { formatVersion: 1, scope: "persisted-profile", sessions: [], nextCursor: null };
    expect(hostAdminSessionListSchema.parse(body)).toEqual(body);
    for (const extra of [
      { formatVersion: 2 },
      { scope: "provider-native" },
      { credentials: "private" },
    ])
      expect(hostAdminSessionListSchema.safeParse({ ...body, ...extra }).success).toBe(false);
    expect(
      hostAdminSessionStopSchema.safeParse({
        formatVersion: 1,
        scope: "persisted-profile",
        threadId: "thread-fixture",
        retired: false,
      }).success,
    ).toBe(false);
  });

  it.each([
    { action: "providers-prepare-configuration", instanceId: "work" },
    {
      action: "providers-configure-checked",
      instanceId: "work",
      expectedProfileRevision: "ab".repeat(32),
      environment: { KEY: "synthetic-secret" },
    },
  ] as const)("requires closed v3 for guarded profile configuration (%j)", (command) => {
    for (const adminVersion of [1, 2])
      expect(hostAdminRequestSchema.safeParse({ adminVersion, command }).success).toBe(false);
    expect(hostAdminCommandSchema.safeParse(command).success).toBe(false);
    expect(hostAdminV2CommandSchema.safeParse(command).success).toBe(false);
    const request = hostAdminRequest(command);
    expect(request).toEqual({ adminVersion: 3, command });
    expect(hostAdminRequestSchema.parse(request)).toEqual(request);
    const reply = { adminVersion: 3, outcome: { ok: true, data: { profileId: "work" } } };
    expect(hostAdminResultSchema.parse(reply)).toEqual(reply);
    expect(hostAdminV1ResultSchema.safeParse(reply).success).toBe(false);
  });

  it.each(["", "ab", "G".repeat(64), "ab".repeat(33)])(
    "rejects invalid profile revisions (%s)",
    (expectedProfileRevision) => {
      expect(
        hostAdminV3CommandSchema.safeParse({
          action: "providers-configure-checked",
          instanceId: "work",
          expectedProfileRevision,
        }).success,
      ).toBe(false);
    },
  );

  it("keeps v3 closed instead of treating it as an arbitrary administration envelope", () => {
    expect(
      hostAdminRequestSchema.safeParse({ adminVersion: 3, command: { action: "clients-list" } })
        .success,
    ).toBe(false);
    expect(
      hostAdminV3CommandSchema.safeParse({
        action: "providers-prepare-configuration",
        instanceId: "work",
        unexpected: true,
      }).success,
    ).toBe(false);
  });

  it.each([
    { action: "plugins-list" },
    { action: "plugins-refresh" },
    { action: "mcp-list" },
    { action: "mcp-inspect", serverId: "exact-id" },
  ] as const)("requires closed v4 before any integration inventory operation (%j)", (command) => {
    for (const adminVersion of [1, 2, 3])
      expect(hostAdminRequestSchema.safeParse({ adminVersion, command }).success).toBe(false);
    expect(hostAdminV2CommandSchema.safeParse(command).success).toBe(false);
    expect(hostAdminV3CommandSchema.safeParse(command).success).toBe(false);
    const request = hostAdminRequest(command);
    expect(request).toEqual({ adminVersion: 4, command });
    expect(hostAdminRequestSchema.parse(request)).toEqual(request);
    expect(
      hostAdminResultSchema.parse({ adminVersion: 4, outcome: { ok: true, data: {} } })
        .adminVersion,
    ).toBe(4);
  });

  it.each([
    { action: "mcp-inspect" },
    { action: "mcp-inspect", serverId: "" },
    { action: "mcp-list", wslDistro: "Other" },
    { action: "plugins-list", project: "/implicit" },
    { action: "plugins-install" },
    { action: "plugin-accounts" },
    { action: "clients-list" },
  ])("refuses unsupported scope, mutations or earlier-version actions in v4 (%j)", (command) => {
    expect(hostAdminV4CommandSchema.safeParse(command).success).toBe(false);
    expect(hostAdminRequestSchema.safeParse({ adminVersion: 4, command }).success).toBe(false);
  });

  it("versions printed inventory bodies separately and refuses raw configuration fields", () => {
    expect(
      hostAdminMcpInventorySchema.parse({ formatVersion: 1, scope: "saved-user", servers: [] }),
    ).toEqual({ formatVersion: 1, scope: "saved-user", servers: [] });
    for (const formatVersion of [undefined, 0, 2])
      expect(
        hostAdminMcpInventorySchema.safeParse({ formatVersion, scope: "saved-user", servers: [] })
          .success,
      ).toBe(false);
    expect(
      hostAdminMcpInventorySchema.safeParse({
        formatVersion: 1,
        scope: "saved-user",
        servers: [],
        rawConfiguration: {},
      }).success,
    ).toBe(false);
  });

  it.each([
    { action: "providers-drivers" },
    {
      action: "providers-check-add",
      profile: { id: "work", driver: "fixture", displayName: "Work" },
      environmentNames: ["KEY"],
    },
  ] as const)("requires closed v5 for profile onboarding (%j)", (command) => {
    for (const adminVersion of [1, 2, 3, 4])
      expect(hostAdminRequestSchema.safeParse({ adminVersion, command }).success).toBe(false);
    expect(hostAdminV4CommandSchema.safeParse(command).success).toBe(false);
    const parsed = hostAdminV5CommandSchema.parse(command);
    expect(hostAdminRequest(parsed)).toEqual({ adminVersion: 5, command });
    expect(hostAdminRequestSchema.parse(hostAdminRequest(parsed)).adminVersion).toBe(5);
    expect(
      hostAdminResultSchema.parse({ adminVersion: 5, outcome: { ok: true, data: {} } })
        .adminVersion,
    ).toBe(5);
  });

  it.each(
    [[], ["BAD-NAME"], ["DUP", "DUP"], ["__proto__"], ["x".repeat(201)]].map(
      (environmentNames) => ({ environmentNames }),
    ),
  )(
    "refuses invalid creation environment names without accepting values (%j)",
    ({ environmentNames }) => {
      expect(
        hostAdminV5CommandSchema.safeParse({
          action: "providers-check-add",
          profile: { id: "work", driver: "fixture", displayName: "Work" },
          environmentNames,
        }).success,
      ).toBe(false);
    },
  );

  it("keeps creation checks free of environment values and v5 free of earlier actions", () => {
    expect(
      hostAdminV5CommandSchema.safeParse({
        action: "providers-check-add",
        profile: {
          id: "work",
          driver: "fixture",
          displayName: "Work",
          environment: { KEY: { value: "synthetic-secret" } },
        },
        environmentNames: ["KEY"],
      }).success,
    ).toBe(false);
    expect(hostAdminV5CommandSchema.safeParse({ action: "mcp-list" }).success).toBe(false);
    expect(
      hostAdminV5CommandSchema.safeParse({ action: "providers-drivers", wslDistro: "Implicit" })
        .success,
    ).toBe(false);
  });

  it.each([
    { action: "mcp-set-enabled", serverId: "exact-id", enabled: false },
    { action: "mcp-remove", serverId: "exact-id" },
  ] as const)("requires closed v6 for saved MCP changes (%j)", (command) => {
    for (const adminVersion of [1, 2, 3, 4, 5])
      expect(hostAdminRequestSchema.safeParse({ adminVersion, command }).success).toBe(false);
    expect(hostAdminRequest(command)).toEqual({ adminVersion: 6, command });
    expect(hostAdminRequestSchema.parse(hostAdminRequest(command)).adminVersion).toBe(6);
    expect(
      hostAdminResultSchema.parse({ adminVersion: 6, outcome: { ok: true, data: {} } })
        .adminVersion,
    ).toBe(6);
  });

  it.each([
    { action: "mcp-set-enabled", serverId: "exact-id" },
    { action: "mcp-set-enabled", serverId: "exact-id", enabled: "true" },
    { action: "mcp-remove", serverId: "" },
    { action: "mcp-remove", serverId: "exact-id", enabled: false },
    { action: "mcp-remove", serverId: "exact-id", projectId: "implicit" },
    { action: "mcp-set-enabled", serverId: "exact-id", enabled: true, wslDistro: "Other" },
    { action: "mcp-list" },
    { action: "providers-drivers" },
  ])("refuses missing values, ambiguous scopes and earlier commands in v6 (%j)", (command) => {
    expect(hostAdminV6CommandSchema.safeParse(command).success).toBe(false);
    expect(hostAdminRequestSchema.safeParse({ adminVersion: 6, command }).success).toBe(false);
  });

  it("versions saved MCP change output without accepting configuration or secret fields", () => {
    const data = {
      formatVersion: 1,
      scope: "saved-user",
      change: "set-enabled",
      serverId: "exact-id",
      enabled: false,
    };
    expect(hostAdminMcpChangeResultSchema.parse(data)).toEqual(data);
    for (const formatVersion of [undefined, 0, 2])
      expect(hostAdminMcpChangeResultSchema.safeParse({ ...data, formatVersion }).success).toBe(
        false,
      );
    expect(
      hostAdminMcpChangeResultSchema.safeParse({
        ...data,
        server: { transport: "synthetic-private" },
      }).success,
    ).toBe(false);
    expect(hostAdminMcpChangeResultSchema.safeParse({ ...data, change: "remove" }).success).toBe(
      false,
    );
    expect(
      hostAdminMcpChangeResultSchema.parse({
        formatVersion: 1,
        scope: "saved-user",
        change: "remove",
        serverId: "exact-id",
      }),
    ).toMatchObject({ change: "remove", serverId: "exact-id" });
  });

  it.each(["stdio", "http", "sse"] as const)(
    "requires closed v7 for complete %s definitions and guarded replacement",
    (type) => {
      const transport =
        type === "stdio"
          ? { type, command: "fixture", env: { KEY: "synthetic-secret" } }
          : {
              type,
              url: "https://fixture.test/deployment/mcp",
              headers: { Authorization: "synthetic-secret" },
            };
      const server = hostAdminMcpDefinitionSchema.parse({
        id: "exact-id",
        name: "fixture",
        transport,
      });
      for (const command of [
        { action: "mcp-add", server },
        { action: "mcp-prepare-configuration", serverId: server.id },
        { action: "mcp-configure-checked", server, expectedServerRevision: "ab".repeat(32) },
      ] as const) {
        for (const adminVersion of [1, 2, 3, 4, 5, 6])
          expect(hostAdminRequestSchema.safeParse({ adminVersion, command }).success).toBe(false);
        expect(hostAdminRequest(command)).toEqual({ adminVersion: 7, command });
        expect(hostAdminRequestSchema.parse(hostAdminRequest(command)).command).toEqual(command);
        expect(
          hostAdminResultSchema.parse({ adminVersion: 7, outcome: { ok: true, data: {} } })
            .adminVersion,
        ).toBe(7);
      }
      expect(server).toMatchObject({ enabled: true, timeoutMs: 30_000 });
      expect(server.transport).toMatchObject(
        type === "stdio"
          ? { args: [], env: { KEY: "synthetic-secret" } }
          : { url: "https://fixture.test/deployment/mcp" },
      );
    },
  );

  it.each([
    { action: "mcp-configure", serverId: "exact-id" },
    { action: "mcp-prepare-configuration", serverId: "" },
    { action: "mcp-prepare-configuration", serverId: "exact-id", projectId: "implicit" },
    {
      action: "mcp-add",
      server: {
        id: "exact-id",
        name: "fixture",
        transport: { type: "stdio", command: "fixture" },
        oauthCredentialKey: "private",
      },
    },
    {
      action: "mcp-add",
      server: {
        id: "exact-id",
        name: "fixture",
        transport: { type: "http", url: "https://fixture.test", credentialKey: "private" },
      },
    },
    { action: "mcp-remove", serverId: "exact-id" },
  ])("refuses unchecked edits, internal fields and earlier actions in v7 (%j)", (command) => {
    expect(hostAdminV7CommandSchema.safeParse(command).success).toBe(false);
  });

  it.each(["", "ab", "G".repeat(64), "ab".repeat(33)])(
    "requires a complete revision for MCP replacement (%s)",
    (expectedServerRevision) => {
      expect(
        hostAdminV7CommandSchema.safeParse({
          action: "mcp-configure-checked",
          expectedServerRevision,
          server: {
            id: "exact-id",
            name: "fixture",
            transport: { type: "stdio", command: "fixture" },
          },
        }).success,
      ).toBe(false);
    },
  );

  it.each(["stdio", "http", "sse"] as const)(
    "rejects raw prototype keys before normalizing %s value maps",
    (type) => {
      const transport =
        type === "stdio"
          ? JSON.parse(
              '{"type":"stdio","command":"fixture","env":{"__proto__":"synthetic-secret"}}',
            )
          : JSON.parse(
              `{"type":"${type}","url":"https://fixture.test","headers":{"__proto__":"synthetic-secret"}}`,
            );
      expect(
        hostAdminMcpDefinitionSchema.safeParse({ id: "exact-id", name: "fixture", transport })
          .success,
      ).toBe(false);
      const safe =
        type === "stdio"
          ? { type, command: "fixture", env: { constructor: "ordinary-value" } }
          : { type, url: "https://fixture.test", headers: { constructor: "ordinary-value" } };
      expect(
        hostAdminMcpDefinitionSchema.safeParse({ id: "exact-id", name: "fixture", transport: safe })
          .success,
      ).toBe(true);
    },
  );

  it.each([
    "https://user:password@fixture.test/mcp",
    "https://fixture.test/mcp#credential",
    "file:///private",
  ])("keeps canonical MCP URL restrictions (%s)", (url) => {
    expect(
      hostAdminMcpDefinitionSchema.safeParse({
        id: "exact-id",
        name: "fixture",
        transport: { type: "http", url },
      }).success,
    ).toBe(false);
  });

  it("keeps built-in names reserved and definition metadata closed", () => {
    for (const extra of [{ name: "poracode" }, { futureField: true }])
      expect(
        hostAdminMcpDefinitionSchema.safeParse({
          id: "exact-id",
          name: "fixture",
          transport: { type: "stdio", command: "fixture" },
          ...extra,
        }).success,
      ).toBe(false);
  });

  it("versions definition acknowledgements independently while rejecting values and unknown fields", () => {
    const result = { formatVersion: 2, scope: "saved-user", change: "add", serverId: "exact-id" };
    expect(hostAdminMcpDefinitionResultSchema.parse(result)).toEqual(result);
    for (const extra of [
      { formatVersion: 1 },
      { change: "remove" },
      { server: {} },
      { secret: "synthetic-private" },
    ])
      expect(hostAdminMcpDefinitionResultSchema.safeParse({ ...result, ...extra }).success).toBe(
        false,
      );
    expect(hostAdminMcpChangeResultSchema.safeParse(result).success).toBe(false);
  });

  it.each([
    { ttlMs: 0 },
    { ttlMs: 999 },
    { ttlMs: 86_400_001 },
    { ttlMs: 1.1 },
    { label: " " },
    { label: "x".repeat(121) },
    { scopes: [] },
    { scopes: ["unknown:scope"] },
    { scopes: ["session:read", "session:read"] },
    { preset: "viewer", scopes: ["session:read"] },
    { unexpected: true },
  ])("refuses an invalid pairing grant before issuance: %j", (extra) => {
    expect(
      hostAdminV2CommandSchema.safeParse({ action: "pairings-create", ...extra }).success,
    ).toBe(false);
  });

  it("has an explicit ten-minute default and allows narrowed known scopes", () => {
    expect(hostAdminV2CommandSchema.parse({ action: "pairings-create" })).toEqual({
      action: "pairings-create",
      ttlMs: 600_000,
    });
    expect(
      hostAdminV2CommandSchema.parse({
        action: "pairings-create",
        ttlMs: 1_000,
        label: " Phone ",
        scopes: ["session:read"],
      }),
    ).toEqual({
      action: "pairings-create",
      ttlMs: 1_000,
      label: "Phone",
      scopes: ["session:read"],
    });
  });
});
