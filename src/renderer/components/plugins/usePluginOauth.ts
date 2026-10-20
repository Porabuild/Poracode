import { useEffect, useState, useRef } from "react";
import { useLingui } from "@lingui/react/macro";
import type { LoadedPlugin } from "@/shared/contracts";
import type { PluginAccount } from "@/shared/contracts/pluginCatalog";
import { readBridge } from "@/renderer/bridge";

type ConnectionState = "unknown" | "connected" | "disconnected" | "connecting";

/** Plugin service accounts use supervisor-owned credential slots, never provider accounts or URL-global tokens. */
export function usePluginOauth(plugin: LoadedPlugin) {
  const { t } = useLingui();
  const [accounts, setAccounts] = useState<PluginAccount[]>();
  const [pending, setPending] = useState<{ serverName: string; kind: "connect" | "disconnect" }>();
  const pendingRef = useRef(false);
  const pendingAccount = useRef<{ serverName: string; accountId: string } | undefined>(undefined);
  const cancelled = useRef(false);
  const [error, setError] = useState<string>();
  const hasRemoteServer =
    plugin.source !== "project" &&
    plugin.mcpServers.some((server) => server.entry.type !== "stdio");

  const refresh = async () => {
    try {
      const result = await readBridge().pluginAccounts({ action: "list", pluginName: plugin.name });
      setAccounts(result.accounts);
    } catch {
      setAccounts(undefined);
    }
  };

  useEffect(() => {
    setAccounts(undefined);
    if (hasRemoteServer) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- package identity owns this account list.
  }, [hasRemoteServer, plugin.name, plugin.root]);

  const stateFor = (serverName: string): ConnectionState => {
    if (pending?.serverName === serverName && pending.kind === "connect") return "connecting";
    if (!accounts) return "unknown";
    return accounts.some(
      (account) =>
        account.serverName === serverName && account.selected && account.status === "connected",
    )
      ? "connected"
      : "disconnected";
  };

  const connect = async (
    serverName: string,
    label?: string,
    newAccount = false,
    accountId?: string,
  ) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    cancelled.current = false;
    setPending({ serverName, kind: "connect" });
    setError(undefined);
    try {
      const bridge = readBridge();
      const selected = newAccount
        ? undefined
        : accounts?.find(
            (account) =>
              account.serverName === serverName &&
              (accountId ? account.id === accountId : account.selected),
          );
      const result = await bridge.pluginAccounts({
        action: "begin",
        pluginName: plugin.name,
        serverName,
        label: label?.trim() || selected?.label || serverName,
        ...(selected ? { accountId: selected.id } : {}),
      });
      setAccounts(result.accounts);
      if (result.accountId) pendingAccount.current = { serverName, accountId: result.accountId };
      const begin = result.authorization;
      if (!begin || begin.status === "error") {
        setError(t`Could not sign in to ${serverName}.`);
        return;
      }
      if (begin.status === "redirect") {
        await bridge.openExternalNative(begin.authorizationUrl);
        const completed = await bridge.waitMcpServerOauth({ flowId: begin.flowId });
        if (completed.status === "error" && !cancelled.current)
          setError(t`Could not sign in to ${serverName}.`);
      }
      await refresh();
    } catch {
      if (!cancelled.current) setError(t`Could not sign in to ${serverName}.`);
    } finally {
      pendingAccount.current = undefined;
      pendingRef.current = false;
      setPending(undefined);
    }
  };

  const disconnect = async (serverName: string, accountId?: string) => {
    const account = accounts?.find(
      (candidate) =>
        candidate.serverName === serverName &&
        (accountId ? candidate.id === accountId : candidate.selected),
    );
    if (!account || pendingRef.current) return;
    pendingRef.current = true;
    setPending({ serverName, kind: "disconnect" });
    setError(undefined);
    try {
      const result = await readBridge().pluginAccounts({
        action: "logout",
        pluginName: plugin.name,
        serverName,
        accountId: account.id,
      });
      setAccounts(result.accounts);
    } catch {
      setError(t`Could not sign out of ${serverName}.`);
    } finally {
      pendingRef.current = false;
      setPending(undefined);
    }
  };

  const select = async (account: PluginAccount) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending({ serverName: account.serverName, kind: "connect" });
    setError(undefined);
    try {
      const result = await readBridge().pluginAccounts({
        action: "select",
        pluginName: plugin.name,
        serverName: account.serverName,
        accountId: account.id,
      });
      setAccounts(result.accounts);
    } catch {
      setError(t`Could not sign in to ${account.serverName}.`);
    } finally {
      pendingRef.current = false;
      setPending(undefined);
    }
  };

  const cancel = async () => {
    const account = pendingAccount.current;
    if (!account) return;
    cancelled.current = true;
    try {
      await readBridge().pluginAccounts({ action: "logout", pluginName: plugin.name, ...account });
    } catch {
      setError(t`Could not sign out of ${account.serverName}.`);
    }
  };

  return {
    accounts: accounts ?? [],
    stateFor,
    isRemoteServer: (serverName: string) =>
      plugin.source !== "project" &&
      plugin.mcpServers.some(
        (server) =>
          server.name === serverName &&
          server.entry.type !== "stdio" &&
          !Object.keys(server.entry.headers).some((key) => key.toLowerCase() === "authorization"),
      ),
    isBusy: pending !== undefined,
    isPending: (serverName: string) => pending?.serverName === serverName,
    canCancel: pendingAccount.current !== undefined,
    connect,
    disconnect,
    select,
    cancel,
    error,
  };
}

export type PluginOauthConnectionState = ConnectionState;
