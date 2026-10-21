import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseAdminCli,
  buildAdminCommand,
  reportAdminError,
  createAuthInputRelay,
  runAdminCli,
} from "./cliAdmin";
import { extractBaseDir, runConfigure } from "./cliConfigure";
import {
  defaultServerConfigPath,
  resolveServeSettings,
  SERVER_CONFIG_FILE_NAME,
} from "./serverConfig";
import { parseServerCliCommand } from "./cliParse";
import { HostOwnerLease } from "@/backend/ownership/hostOwnerLease";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { prepareOwnedHostRoot } from "@/backend/ownership/hostRootManifest";

const control = vi.hoisted(() =>
  vi.fn<
    (
      paths: unknown,
      operation: string,
      options?: {
        payload?: { command: { action: string } };
        expectedGeneration?: string;
        signal?: AbortSignal;
      },
    ) => Promise<unknown>
  >(),
);
vi.mock("@/backend/ownership/hostControlClient", async (original) => ({
  ...(await original<typeof import("@/backend/ownership/hostControlClient")>()),
  callHostControl: control,
}));

const roots: string[] = [];
const qr = vi.hoisted(() => vi.fn<(value: string, options: unknown) => Promise<string>>());
vi.mock("qrcode", () => ({ default: { toString: qr } }));
function root() {
  const path = mkdtempSync(join(tmpdir(), "poracode-cli-admin-"));
  roots.push(path);
  return path;
}
afterEach(() => {
  vi.restoreAllMocks();
  control.mockReset();
  qr.mockReset();
  process.exitCode = undefined;
  for (const path of roots.splice(0)) rmSync(path, { force: true, recursive: true });
});

describe("headless CLI setup and administration", () => {
  it("pins passive inventory to one described owner and validates the versioned JSON body", async () => {
    const data = {
      formatVersion: 1,
      environment: { kind: "native" },
      observation: { source: "saved-cache", state: "missing", version: null },
      configurationScope: "host",
      providers: [],
      profiles: [],
    };
    control.mockImplementation(async (_paths, operation) =>
      operation === "describe"
        ? { ownerGeneration: "original-owner" }
        : { result: { adminVersion: 17, outcome: { ok: true, data } } },
    );
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runAdminCli(root(), ["providers", "list", "--json"]);
    expect(output).toHaveBeenCalledOnce();
    expect(JSON.parse(String(output.mock.calls[0]![0]))).toEqual(data);
    expect(control).toHaveBeenLastCalledWith(
      expect.anything(),
      "admin",
      expect.objectContaining({
        expectedGeneration: "original-owner",
        payload: { adminVersion: 17, command: { action: "providers-inventory", refresh: false } },
      }),
    );
    expect(control.mock.calls.filter(([, operation]) => operation === "describe")).toHaveLength(1);
  });

  it.each([1, 18])(
    "refuses a mismatched inventory reply v%s without fallback or output",
    async (adminVersion) => {
      control.mockImplementation(async (_paths, operation) =>
        operation === "describe"
          ? { ownerGeneration: "original-owner" }
          : { result: { adminVersion, outcome: { ok: true, data: {} } } },
      );
      const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      await expect(runAdminCli(root(), ["providers", "list", "--json"])).rejects.toThrow(Error);
      expect(output).not.toHaveBeenCalled();
      expect(control.mock.calls.filter(([, operation]) => operation === "admin")).toHaveLength(1);
    },
  );

  it.each([
    {
      environment: { kind: "wsl", distro: "Other" },
      observation: { source: "saved-cache", state: "missing", version: null },
    },
    { environment: { kind: "native" }, observation: { source: "refresh" } },
  ])("refuses a mismatched observation scope before printing", async (scope) => {
    const data = {
      formatVersion: 1,
      ...scope,
      configurationScope: "host",
      providers: [],
      profiles: [],
    };
    control.mockImplementation(async (_paths, operation) =>
      operation === "describe"
        ? { ownerGeneration: "original-owner" }
        : { result: { adminVersion: 17, outcome: { ok: true, data } } },
    );
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await expect(runAdminCli(root(), ["providers", "list", "--json"])).rejects.toThrow(
      "different provider observation scope",
    );
    expect(output).not.toHaveBeenCalled();
  });

  it.each([2, 1])(
    "refuses future or private inventory format %s before printing",
    async (formatVersion) => {
      const data = {
        formatVersion,
        environment: { kind: "native" },
        observation: { source: "saved-cache", state: "missing", version: null },
        configurationScope: "host",
        providers: [],
        profiles: [],
        ...(formatVersion === 1 ? { secret: "synthetic-do-not-print" } : {}),
      };
      control.mockImplementation(async (_paths, operation) =>
        operation === "describe"
          ? { ownerGeneration: "original-owner" }
          : { result: { adminVersion: 17, outcome: { ok: true, data } } },
      );
      const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      await expect(runAdminCli(root(), ["providers", "list", "--json"])).rejects.toThrow(Error);
      expect(output).not.toHaveBeenCalled();
    },
  );

  it("reads saved provider observations by default and discovers only on explicit refresh", () => {
    expect(buildAdminCommand(parseAdminCli(["providers", "list"]))).toEqual({
      action: "providers-inventory",
      refresh: false,
    });
    expect(
      buildAdminCommand(parseAdminCli(["providers", "list", "--refresh", "--wsl", "Ubuntu"])),
    ).toEqual({
      action: "providers-inventory",
      refresh: true,
      wslDistro: "Ubuntu",
    });
    expect(buildAdminCommand(parseAdminCli(["auth", "list"]))).toEqual({
      action: "providers-list",
    });
    expect(() => parseAdminCli(["providers", "catalog", "--refresh"])).toThrow(Error);
  });

  it("parses explicit local session selection and bounded pagination", () => {
    expect(buildAdminCommand(parseAdminCli(["sessions", "list"]))).toEqual({
      action: "sessions-list",
      limit: 50,
    });
    expect(
      buildAdminCommand(
        parseAdminCli([
          "sessions",
          "list",
          "--limit",
          "2",
          "--cursor",
          "opaque",
          "--project",
          "exact-project",
        ]),
      ),
    ).toEqual({ action: "sessions-list", limit: 2, cursor: "opaque", projectId: "exact-project" });
    expect(buildAdminCommand(parseAdminCli(["sessions", "inspect", "exact-thread"]))).toEqual({
      action: "sessions-inspect",
      threadId: "exact-thread",
    });
    expect(buildAdminCommand(parseAdminCli(["sessions", "stop", "exact-thread", "--yes"]))).toEqual(
      { action: "sessions-stop", threadId: "exact-thread" },
    );
    expect(parseServerCliCommand(["sessions", "list"])).toBe("admin");
    expect(parseServerCliCommand(["sessions", "stop", "--help"])).toBe("help");
  });

  it.each(["archive", "done"])(
    "requires explicit JSON confirmation before %s contacts the owner",
    async (action) => {
      await expect(runAdminCli(root(), ["sessions", action, "thread", "--json"])).rejects.toThrow(
        "--yes",
      );
      expect(control).not.toHaveBeenCalled();
    },
  );

  it("pins one owner for the new closed session metadata version", async () => {
    const command = buildAdminCommand(
      parseAdminCli(["sessions", "rename", "thread", "--title", "  New title  "]),
    );
    expect(command).toEqual({
      action: "sessions-update",
      threadId: "thread",
      change: { kind: "rename", title: "New title" },
    });
    const data = {
      formatVersion: 1,
      scope: "persisted-profile",
      runtime: "unchanged",
      change: { kind: "rename", title: "New title" },
      session: {
        id: "thread",
        projectId: "project",
        title: "New title",
        agentKind: "fixture",
        presentationMode: "gui",
        storedStatus: "working",
        archived: false,
        done: false,
        createdAt: "before",
        updatedAt: "after",
      },
    };
    control.mockImplementation(async (_paths, operation) =>
      operation === "describe"
        ? { ownerGeneration: "exact-owner" }
        : { result: { adminVersion: 18, outcome: { ok: true, data } } },
    );
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runAdminCli(root(), ["sessions", "rename", "thread", "--title", "New title", "--json"]);
    expect(output).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(output.mock.calls[0]![0]))).toEqual(data);
    expect(control).toHaveBeenLastCalledWith(
      expect.anything(),
      "admin",
      expect.objectContaining({
        expectedGeneration: "exact-owner",
        payload: { adminVersion: 18, command },
      }),
    );
    expect(control.mock.calls.filter(([, op]) => op === "describe")).toHaveLength(1);
  });

  it.each(["wrong-thread", "wrong-change", "wrong-state", "private", "future", "wrong-retirement"])(
    "refuses %s metadata replies without printing success",
    async (variant) => {
      const data = {
        formatVersion: variant === "future" ? 2 : 1,
        scope: "persisted-profile",
        runtime: variant === "wrong-retirement" ? "unchanged" : "retired",
        change: { kind: variant === "wrong-change" ? "unarchive" : "archive" },
        session: {
          id: variant === "wrong-thread" ? "other" : "thread",
          projectId: "project",
          title: "Title",
          agentKind: "fixture",
          presentationMode: "gui",
          storedStatus: "idle",
          archived: variant !== "wrong-state",
          done: false,
          createdAt: "before",
          updatedAt: "after",
        },
        ...(variant === "private" ? { token: "synthetic-private" } : {}),
      };
      control.mockImplementation(async (_paths, operation) =>
        operation === "describe"
          ? { ownerGeneration: "exact-owner" }
          : { result: { adminVersion: 18, outcome: { ok: true, data } } },
      );
      const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      await expect(
        runAdminCli(root(), ["sessions", "archive", "thread", "--yes", "--json"]),
      ).rejects.toThrow(Error);
      expect(output).not.toHaveBeenCalled();
      expect(control).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    ["rename", "thread"],
    ["rename", "thread", "--title", " "],
    ["rename", "thread", "--title", "a".repeat(501)],
    ["archive"],
    ["unarchive", "thread", "--yes"],
    ["reopen", "thread", "--wsl", "Other"],
    ["list", "--limit", "0"],
    ["list", "--limit", "101"],
    ["list", "--limit", "1.2"],
    ["list", "--cursor", ""],
    ["list", "--project", ""],
    ["list", "unexpected-thread"],
    ["inspect"],
    ["stop"],
    ["stop", "thread", "--wsl", "Other"],
    ["list", "--runtime", "Other"],
    ["inspect", "thread", "--yes"],
  ])("refuses unsupported session arguments before owner contact (%j)", async (...args) => {
    await expect(runAdminCli(root(), ["sessions", ...args])).rejects.toThrow(Error);
    expect(control).not.toHaveBeenCalled();
  });

  it("requires explicit script/JSON stop confirmation before contacting an owner", async () => {
    await expect(
      runAdminCli(root(), ["sessions", "stop", "exact-thread", "--json"]),
    ).rejects.toThrow("--yes");
    expect(control).not.toHaveBeenCalled();
  });

  it("pins one owner and sends closed v8 for confirmed session retirement", async () => {
    const data = {
      formatVersion: 1,
      scope: "persisted-profile",
      threadId: "exact-thread",
      retired: true,
    };
    control.mockImplementation(async (_paths, operation) =>
      operation === "describe"
        ? { ownerGeneration: "original-owner" }
        : { result: { adminVersion: 8, outcome: { ok: true, data } } },
    );
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runAdminCli(root(), ["sessions", "stop", "exact-thread", "--yes", "--json"]);
    expect(output).toHaveBeenCalledExactlyOnceWith(`${JSON.stringify(data)}\n`);
    expect(control).toHaveBeenLastCalledWith(
      expect.anything(),
      "admin",
      expect.objectContaining({
        expectedGeneration: "original-owner",
        payload: {
          adminVersion: 8,
          command: { action: "sessions-stop", threadId: "exact-thread" },
        },
      }),
    );
    expect(control.mock.calls.filter(([, operation]) => operation === "describe")).toHaveLength(1);
  });

  it.each([
    { formatVersion: 1, scope: "persisted-profile", threadId: "different-thread", retired: true },
    { formatVersion: 1, scope: "persisted-profile", threadId: "exact-thread", retired: false },
    { formatVersion: 2, scope: "persisted-profile", threadId: "exact-thread", retired: true },
    {
      formatVersion: 1,
      scope: "persisted-profile",
      threadId: "exact-thread",
      retired: true,
      secret: "synthetic-private",
    },
  ])("does not print mismatched/private/future retirement results (%j)", async (data) => {
    control.mockImplementation(async (_paths, operation) =>
      operation === "describe"
        ? { ownerGeneration: "original-owner" }
        : { result: { adminVersion: 8, outcome: { ok: true, data } } },
    );
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await expect(
      runAdminCli(root(), ["sessions", "stop", "exact-thread", "--yes", "--json"]),
    ).rejects.toThrow(Error);
    expect(output).not.toHaveBeenCalled();
    expect(control).toHaveBeenCalledTimes(2);
  });
  it.each([
    ["configure", "id", "--yes"],
    ["add", "--config-stdin"],
    ["add", "id", "--config-file", "a.json", "--config-stdin"],
    ["add", "id", "--config-file", " "],
    ["add", "id", "--config-stdin", "--yes"],
    ["configure", "id", "--config-stdin", "--wsl", "Other"],
    ["add", "id", "--config-stdin", "--project", "implicit"],
    ["configure", "id", "--config-stdin", "--env-file", "private.json"],
  ])(
    "refuses unsupported definition arguments before opening input or contacting an owner: %j",
    async (...args) => {
      await expect(runAdminCli(root(), ["mcp", ...args])).rejects.toThrow(Error);
      expect(control).not.toHaveBeenCalled();
    },
  );
  it.each([
    [
      ["mcp", "enable", "exact-id"],
      { action: "mcp-set-enabled", serverId: "exact-id", enabled: true },
      {
        formatVersion: 1,
        scope: "saved-user",
        change: "set-enabled",
        serverId: "exact-id",
        enabled: true,
      },
    ],
    [
      ["mcp", "disable", "exact-id"],
      { action: "mcp-set-enabled", serverId: "exact-id", enabled: false },
      {
        formatVersion: 1,
        scope: "saved-user",
        change: "set-enabled",
        serverId: "exact-id",
        enabled: false,
      },
    ],
    [
      ["mcp", "remove", " exact id ", "--yes"],
      { action: "mcp-remove", serverId: " exact id " },
      { formatVersion: 1, scope: "saved-user", change: "remove", serverId: " exact id " },
    ],
  ] as const)(
    "routes saved MCP changes through v6 with explicit public output: %j",
    async (args, command, data) => {
      control.mockImplementation(async (_paths, operation) =>
        operation === "describe"
          ? { ownerGeneration: "original-owner" }
          : { result: { adminVersion: 6, outcome: { ok: true, data } } },
      );
      const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      await runAdminCli(root(), [...args, "--json"]);
      expect(output).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(output.mock.calls[0]![0]))).toEqual(data);
      expect(control).toHaveBeenLastCalledWith(
        expect.anything(),
        "admin",
        expect.objectContaining({
          expectedGeneration: "original-owner",
          payload: { adminVersion: 6, command },
        }),
      );
      expect(control.mock.calls.filter(([, operation]) => operation === "describe")).toHaveLength(
        1,
      );
    },
  );

  it("requires explicit confirmation for JSON MCP removal before owner contact", async () => {
    await expect(runAdminCli(root(), ["mcp", "remove", "exact-id", "--json"])).rejects.toThrow(
      "--yes",
    );
    expect(control).not.toHaveBeenCalled();
  });

  it("preserves complete saved MCP IDs beyond display widths in the request and output", async () => {
    const serverId = `fixture-${"x".repeat(250)}`;
    const data = {
      formatVersion: 1,
      scope: "saved-user",
      change: "set-enabled",
      serverId,
      enabled: false,
    };
    control.mockImplementation(async (_paths, operation) =>
      operation === "describe"
        ? { ownerGeneration: "original-owner" }
        : { result: { adminVersion: 6, outcome: { ok: true, data } } },
    );
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runAdminCli(root(), ["mcp", "disable", serverId, "--json"]);
    expect(output).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(output.mock.calls[0]![0]))).toEqual(data);
    expect(control).toHaveBeenLastCalledWith(
      expect.anything(),
      "admin",
      expect.objectContaining({
        payload: {
          adminVersion: 6,
          command: { action: "mcp-set-enabled", serverId, enabled: false },
        },
      }),
    );
  });

  it.each([
    ["enable"],
    ["disable"],
    ["remove", "--yes"],
    ["remove", "id", "extra", "--yes"],
    ["enable", "id", "--yes"],
    ["disable", "id", "--runtime", "other"],
    ["remove", "id", "--wsl", "Other"],
    ["enable", "id", "--project", "implicit"],
    ["remove", "id", "--env-file", "unused.json"],
  ])("refuses unsupported MCP change arguments before owner contact: %j", async (...args) => {
    await expect(runAdminCli(root(), ["mcp", ...args])).rejects.toThrow(Error);
    expect(control).not.toHaveBeenCalled();
  });

  it.each([
    {
      formatVersion: 2,
      scope: "saved-user",
      change: "set-enabled",
      serverId: "exact-id",
      enabled: false,
    },
    {
      formatVersion: 1,
      scope: "saved-user",
      change: "set-enabled",
      serverId: "exact-id",
      enabled: false,
      headers: { Authorization: "synthetic-never-print" },
    },
    {
      formatVersion: 1,
      scope: "saved-user",
      change: "set-enabled",
      serverId: "other-id",
      enabled: false,
    },
    {
      formatVersion: 1,
      scope: "saved-user",
      change: "set-enabled",
      serverId: "exact-id",
      enabled: true,
    },
    { formatVersion: 1, scope: "saved-user", change: "remove", serverId: "exact-id" },
  ])(
    "refuses unknown/private or mismatched MCP change responses without retry or printing: %j",
    async (data) => {
      control.mockImplementation(async (_paths, operation) =>
        operation === "describe"
          ? { ownerGeneration: "original-owner" }
          : { result: { adminVersion: 6, outcome: { ok: true, data } } },
      );
      const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      const failure = await runAdminCli(root(), ["mcp", "disable", "exact-id", "--json"]).catch(
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(Error);
      expect(String(failure)).not.toContain("synthetic-never-print");
      expect(output).not.toHaveBeenCalled();
      expect(control.mock.calls.filter(([, operation]) => operation === "admin")).toHaveLength(1);
    },
  );

  it("discovers the selected owner's profile drivers through closed v5 with a versioned public body", async () => {
    const data = {
      formatVersion: 1,
      scope: "saved-profile-drivers",
      drivers: [
        { id: "codex", credentialEnvironmentName: null },
        { id: "cursor", credentialEnvironmentName: "CURSOR_API_KEY" },
      ],
    };
    control.mockImplementation(async (_paths, operation) =>
      operation === "describe"
        ? { ownerGeneration: "original-owner" }
        : { result: { adminVersion: 5, outcome: { ok: true, data } } },
    );
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runAdminCli(root(), ["providers", "drivers", "--json"]);
    expect(output).toHaveBeenCalledExactlyOnceWith(`${JSON.stringify(data)}\n`);
    expect(control).toHaveBeenLastCalledWith(
      expect.anything(),
      "admin",
      expect.objectContaining({
        expectedGeneration: "original-owner",
        payload: { adminVersion: 5, command: { action: "providers-drivers" } },
      }),
    );
    expect(control.mock.calls.filter(([, operation]) => operation === "describe")).toHaveLength(1);
  });

  it.each([["work"], ["--wsl", "Other"], ["--runtime", "other"], ["--config-file", "unused.json"]])(
    "refuses driver-discovery target/config arguments before owner contact: %j",
    async (...flags) => {
      await expect(runAdminCli(root(), ["providers", "drivers", ...flags])).rejects.toThrow(Error);
      expect(control).not.toHaveBeenCalled();
    },
  );

  it.each([
    { scope: "saved-profile-drivers", drivers: [] },
    { formatVersion: 2, scope: "saved-profile-drivers", drivers: [] },
    {
      formatVersion: 1,
      scope: "saved-profile-drivers",
      drivers: [{ id: "codex", credentialEnvironmentName: null, secret: "synthetic-do-not-print" }],
    },
  ])("refuses invalid/private driver inventory bodies before printing: %j", async (data) => {
    control.mockImplementation(async (_paths, operation) =>
      operation === "describe"
        ? { ownerGeneration: "original-owner" }
        : { result: { adminVersion: 5, outcome: { ok: true, data } } },
    );
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const failure = await runAdminCli(root(), ["providers", "drivers", "--json"]).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).not.toContain("synthetic-do-not-print");
    expect(output).not.toHaveBeenCalled();
    expect(control.mock.calls.filter(([, operation]) => operation === "admin")).toHaveLength(1);
  });

  it.each([
    [["plugins", "list"], { action: "plugins-list" }],
    [["plugins", "refresh"], { action: "plugins-refresh" }],
    [["mcp", "list"], { action: "mcp-list" }],
    [["mcp", "inspect", "exact-id"], { action: "mcp-inspect", serverId: "exact-id" }],
  ] as const)("routes supported integration inventory through v4: %j", async (args, command) => {
    const data =
      args[0] === "plugins"
        ? { formatVersion: 1, scope: "global", plugins: [] }
        : command.action === "mcp-list"
          ? { formatVersion: 1, scope: "saved-user", servers: [] }
          : {
              formatVersion: 1,
              scope: "saved-user",
              server: {
                id: "exact-id",
                name: "fixture-server",
                enabled: true,
                transport: "stdio",
                timeoutMs: 30_000,
                disabledToolCount: 0,
                environmentNames: ["FIXTURE_KEY"],
                headerNames: [],
                disabledTools: [],
              },
            };
    control.mockImplementation(async (_paths, operation) =>
      operation === "describe"
        ? { ownerGeneration: "original-owner" }
        : { result: { adminVersion: 4, outcome: { ok: true, data } } },
    );
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runAdminCli(root(), [...args, "--json"]);
    expect(output).toHaveBeenCalledExactlyOnceWith(`${JSON.stringify(data)}\n`);
    expect(control).toHaveBeenLastCalledWith(
      expect.anything(),
      "admin",
      expect.objectContaining({
        expectedGeneration: "original-owner",
        payload: { adminVersion: 4, command },
      }),
    );
    expect(control.mock.calls.filter(([, operation]) => operation === "describe")).toHaveLength(1);
  });

  it.each([
    ["mcp", "inspect"],
    ["mcp", "inspect", "id", "extra"],
    ["mcp", "list", "id"],
    ["mcp", "list", "--wsl", "Other"],
    ["plugins", "refresh", "id"],
    ["plugins", "list", "--project", "/implicit"],
    ["plugins", "install", "name"],
    ["mcp", "auth", "id"],
  ])("refuses unsupported integration arguments before owner contact: %j", async (...args) => {
    await expect(runAdminCli(root(), args)).rejects.toThrow(Error);
    expect(control).not.toHaveBeenCalled();
  });

  it("validates secret-free metadata before JSON output instead of printing unexpected raw MCP configuration", async () => {
    const data = {
      formatVersion: 1,
      scope: "saved-user",
      servers: [
        {
          id: "exact-id",
          name: "fixture",
          enabled: true,
          transport: "http",
          timeoutMs: 30_000,
          disabledToolCount: 0,
          headers: { Authorization: "synthetic-secret-header" },
        },
      ],
    };
    control.mockImplementation(async (_paths, operation) =>
      operation === "describe"
        ? { ownerGeneration: "original-owner" }
        : { result: { outcome: { ok: true, data } } },
    );
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const error = await runAdminCli(root(), ["mcp", "list", "--json"]).catch(
      (failure: unknown) => failure,
    );
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain("synthetic-secret-header");
    expect(output).not.toHaveBeenCalled();
    expect(control.mock.calls.filter(([, operation]) => operation === "admin")).toHaveLength(1);
  });

  it("parses explicit account/profile controls and bounded pairing options", () => {
    expect(
      buildAdminCommand(parseAdminCli(["auth", "accounts", "fixture", "--wsl", "Ubuntu"])),
    ).toEqual({ action: "auth-accounts", agentKind: "fixture", wslDistro: "Ubuntu" });
    expect(
      buildAdminCommand(parseAdminCli(["providers", "unset-env", "work", "OLD_KEY", "OTHER_KEY"])),
    ).toEqual({
      action: "providers-unset-environment",
      instanceId: "work",
      names: ["OLD_KEY", "OTHER_KEY"],
    });
    expect(
      buildAdminCommand(
        parseAdminCli([
          "pairings",
          "create",
          "--scope",
          "session:read",
          "--scope",
          "terminal:read",
          "--ttl",
          "15m",
          "--label",
          "Phone",
        ]),
      ),
    ).toEqual({
      action: "pairings-create",
      scopes: ["session:read", "terminal:read"],
      ttlMs: 900_000,
      label: "Phone",
    });
    expect(buildAdminCommand(parseAdminCli(["pairings", "create"]))).toEqual({
      action: "pairings-create",
      ttlMs: 600_000,
    });
  });

  it.each([
    ["--preset", "viewer", "--scope", "session:read"],
    ["--ttl", "25h"],
    ["--ttl", "0s"],
    ["--ttl", "10"],
    ["--scope", "unknown:scope"],
    ["--label", " "],
    ["--qr", "--json"],
  ])("refuses invalid pairing input before contacting an owner (%j)", async (...flags) => {
    await expect(runAdminCli(root(), ["pairings", "create", ...flags])).rejects.toThrow(Error);
    expect(control).not.toHaveBeenCalled();
  });

  it("requires explicit noninteractive profile removal confirmation before contacting an owner", async () => {
    await expect(runAdminCli(root(), ["providers", "remove", "work", "--json"])).rejects.toThrow(
      "--yes",
    );
    expect(control).not.toHaveBeenCalled();
  });

  it("gives pairing guidance for a pairing validation error instead of profile-driver advice", () => {
    expect(() => buildAdminCommand(parseAdminCli(["pairings", "create", "--ttl", "25h"]))).toThrow(
      "TTL from 1s to 24h",
    );
  });

  it("keeps JSON pairing output free of QR/control text and pins the owner generation", async () => {
    const grant = {
      id: "fixture-grant",
      pairingUrl: "http://127.0.0.1:12345/#token=synthetic",
      scopes: ["session:read"],
      expiresAt: "2026-10-17T00:10:00.000Z",
    };
    control.mockImplementation(async (_paths, operation) =>
      operation === "describe"
        ? { ownerGeneration: "original-owner" }
        : { result: { outcome: { ok: true, data: grant } } },
    );
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const errors = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    await runAdminCli(root(), ["pairings", "create", "--preset", "viewer", "--json"]);
    expect(output).toHaveBeenCalledExactlyOnceWith(`${JSON.stringify(grant)}\n`);
    expect(errors).not.toHaveBeenCalled();
    expect(qr).not.toHaveBeenCalled();
    expect(control).toHaveBeenLastCalledWith(
      expect.anything(),
      "admin",
      expect.objectContaining({
        expectedGeneration: "original-owner",
        payload: {
          adminVersion: 2,
          command: { action: "pairings-create", preset: "viewer", ttlMs: 600_000 },
        },
      }),
    );
  });

  it("revokes the exact new grant on QR failure through the same generation", async () => {
    const qrError = new Error("Fixture QR failed");
    qr.mockRejectedValue(qrError);
    const grant = {
      id: "fixture-grant",
      pairingUrl: "http://127.0.0.1:12345/#token=synthetic",
      scopes: ["session:read"],
      expiresAt: "2026-10-17T00:10:00.000Z",
    };
    control.mockImplementation(async (_paths, operation, options) =>
      operation === "describe"
        ? { ownerGeneration: "original-owner" }
        : {
            result: {
              outcome: {
                ok: true,
                data:
                  options?.payload?.command.action === "pairings-create"
                    ? grant
                    : { revoked: grant.id },
              },
            },
          },
    );
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await expect(runAdminCli(root(), ["pairings", "create", "--qr"])).rejects.toBe(qrError);
    expect(output).not.toHaveBeenCalled();
    expect(control.mock.calls.filter((call) => call[1] === "describe")).toHaveLength(1);
    expect(control).toHaveBeenLastCalledWith(
      expect.anything(),
      "admin",
      expect.objectContaining({
        expectedGeneration: "original-owner",
        payload: {
          adminVersion: 1,
          command: { action: "pairings-revoke", pairingId: "fixture-grant" },
        },
      }),
    );
  });

  it("writes an explicitly requested QR to stderr and a matching grant to stdout", async () => {
    qr.mockResolvedValue("FIXTURE_QR\n");
    const grant = {
      id: "fixture-grant",
      pairingUrl: "http://127.0.0.1:12345/#token=synthetic",
      scopes: ["session:read"],
      expiresAt: "2026-10-17T00:10:00.000Z",
    };
    control.mockImplementation(async (_paths, operation) =>
      operation === "describe"
        ? { ownerGeneration: "original-owner" }
        : { result: { outcome: { ok: true, data: grant } } },
    );
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const errors = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    await runAdminCli(root(), ["pairings", "create", "--qr"]);
    expect(errors).toHaveBeenCalledExactlyOnceWith("FIXTURE_QR\n");
    expect(output).toHaveBeenCalledWith(expect.stringContaining(grant.pairingUrl));
    expect(output).toHaveBeenCalledWith(expect.stringContaining(grant.id));
    expect(qr).toHaveBeenCalledWith(grant.pairingUrl, { type: "terminal", small: true });
  });

  it("unsets saved config keys atomically and keeps the namespace/import boundary intact", async () => {
    const profile = join(root(), "namespace");
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runConfigure(profile, ["--host", "127.0.0.1", "--port", "12345", "--json"]);
    const path = defaultServerConfigPath(profile);
    expect(existsSync(profile)).toBe(false);
    await runConfigure(profile, ["--unset", "port", "--json"]);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ host: "127.0.0.1" });
    expect(existsSync(profile)).toBe(false);
    const before = readFileSync(path, "utf8");
    await expect(runConfigure(profile, ["--show", "--unset", "host"])).rejects.toThrow("--show");
    await expect(runConfigure(profile, ["--host", "localhost", "--unset", "host"])).rejects.toThrow(
      "set and unset",
    );
    await expect(runConfigure(profile, ["--unset", "unknown-field"])).rejects.toThrow(Error);
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  it("requires a complete TLS pair when unsetting configuration", async () => {
    const profile = join(root(), "namespace");
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runConfigure(profile, [
      "--tls-cert",
      "fixture.crt",
      "--tls-key",
      "fixture.key",
      "--json",
    ]);
    const path = defaultServerConfigPath(profile);
    const before = readFileSync(path, "utf8");
    await expect(runConfigure(profile, ["--unset", "tlsKey", "--json"])).rejects.toThrow(
      "together",
    );
    expect(readFileSync(path, "utf8")).toBe(before);
    await runConfigure(profile, ["--unset", "tlsKey", "--unset", "tlsCert", "--json"]);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({});
  });
  it.each([false, true])(
    "joins late stdin writes after login completion (write failure: %s)",
    async (writeFails) => {
      const reading = Promise.withResolvers<void>();
      const completed = Promise.withResolvers<unknown>();
      const written = Promise.withResolvers<unknown>();
      const sessionId = "d41082c9-a0ae-49cd-a9e4-8ee7bce11f3d";
      control.mockImplementation(async (_paths, operation, options) => {
        if (operation === "describe") return { ownerGeneration: "original-owner" };
        const command = options!.payload!.command;
        let data: unknown;
        if (command.action === "auth-login") data = { sessionId };
        if (command.action === "auth-read") {
          reading.resolve();
          data = await completed.promise;
        }
        if (command.action === "auth-write") data = await written.promise;
        if (command.action === "auth-close") data = { closed: true };
        if (command.action === "auth-methods") data = { provider: { authState: "unknown" } };
        return { result: { outcome: { ok: true, data } } };
      });
      const pause = vi.spyOn(process.stdin, "pause").mockReturnValue(process.stdin);
      const resume = vi.spyOn(process.stdin, "resume").mockReturnValue(process.stdin);
      const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      vi.spyOn(process.stderr, "write").mockReturnValue(true);
      const login = runAdminCli(root(), ["auth", "login", "fixture", "--json"]).then(
        () => undefined,
        (error: unknown) => error,
      );
      await reading.promise;
      process.stdin.emit("data", Buffer.from("1234\n"));
      completed.resolve({ data: "", cursor: 0, finished: true, exitCode: 0 });
      await vi.waitFor(() => expect(pause).toHaveBeenCalledTimes(2));
      const resumed = resume.mock.calls.length;
      const inputError = new Error("Fixture late input failure");
      if (writeFails) written.reject(inputError);
      else written.resolve({ accepted: true });
      expect(await login).toBe(writeFails ? inputError : undefined);
      expect(resume).toHaveBeenCalledTimes(resumed);
      expect(process.stdin.listenerCount("data")).toBe(0);
      expect(output.mock.calls.map(([text]) => JSON.parse(String(text)))).toEqual(
        writeFails
          ? []
          : [
              {
                loginCompleted: true,
                provider: { authState: "unknown" },
              },
            ],
      );
      expect(control.mock.calls.filter(([, operation]) => operation === "describe")).toHaveLength(
        1,
      );
      expect(
        control.mock.calls
          .filter(([, operation]) => operation === "admin")
          .map(([, , options]) => options?.expectedGeneration),
      ).toEqual(expect.arrayContaining(["original-owner"]));
      expect(
        control.mock.calls
          .filter(([, operation]) => operation === "admin")
          .every(([, , options]) => options?.expectedGeneration === "original-owner"),
      ).toBe(true);
    },
  );
  it.each(["stdin", "stderr", "write-callback"] as const)(
    "closes the owned login and restores listeners after a %s error",
    async (source) => {
      const sessionId = "d41082c9-a0ae-49cd-a9e4-8ee7bce11f3d";
      const ready = Promise.withResolvers<void>();
      const error = new Error(`Fixture ${source} I/O failure`);
      const beforeSignals = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
      const inputOn = vi.spyOn(process.stdin, "on");
      const outputOn = vi.spyOn(process.stderr, "on");
      control.mockImplementation(async (_paths, operation, options) => {
        if (operation === "describe") return { ownerGeneration: "original-owner" };
        const command = options!.payload!.command;
        if (command.action === "auth-login")
          return { result: { outcome: { ok: true, data: { sessionId } } } };
        if (command.action === "auth-read") {
          ready.resolve();
          if (source === "write-callback")
            return {
              result: {
                outcome: {
                  ok: true,
                  data: { data: "Fixture prompt", cursor: 14, finished: false },
                },
              },
            };
          return new Promise((_, reject) =>
            options!.signal!.addEventListener("abort", () => reject(options!.signal!.reason), {
              once: true,
            }),
          );
        }
        return { result: { outcome: { ok: true, data: { closed: true } } } };
      });
      vi.spyOn(process.stdin, "pause").mockReturnValue(process.stdin);
      vi.spyOn(process.stdin, "resume").mockReturnValue(process.stdin);
      vi.spyOn(process.stderr, "write").mockImplementation(
        (_data, encodingOrCallback, callback) => {
          const done = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
          queueMicrotask(() => done?.(error));
          return false;
        },
      );
      const failed = runAdminCli(root(), ["auth", "login", "fixture", "--json"]).catch(
        (failure: unknown) => failure,
      );
      await ready.promise;
      if (source !== "write-callback") process[source].emit("error", error);
      expect(await failed).toBe(error);
      expect(
        control.mock.calls.filter(
          ([, , options]) => options?.payload?.command.action === "auth-close",
        ),
      ).toHaveLength(1);
      expect(control.mock.calls.filter(([, operation]) => operation === "describe")).toHaveLength(
        1,
      );
      expect(
        control.mock.calls
          .filter(([, operation]) => operation === "admin")
          .every(([, , options]) => options?.expectedGeneration === "original-owner"),
      ).toBe(true);
      const inputErrorListener = inputOn.mock.calls.find(([event]) => event === "error")?.[1];
      const outputErrorListener = outputOn.mock.calls.find(([event]) => event === "error")?.[1];
      expect(inputErrorListener).toBeTypeOf("function");
      expect(outputErrorListener).toBe(inputErrorListener);
      expect(process.stdin.listeners("error")).not.toContain(inputErrorListener);
      expect(process.stderr.listeners("error")).not.toContain(outputErrorListener);
      expect([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")]).toEqual(
        beforeSignals,
      );
    },
  );
  it("awaits the output write callback before closing a completed login", async () => {
    const written = Promise.withResolvers<void>();
    let complete: (() => void) | undefined;
    control.mockImplementation(async (_paths, operation, options) => {
      if (operation === "describe") return { ownerGeneration: "owner" };
      const action = options!.payload!.command.action;
      const data =
        action === "auth-login"
          ? { sessionId: "d41082c9-a0ae-49cd-a9e4-8ee7bce11f3d" }
          : action === "auth-read"
            ? { data: "Fixture output", cursor: 14, finished: true, exitCode: 0 }
            : action === "auth-methods"
              ? { provider: {} }
              : { closed: true };
      return { result: { outcome: { ok: true, data } } };
    });
    vi.spyOn(process.stdin, "pause").mockReturnValue(process.stdin);
    vi.spyOn(process.stdin, "resume").mockReturnValue(process.stdin);
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    vi.spyOn(process.stderr, "write").mockImplementation((_data, encodingOrCallback, callback) => {
      const done = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
      complete = () => done?.();
      written.resolve();
      return false;
    });
    const login = runAdminCli(root(), ["auth", "login", "fixture", "--json"]);
    await written.promise;
    expect(
      control.mock.calls.some(([, , options]) => options?.payload?.command.action === "auth-close"),
    ).toBe(false);
    complete!();
    await login;
    expect(
      control.mock.calls.filter(
        ([, , options]) => options?.payload?.command.action === "auth-close",
      ),
    ).toHaveLength(1);
  });
  it("does not discover a replacement owner for terminal cleanup", async () => {
    control.mockImplementation(async (_paths, operation, options) => {
      if (operation === "describe") return { ownerGeneration: "original-owner" };
      expect(options?.expectedGeneration).toBe("original-owner");
      if (options!.payload!.command.action === "auth-login")
        return {
          result: {
            outcome: { ok: true, data: { sessionId: "d41082c9-a0ae-49cd-a9e4-8ee7bce11f3d" } },
          },
        };
      throw new Error("Host owner changed; retry the command explicitly.");
    });
    vi.spyOn(process.stdin, "pause").mockReturnValue(process.stdin);
    vi.spyOn(process.stdin, "resume").mockReturnValue(process.stdin);
    await expect(runAdminCli(root(), ["auth", "login", "fixture", "--json"])).rejects.toMatchObject(
      {
        cause: expect.objectContaining({ message: expect.stringContaining("Host owner changed") }),
      },
    );
    expect(control.mock.calls.filter(([, operation]) => operation === "describe")).toHaveLength(1);
  });
  it("keeps stream error listeners until a cancelled output callback joins, after confirmed auth-close", async () => {
    const written = Promise.withResolvers<void>();
    let complete: ((error?: Error | null) => void) | undefined;
    control.mockImplementation(async (_paths, operation, options) => {
      if (operation === "describe") return { ownerGeneration: "owner" };
      const action = options!.payload!.command.action;
      const data =
        action === "auth-login"
          ? { sessionId: "d41082c9-a0ae-49cd-a9e4-8ee7bce11f3d" }
          : action === "auth-read"
            ? { data: "Fixture output", cursor: 14, finished: false }
            : { closed: true };
      return { result: { outcome: { ok: true, data } } };
    });
    vi.spyOn(process.stdin, "pause").mockReturnValue(process.stdin);
    vi.spyOn(process.stdin, "resume").mockReturnValue(process.stdin);
    const before = process.stderr.listenerCount("error");
    vi.spyOn(process.stderr, "write").mockImplementation((_data, encodingOrCallback, callback) => {
      complete = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
      written.resolve();
      return false;
    });
    let finished = false;
    const failed = runAdminCli(root(), ["auth", "login", "fixture", "--json"])
      .catch((error: unknown) => error)
      .finally(() => {
        finished = true;
      });
    await written.promise;
    process.stdin.emit("data", Buffer.from([3]));
    await vi.waitFor(() =>
      expect(
        control.mock.calls.some(
          ([, , options]) => options?.payload?.command.action === "auth-close",
        ),
      ).toBe(true),
    );
    expect(finished).toBe(false);
    expect(process.stderr.listenerCount("error")).toBe(before + 1);
    const lateError = new Error("Fixture late output failure");
    complete!(lateError);
    process.stderr.emit("error", lateError);
    expect(await failed).toBeInstanceOf(Error);
    expect(process.stderr.listenerCount("error")).toBe(before);
  });
  it("still confirms auth-close if raw-mode restoration fails, preserving the original stream error", async () => {
    const ready = Promise.withResolvers<void>();
    const originalError = new Error("Fixture input failure");
    const descriptors = Object.fromEntries(
      ["isTTY", "isRaw", "setRawMode"].map((name) => [
        name,
        Object.getOwnPropertyDescriptor(process.stdin, name),
      ]),
    );
    let rawCalls = 0;
    const setRawMode = vi.fn<(enabled: boolean) => typeof process.stdin>((enabled) => {
      if (++rawCalls > 1) throw new Error("Fixture raw restore failure");
      expect(enabled).toBe(true);
      return process.stdin;
    });
    Object.defineProperties(process.stdin, {
      isTTY: { configurable: true, value: true },
      isRaw: { configurable: true, value: false },
      setRawMode: { configurable: true, value: setRawMode },
    });
    try {
      control.mockImplementation(async (_paths, operation, options) => {
        if (operation === "describe") return { ownerGeneration: "owner" };
        const action = options!.payload!.command.action;
        if (action === "auth-read") {
          ready.resolve();
          return new Promise((_, reject) =>
            options!.signal!.addEventListener("abort", () => reject(options!.signal!.reason), {
              once: true,
            }),
          );
        }
        return {
          result: {
            outcome: {
              ok: true,
              data:
                action === "auth-login"
                  ? { sessionId: "d41082c9-a0ae-49cd-a9e4-8ee7bce11f3d" }
                  : { closed: true },
            },
          },
        };
      });
      vi.spyOn(process.stdin, "pause").mockReturnValue(process.stdin);
      vi.spyOn(process.stdin, "resume").mockReturnValue(process.stdin);
      const failed = runAdminCli(root(), ["auth", "login", "fixture", "--json"]).catch(
        (error: unknown) => error,
      );
      await ready.promise;
      process.stdin.emit("error", originalError);
      expect(await failed).toMatchObject({
        cause: originalError,
        errors: [
          originalError,
          expect.objectContaining({ message: "Fixture raw restore failure" }),
        ],
      });
      expect(setRawMode.mock.calls.map(([enabled]) => enabled)).toEqual([true, false]);
      expect(
        control.mock.calls.filter(
          ([, , options]) => options?.payload?.command.action === "auth-close",
        ),
      ).toHaveLength(1);
    } finally {
      for (const [name, descriptor] of Object.entries(descriptors)) {
        if (descriptor) Object.defineProperty(process.stdin, name, descriptor);
        else Reflect.deleteProperty(process.stdin, name);
      }
    }
  });
  it("streams large and split UTF-8 stdin chunks within the wire limit", async () => {
    const parts: string[] = [];
    const relay = createAuthInputRelay(async (data) => {
      parts.push(data);
    });
    const text = "x".repeat(4095) + "\u{1F680}" + "y".repeat(32_768);
    const bytes = Buffer.from(text);
    await relay.push(bytes.subarray(0, 4097));
    await relay.push(bytes.subarray(4097));
    await relay.end();
    expect(parts.join("")).toBe(text);
    expect(parts.every((part) => part.length <= 4096)).toBe(true);
    expect(parts.some((part) => /[\uD800-\uDBFF]$/u.test(part))).toBe(false);
  });
  it("selects an independent profile in any argument position", () => {
    expect(extractBaseDir(["--base-dir", "tmp/test-profile", "auth", "list", "--json"])).toEqual({
      baseDir: resolve("tmp/test-profile"),
      args: ["auth", "list", "--json"],
    });
    expect(() => extractBaseDir(["--base-dir", "--json"])).toThrow("Usage");
    expect(() => extractBaseDir(["--base-dir", "a", "--base-dir", "b"])).toThrow("once");
  });
  it.each(["providers", "auth", "clients", "pairings", "configure"])(
    "offers %s help without reading credentials or starting a server",
    (command) => {
      expect(parseServerCliCommand([command, "--help"])).toBe("help");
    },
  );
  it("preserves the environment and account selector on explicit logins", () => {
    expect(
      buildAdminCommand(
        parseAdminCli([
          "auth",
          "login",
          "fixture:work",
          "--method",
          "device",
          "--wsl",
          "Ubuntu",
          "--runtime",
          "cli",
          "--json",
        ]),
      ),
    ).toEqual({
      action: "auth-login",
      agentKind: "fixture:work",
      methodId: "device",
      wslDistro: "Ubuntu",
      runtime: "cli",
    });
    expect(
      buildAdminCommand(
        parseAdminCli(["auth", "logout", "fixture", "--credential", "upstream-account"]),
      ),
    ).toEqual({ action: "auth-logout", agentKind: "fixture", credentialId: "upstream-account" });
  });
  it("rejects typos, conflicting flags, and incomplete mutations", () => {
    for (const args of [
      ["clients", "revoke"],
      ["providers", "install"],
      ["providers", "add", "work"],
    ])
      expect(() => buildAdminCommand(parseAdminCli(args))).toThrow("Missing or invalid");
    expect(() => parseAdminCli(["auth", "logout", "fixture", "--method", "wrong"])).toThrow(
      "Unknown option",
    );
    expect(() =>
      parseAdminCli(["providers", "configure", "work", "--enable", "--disable"]),
    ).toThrow("Choose");
    expect(() => parseAdminCli(["clients", "list", "--token", "value"])).toThrow("Unknown option");
  });
  it("seals environment-file values through the profile command, without command-line secrets", () => {
    const dir = root();
    const envPath = join(dir, "env.json");
    const configPath = join(dir, "config.json");
    writeFileSync(envPath, JSON.stringify({ FIXTURE_KEY: "synthetic-credential" }));
    writeFileSync(configPath, JSON.stringify({ homeDir: "~/.fixture-work" }));
    expect(
      buildAdminCommand(
        parseAdminCli([
          "providers",
          "add",
          "work",
          "--driver",
          "codex",
          "--name",
          "Work",
          "--env-file",
          envPath,
          "--config-file",
          configPath,
        ]),
      ),
    ).toEqual({
      action: "providers-add",
      profile: {
        id: "work",
        driver: "codex",
        displayName: "Work",
        config: { homeDir: "~/.fixture-work" },
        environment: { FIXTURE_KEY: { value: "synthetic-credential", sensitive: true } },
      },
    });
  });
  it("configures a fresh namespace without triggering the legacy import safeguard", async () => {
    const profile = join(root(), "fresh-profile");
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runConfigure(profile, ["--port", "0", "--json"]);
    expect(existsSync(profile)).toBe(false);
    expect(
      resolveServeSettings({
        flags: {},
        env: {},
        defaultConfigPath: defaultServerConfigPath(profile),
      }),
    ).toMatchObject({ remoteAccessPort: 0 });
    const lease = HostOwnerLease.acquire(resolveHostRootPaths(profile), "headless");
    try {
      expect(prepareOwnedHostRoot(lease).source).toEqual({ kind: "empty", activation: "ready" });
    } finally {
      lease.release();
    }
  });
  it("writes the existing config format and preserves unrelated fields for the real serve resolver", async () => {
    const dir = root();
    const path = join(dir, SERVER_CONFIG_FILE_NAME);
    writeFileSync(path, JSON.stringify({ host: "127.0.0.1", port: 49152, logLevel: "warn" }));
    writeFileSync(`${dir}.server.json`, JSON.stringify({ port: 40000 }));
    roots.push(`${dir}.server.json`);
    expect(defaultServerConfigPath(dir)).toBe(path);
    const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runConfigure(dir, ["--port", "49210", "--json"]);
    expect(JSON.parse(String(output.mock.calls[0]![0])).next).toContain(
      `--base-dir ${JSON.stringify(dir)}`,
    );
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
      host: "127.0.0.1",
      port: 49210,
      logLevel: "warn",
    });
    expect(resolveServeSettings({ flags: {}, env: {}, defaultConfigPath: path })).toMatchObject({
      remoteAccessPort: 49210,
      logLevel: "warn",
    });
    const before = readFileSync(path, "utf8");
    await expect(runConfigure(dir, ["--port", "70000"])).rejects.toThrow(
      "Invalid server configuration",
    );
    expect(readFileSync(path, "utf8")).toBe(before);
    await runConfigure(dir, ["--show", "--json"]);
    expect(readFileSync(path, "utf8")).toBe(before);
  });
  it.each([true, false])(
    "redacts credentials and treats control characters as error data (json: %s)",
    (json) => {
      const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      const errorOutput = vi.spyOn(process.stderr, "write").mockReturnValue(true);
      reportAdminError(new Error("fixture\u001b[2J\r\nBearer synthetic-key"), json);
      const text = String((json ? output : errorOutput).mock.calls[0]![0]);
      expect(text).not.toContain("synthetic-key");
      expect(text).not.toContain("\u001b");
      expect(json ? JSON.parse(text) : text).toEqual(
        json
          ? {
              ok: false,
              error: "fixture\u001b[2J\r\nBearer [redacted]",
            }
          : "[poracode] fixture\\u001b[2J\\u000d\\u000aBearer [redacted]\n",
      );
      expect(process.exitCode).toBe(1);
    },
  );

  it("emits actionable, structured errors", () => {
    const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    reportAdminError(
      new Error("Current Poracode host control is unavailable for this profile."),
      true,
    );
    expect(JSON.parse(String(output.mock.calls[0]![0]))).toMatchObject({
      ok: false,
      error: expect.stringContaining("poracode serve"),
    });
    expect(process.exitCode).toBe(1);
  });
});
