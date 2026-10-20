import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { McpOauthBeginResult, McpServer } from "@/shared/contracts";
import { DEFAULT_MCP_SERVER_TIMEOUT_MS } from "@/shared/contracts/mcpServer";
import {
  pluginAccountSchema,
  type PluginAccountsPayload,
  type PluginAccountsResult,
} from "@/shared/contracts/pluginCatalog";
import { pluginMcpServerId, pluginMcpServerName } from "@/shared/plugins/catalog";
import { writeFileAtomic } from "@/shared/atomicFile";
import type { McpOAuthService } from "../mcp/McpOAuthService";
import type { PluginRegistry } from "./PluginRegistry";

export const PLUGIN_ACCOUNT_STORE_VERSION = 1;
const accountRecordSchema = pluginAccountSchema
  .omit({ status: true, scopes: true })
  .extend({ url: z.string().min(1) })
  .strict();
const accountStoreSchema = z
  .object({
    version: z.literal(PLUGIN_ACCOUNT_STORE_VERSION),
    accounts: z.array(accountRecordSchema),
  })
  .strict();
type AccountRecord = z.infer<typeof accountRecordSchema>;

/** Opaque references stay inside the supervisor. They cannot alias a legacy URL credential slot. */
export function pluginAccountCredentialKey(
  account: Pick<AccountRecord, "pluginName" | "serverName" | "id" | "url">,
): string {
  return `plugin-account-v1:${JSON.stringify([account.pluginName, account.serverName, account.id, account.url])}`;
}

export class PluginAccountService {
  private readonly storePath: string;

  constructor(
    private readonly options: {
      baseDir: string;
      registry: PluginRegistry;
      oauth: Pick<
        McpOAuthService,
        "beginForCredential" | "credentialStatus" | "clearCredential" | "applyAuthorizationToServer"
      >;
    },
  ) {
    this.storePath = join(options.baseDir, "plugin-accounts.json");
  }

  async manage(payload: PluginAccountsPayload): Promise<PluginAccountsResult> {
    const plugin = this.options.registry.getPlugin(payload.pluginName);
    if (!plugin) throw new Error("Plugin not found.");
    const store = this.readStore();
    const list = (): PluginAccountsResult => ({
      accounts: store.accounts
        .filter(
          (account) =>
            account.pluginName === plugin.name &&
            plugin.mcpServers.some(
              (server) =>
                server.name === account.serverName &&
                server.entry.type !== "stdio" &&
                server.entry.url.trim() === account.url,
            ),
        )
        .map(({ url: _url, ...account }) => ({
          ...account,
          ...this.options.oauth.credentialStatus(
            pluginAccountCredentialKey({ ...account, url: _url }),
          ),
        })),
    });
    if (payload.action === "list") return list();
    const declaration = plugin.mcpServers.find(
      (candidate) => candidate.name === payload.serverName,
    );
    if (!declaration || declaration.entry.type === "stdio")
      throw new Error("This service does not support MCP OAuth sign-in.");
    const entry = declaration.entry;
    const url = entry.url.trim();
    const server: McpServer = {
      id: pluginMcpServerId(plugin.name, declaration.name),
      name: pluginMcpServerName(plugin.name, declaration.name),
      description: "",
      enabled: true,
      timeoutMs: DEFAULT_MCP_SERVER_TIMEOUT_MS,
      transport: {
        type: entry.type === "streamable-http" ? "http" : "sse",
        url,
        headers: entry.headers,
      },
    };
    let account =
      "accountId" in payload && payload.accountId
        ? store.accounts.find(
            (candidate) =>
              candidate.id === payload.accountId &&
              candidate.pluginName === plugin.name &&
              candidate.serverName === declaration.name &&
              candidate.url === url,
          )
        : undefined;
    if (payload.action === "begin") {
      if (payload.accountId && !account) throw new Error("Plugin account not found.");
      if (Object.keys(entry.headers).some((key) => key.toLowerCase() === "authorization"))
        throw new Error(
          "This package supplies its own authorization header; OAuth accounts are unavailable.",
        );
      const created = !account;
      if (!account) {
        account = {
          id: randomUUID(),
          pluginName: plugin.name,
          serverName: declaration.name,
          url,
          label: payload.label,
          selected: !store.accounts.some(
            (candidate) =>
              candidate.pluginName === plugin.name &&
              candidate.serverName === declaration.name &&
              candidate.url === url &&
              candidate.selected,
          ),
        };
        store.accounts.push(account);
      } else account.label = payload.label;
      const accountId = account.id;
      this.writeStore(store);
      let authorization: McpOauthBeginResult;
      try {
        authorization = await this.options.oauth.beginForCredential(
          server,
          pluginAccountCredentialKey(account),
        );
      } catch (error) {
        if (created) {
          store.accounts = store.accounts.filter((candidate) => candidate.id !== accountId);
          this.writeStore(store);
        }
        throw error;
      }
      if (authorization.status === "error" && created) {
        store.accounts = store.accounts.filter((candidate) => candidate.id !== accountId);
        this.writeStore(store);
        return {
          ...(await this.manage({ action: "list", pluginName: plugin.name })),
          authorization,
        };
      }
      // Re-read metadata: a user may select or log out while the browser flow starts.
      return {
        ...(await this.manage({ action: "list", pluginName: plugin.name })),
        authorization,
        accountId: account.id,
      };
    }
    if (!account) throw new Error("Plugin account not found.");
    if (payload.action === "logout") {
      this.options.oauth.clearCredential(pluginAccountCredentialKey(account));
    } else {
      if (
        this.options.oauth.credentialStatus(pluginAccountCredentialKey(account)).status !==
        "connected"
      )
        throw new Error("Sign in before selecting this account.");
      for (const candidate of store.accounts) {
        if (candidate.pluginName === plugin.name && candidate.serverName === declaration.name)
          candidate.selected = candidate.id === account.id;
      }
      this.writeStore(store);
    }
    return list();
  }

  removePluginAccounts(pluginName: string): void {
    const store = this.readStore();
    for (const account of store.accounts.filter((candidate) => candidate.pluginName === pluginName))
      this.options.oauth.clearCredential(pluginAccountCredentialKey(account));
    store.accounts = store.accounts.filter((candidate) => candidate.pluginName !== pluginName);
    this.writeStore(store);
  }

  async applyAuthorization(servers: McpServer[]): Promise<McpServer[]> {
    const result = await Promise.all(
      servers.map((server) => this.applyAuthorizationToServer(server)),
    );
    return result.filter((server): server is McpServer => server !== undefined);
  }

  async applyAuthorizationToServer(server: McpServer): Promise<McpServer | undefined> {
    if (!server.id.startsWith("plugin:"))
      return this.options.oauth.applyAuthorizationToServer(server);
    if (server.transport.type === "stdio") return server;
    const transport = server.transport;
    if (Object.keys(transport.headers).some((key) => key.toLowerCase() === "authorization"))
      return server;
    const accounts = this.readStore().accounts.filter(
      (account) =>
        pluginMcpServerId(account.pluginName, account.serverName) === server.id &&
        account.url === transport.url,
    );
    if (accounts.length === 0) return server; // Public/unauthenticated MCP; never borrow legacy URL tokens.
    const account = accounts.find((candidate) => candidate.selected);
    if (
      !account ||
      this.options.oauth.credentialStatus(pluginAccountCredentialKey(account)).status !==
        "connected"
    )
      return undefined;
    const authorized = await this.options.oauth.applyAuthorizationToServer(
      server,
      pluginAccountCredentialKey(account),
    );
    const current = this.readStore().accounts.find(
      (candidate) => candidate.id === account.id && candidate.selected,
    );
    if (
      !current ||
      this.options.oauth.credentialStatus(pluginAccountCredentialKey(current)).status !==
        "connected"
    )
      return undefined;
    if (
      authorized.transport.type === "stdio" ||
      !Object.keys(authorized.transport.headers).some(
        (key) => key.toLowerCase() === "authorization",
      )
    )
      return undefined;
    return authorized;
  }

  private readStore(): z.infer<typeof accountStoreSchema> {
    if (!existsSync(this.storePath)) return { version: PLUGIN_ACCOUNT_STORE_VERSION, accounts: [] };
    return accountStoreSchema.parse(JSON.parse(readFileSync(this.storePath, "utf8")));
  }

  private writeStore(store: z.infer<typeof accountStoreSchema>): void {
    writeFileAtomic(this.storePath, `${JSON.stringify(store, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }
}
