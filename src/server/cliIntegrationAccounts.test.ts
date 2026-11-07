import { afterEach, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import { runAdminCli } from "./cliAdmin";
import { cliCommandHelp } from "./cliHelp";
import { hostAdminRequestSchema } from "@/shared/hostAdminProtocol";

const control = vi.hoisted(() =>
  vi.fn<
    (
      ...args: Parameters<typeof import("@/backend/ownership/hostControlClient").callHostControl>
    ) => Promise<unknown>
  >(),
);
const prompt = vi.hoisted(() => vi.fn<typeof import("./cliPrompts").promptCli>());
vi.mock("@/backend/ownership/hostControlClient", async (original) => ({
  ...(await original<typeof import("@/backend/ownership/hostControlClient")>()),
  callHostControl: control,
}));
vi.mock("./cliPrompts", async (original) => ({
  ...(await original<typeof import("./cliPrompts")>()),
  promptCli: prompt,
}));
const originalTty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
const account = {
  id: "a41082c9-a0ae-49cd-a9e4-8ee7bce11f3d",
  pluginName: "fixture",
  serverName: "tools",
  label: "Work",
  scopes: ["read"],
  status: "connected",
  selected: true,
};
const accounts = {
  formatVersion: 1,
  scope: "plugin-service-accounts",
  pluginName: "fixture",
  operation: "list",
  accounts: [account],
};
const status = {
  formatVersion: 1,
  scope: "saved-user-oauth",
  server: {
    id: "tools",
    name: "Tools",
    enabled: true,
    transport: "http",
    timeoutMs: 10000,
    disabledToolCount: 0,
  },
  usableCredentials: true,
  headerAuthorization: false,
  sharedServerIds: ["tools", "other"],
  serverRevision: "ab".repeat(32),
};
function owner(result: (command: Record<string, unknown>) => unknown) {
  control.mockImplementation(async (_paths, operation, options) => {
    if (operation === "describe") return { ownerGeneration: "selected-owner" };
    const request = hostAdminRequestSchema.parse(options?.payload);
    return {
      result: {
        adminVersion: request.adminVersion,
        outcome: { ok: true, data: result(request.command) },
      },
    };
  });
}
function commands() {
  return control.mock.calls
    .filter((call) => call[1] === "admin")
    .map((call) => hostAdminRequestSchema.parse(call[2]?.payload).command);
}
afterEach(() => {
  control.mockReset();
  prompt.mockReset();
  vi.restoreAllMocks();
  if (originalTty) Object.defineProperty(process.stdin, "isTTY", originalTty);
  else Reflect.deleteProperty(process.stdin, "isTTY");
});

it("lists exact plugin service account metadata through its pinned owner", async () => {
  owner(() => accounts);
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  await runAdminCli(resolve("tmp/unused-account-profile"), [
    "plugins",
    "accounts",
    "list",
    "fixture",
    "--json",
  ]);
  expect(commands()).toEqual([{ action: "plugin-accounts-list", pluginName: "fixture" }]);
  expect(control.mock.calls.filter((call) => call[1] === "describe")).toHaveLength(1);
  expect(control.mock.calls[1]![2]!.expectedGeneration).toBe("selected-owner");
  expect(JSON.parse(String(output.mock.calls[0]![0]))).toEqual(accounts);
});

it("reports saved-user OAuth status without returning a URL or another credential domain", async () => {
  owner(() => status);
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  await runAdminCli(resolve("tmp/unused-account-profile"), [
    "mcp",
    "auth",
    "status",
    "tools",
    "--json",
  ]);
  expect(commands()).toEqual([{ action: "mcp-auth-status", serverId: "tools" }]);
  expect(JSON.parse(String(output.mock.calls[0]![0]))).toEqual(status);
});

it("retains one owner and the reviewed MCP revision through scripted logout", async () => {
  const cleared = {
    formatVersion: 1,
    scope: "saved-user-oauth",
    serverId: "tools",
    loggedOut: true,
    headerAuthorization: false,
    sharedServerIds: status.sharedServerIds,
  };
  owner((command) => (command.action === "mcp-auth-status" ? status : cleared));
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  await runAdminCli(resolve("tmp/unused-account-profile"), [
    "mcp",
    "auth",
    "logout",
    "tools",
    "--yes",
    "--json",
  ]);
  expect(commands()).toEqual([
    { action: "mcp-auth-status", serverId: "tools" },
    { action: "mcp-auth-logout", serverId: "tools", expectedServerRevision: status.serverRevision },
  ]);
  expect(control.mock.calls.filter((call) => call[1] === "describe")).toHaveLength(1);
  for (const invocation of control.mock.calls.filter((call) => call[1] === "admin")) {
    expect(invocation[2]!.expectedGeneration).toBe("selected-owner");
    expect(hostAdminRequestSchema.parse(invocation[2]?.payload).adminVersion).toBe(10);
  }
  expect(JSON.parse(String(output.mock.calls[0]![0]))).toEqual(cleared);
});

it.each(["select", "logout"])(
  "targets the exact plugin/server/account for %s",
  async (operation) => {
    owner(() => ({
      ...accounts,
      operation,
      accounts: [{ ...account, status: operation === "logout" ? "disconnected" : "connected" }],
    }));
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runAdminCli(resolve("tmp/unused-account-profile"), [
      "plugins",
      "accounts",
      operation,
      "fixture",
      "--server",
      "tools",
      "--account",
      account.id,
      "--json",
      ...(operation === "logout" ? ["--yes"] : []),
    ]);
    expect(commands()).toEqual([
      {
        action: `plugin-account-${operation}`,
        pluginName: "fixture",
        serverName: "tools",
        accountId: account.id,
      },
    ]);
  },
);

it.each(
  [
    [
      "plugins",
      "accounts",
      "logout",
      "fixture",
      "--server",
      "tools",
      "--account",
      account.id,
      "--json",
    ],
    ["mcp", "auth", "logout", "tools", "--json"],
    ["mcp", "auth", "status", "tools", "--wsl", "Ubuntu"],
    ["plugins", "accounts", "list", "fixture", "--account", account.id],
    ["plugins", "accounts", "select", "fixture", "--server", "tools", "--account", "wrong"],
    ["mcp", "auth", "status", "tools", "extra"],
    ["mcp", "auth", "status", "tools", "--credential-key", "private"],
  ].map((args) => ({ args })),
)(
  "refuses incomplete or cross-domain input before contacting an owner ($args)",
  async ({ args }) => {
    await expect(runAdminCli(resolve("tmp/unused-account-profile"), args)).rejects.toThrow(
      /Usage:|Unknown option|Logout clears/iu,
    );
    expect(control).not.toHaveBeenCalled();
  },
);

it.each([
  { ...accounts, pluginName: "other" },
  { ...accounts, operation: "logout" },
  { ...accounts, authorization: { status: "authorized" } },
  { ...accounts, accounts: [{ ...account, secret: "synthetic-private" }] },
  { ...accounts, accounts: [account, account] },
  { ...accounts, formatVersion: 2 },
])("refuses mismatched/future/private account metadata without printing (%j)", async (reply) => {
  owner(() => reply);
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  await expect(
    runAdminCli(resolve("tmp/unused-account-profile"), [
      "plugins",
      "accounts",
      "list",
      "fixture",
      "--json",
    ]),
  ).rejects.toThrow(/Unrecognized|expected|different|Invalid/iu);
  expect(output).not.toHaveBeenCalled();
});

it("refuses a different MCP status target before clearing any credentials", async () => {
  owner(() => ({ ...status, server: { ...status.server, id: "other" } }));
  await expect(
    runAdminCli(resolve("tmp/unused-account-profile"), [
      "mcp",
      "auth",
      "logout",
      "tools",
      "--yes",
      "--json",
    ]),
  ).rejects.toThrow("different MCP");
  expect(commands()).toHaveLength(1);
});

it("explains account credential boundaries in focused help", () => {
  expect(cliCommandHelp("plugins", "accounts")).toContain("local-admin v10");
  expect(cliCommandHelp("plugins", "accounts")).toContain("Provider logins");
  expect(cliCommandHelp("mcp", "auth")).toContain("shared by exact URL");
  expect(cliCommandHelp("mcp", "auth")).toContain("Authorization headers");
});

it("shows a terminal the shared slot and requires the exact ID before clearing", async () => {
  Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
  owner(() => status);
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const warning = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  prompt.mockResolvedValue("different");
  await expect(
    runAdminCli(resolve("tmp/unused-account-profile"), ["mcp", "auth", "logout", "tools"]),
  ).rejects.toThrow("cancelled");
  expect(commands()).toEqual([{ action: "mcp-auth-status", serverId: "tools" }]);
  expect(String(warning.mock.calls[0]![0])).toContain("tools, other");
  expect(prompt).toHaveBeenCalledExactlyOnceWith("Type tools to clear this shared OAuth slot: ");
  expect(output).not.toHaveBeenCalled();
});

it("asks for the exact plugin account UUID and cancels without credential requests", async () => {
  Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
  owner(() => accounts);
  prompt.mockResolvedValue("different");
  await expect(
    runAdminCli(resolve("tmp/unused-account-profile"), [
      "plugins",
      "accounts",
      "logout",
      "fixture",
      "--server",
      "tools",
      "--account",
      account.id,
    ]),
  ).rejects.toThrow("cancelled");
  expect(commands()).toEqual([]);
});
