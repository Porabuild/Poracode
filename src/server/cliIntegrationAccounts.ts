import { parseArgs } from "node:util";
import type { z } from "zod";
import {
  hostAdminV10CommandSchema,
  hostAdminPluginAccountsSchema,
  hostAdminMcpAuthStatusSchema,
  hostAdminMcpAuthLogoutSchema,
  type HostAdminCommand,
} from "@/shared/hostAdminProtocol";
import { promptCli, terminalText } from "./cliPrompts";

type AccountCommand = z.infer<typeof hostAdminV10CommandSchema>;
type Request = (command: HostAdminCommand) => Promise<unknown>;

export function parseIntegrationAccountCli(args: readonly string[]) {
  const [group, area, operation, ...rest] = args;
  if ((group !== "plugins" || area !== "accounts") && (group !== "mcp" || area !== "auth"))
    return undefined;
  const plugin = group === "plugins";
  const usage = plugin
    ? "Usage: poracode plugins accounts list|select|logout PLUGIN [--server NAME --account UUID] [--yes (logout)] [--json]."
    : "Usage: poracode mcp auth status|logout SERVER_ID [--yes (logout)] [--json].";
  if (!(plugin ? ["list", "select", "logout"] : ["status", "logout"]).includes(operation ?? ""))
    throw new Error(usage);
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    strict: true,
    options: {
      json: { type: "boolean" },
      ...(operation === "logout" ? { yes: { type: "boolean" as const } } : {}),
      ...(plugin && operation !== "list"
        ? {
            server: { type: "string" as const },
            account: { type: "string" as const },
          }
        : {}),
    },
  });
  if (positionals.length !== 1) throw new Error(usage);
  const command = hostAdminV10CommandSchema.safeParse(
    plugin
      ? operation === "list"
        ? { action: "plugin-accounts-list", pluginName: positionals[0] }
        : {
            action: `plugin-account-${operation}`,
            pluginName: positionals[0],
            serverName: values.server,
            accountId: values.account,
          }
      : { action: "mcp-auth-status", serverId: positionals[0] },
  );
  if (!command.success) throw new Error(usage);
  return {
    command: command.data,
    operation: operation!,
    json: values.json === true,
    yes: values.yes === true,
  };
}

function parseResult(command: AccountCommand, result: unknown) {
  if (command.action === "mcp-auth-status") {
    const data = hostAdminMcpAuthStatusSchema.parse(result);
    if (
      data.server.id !== command.serverId ||
      !data.sharedServerIds.includes(command.serverId) ||
      new Set(data.sharedServerIds).size !== data.sharedServerIds.length
    )
      throw new Error(
        "The owner returned a different MCP authentication target; no metadata was printed.",
      );
    return data;
  }
  if (command.action === "mcp-auth-logout") {
    const data = hostAdminMcpAuthLogoutSchema.parse(result);
    if (
      data.serverId !== command.serverId ||
      !data.sharedServerIds.includes(command.serverId) ||
      new Set(data.sharedServerIds).size !== data.sharedServerIds.length
    )
      throw new Error(
        "The owner returned a different MCP logout target. Inspect mcp auth status before retrying.",
      );
    return data;
  }
  const data = hostAdminPluginAccountsSchema.parse(result);
  const operation =
    command.action === "plugin-accounts-list"
      ? "list"
      : command.action === "plugin-account-select"
        ? "select"
        : "logout";
  if (
    data.pluginName !== command.pluginName ||
    data.operation !== operation ||
    data.accounts.some((account) => account.pluginName !== command.pluginName) ||
    new Set(data.accounts.map((account) => account.id)).size !== data.accounts.length
  )
    throw new Error(
      "The owner returned a different plugin account inventory; no accounts were printed.",
    );
  if (command.action !== "plugin-accounts-list") {
    const selected = data.accounts.find(
      (account) => account.id === command.accountId && account.serverName === command.serverName,
    );
    if (
      !selected ||
      (operation === "select"
        ? !selected.selected || selected.status !== "connected"
        : selected.status !== "disconnected")
    )
      throw new Error(
        "The owner did not confirm the requested account change. Inspect plugins accounts list before retrying.",
      );
  }
  return data;
}

function renderResult(data: ReturnType<typeof parseResult>) {
  if (data.scope === "plugin-service-accounts")
    return (
      `Plugin service accounts: ${terminalText(data.pluginName)}\n` +
      (data.accounts.length
        ? data.accounts
            .map(
              (account) =>
                `${terminalText(account.id)}  ${terminalText(account.serverName)}  ${account.status}${account.selected ? " (selected)" : ""}  ${terminalText(account.label)}\n  Scopes: ${account.scopes.map(terminalText).join(", ") || "none reported"}\n`,
            )
            .join("")
        : "None.\n") +
      "Local service-account metadata; upstream identity is not inferred from the label. Provider accounts are separate.\n"
    );
  if ("server" in data)
    return (
      `Saved user MCP OAuth: ${terminalText(data.server.id)} (${terminalText(data.server.name)})\n` +
      `Stored credentials: ${data.usableCredentials ? "usable or refreshable" : "none reported usable"}. No connection probe.\n` +
      `Configured Authorization header: ${data.headerAuthorization ? "present; takes precedence" : "absent"}.\n` +
      `Shared credential slot: ${data.sharedServerIds.map(terminalText).join(", ")}.\n`
    );
  return (
    `Cleared saved user MCP OAuth credentials for ${terminalText(data.serverId)}.\n` +
    `Shared slot: ${data.sharedServerIds.map(terminalText).join(", ")}. Configuration, plugin/provider accounts and running sessions were retained.\n` +
    (data.headerAuthorization
      ? "The configured Authorization header remains active; change it with mcp configure if needed.\n"
      : "")
  );
}

export async function runIntegrationAccountCli(
  input: NonNullable<ReturnType<typeof parseIntegrationAccountCli>>,
  connect: () => Promise<Request>,
) {
  let command = input.command;
  if (input.operation === "logout" && !input.yes && (!process.stdin.isTTY || input.json))
    throw new Error(
      "Logout clears locally stored credentials. Pass --yes with the exact target for scripts or --json.",
    );
  const request = await connect();
  if (command.action === "mcp-auth-status" && input.operation === "logout") {
    const status = hostAdminMcpAuthStatusSchema.parse(parseResult(command, await request(command)));
    if (!input.yes) {
      process.stderr.write(renderResult(status));
      const answer = await promptCli(
        `Type ${terminalText(command.serverId)} to clear this shared OAuth slot: `,
      );
      if (answer !== command.serverId)
        throw new Error("MCP logout cancelled; no credentials were cleared.");
    }
    command = {
      action: "mcp-auth-logout",
      serverId: command.serverId,
      expectedServerRevision: status.serverRevision,
    };
  } else if (command.action === "plugin-account-logout" && !input.yes) {
    const answer = await promptCli(
      `Type ${terminalText(command.accountId)} to sign out ${terminalText(command.pluginName)}/${terminalText(command.serverName)} locally: `,
    );
    if (answer !== command.accountId)
      throw new Error("Plugin logout cancelled; no credentials were cleared.");
  }
  const result = parseResult(command, await request(command));
  process.stdout.write(input.json ? `${JSON.stringify(result)}\n` : renderResult(result));
}
