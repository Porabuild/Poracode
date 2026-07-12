import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { McpServer } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";

export interface McpServerOauthApi {
  /** Transport URLs with stored OAuth credentials. */
  authenticatedUrls: ReadonlySet<string>;
  /** Server ids with a sign-in or sign-out currently in flight. */
  busyServerIds: ReadonlySet<string>;
  /** Runs the browser sign-in flow; resolves `true` when tokens were stored. */
  authenticate: (server: McpServer) => Promise<boolean>;
  /** Deletes stored credentials for the server's URL. */
  signOut: (server: McpServer) => Promise<void>;
}

function transportUrl(server: McpServer): string | undefined {
  return server.transport.type === "http" || server.transport.type === "sse"
    ? server.transport.url
    : undefined;
}

async function refreshAuthenticatedUrls(
  setAuthenticatedUrls: Dispatch<SetStateAction<ReadonlySet<string>>>,
): Promise<void> {
  try {
    const status = await readBridge().getMcpOauthStatus();
    setAuthenticatedUrls(new Set(status.authenticatedUrls));
  } catch {
    // Status is presentational only; keep the previous snapshot.
  }
}

/**
 * OAuth sign-in state for user-configured HTTP/SSE MCP servers. Tokens live in
 * the supervisor; the renderer only tracks which URLs are authenticated and
 * hands the authorization URL to the system browser.
 */
export function useMcpServerOauth(): McpServerOauthApi {
  const { t } = useLingui();
  const [authenticatedUrls, setAuthenticatedUrls] = useState<ReadonlySet<string>>(new Set());
  const [busyServerIds, setBusyServerIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    void refreshAuthenticatedUrls(setAuthenticatedUrls);
  }, []);

  const setBusy = (serverId: string, busy: boolean) => {
    setBusyServerIds((current) => {
      const next = new Set(current);
      if (busy) next.add(serverId);
      else next.delete(serverId);
      return next;
    });
  };

  const authenticate = async (server: McpServer): Promise<boolean> => {
    const serverName = server.name;
    if (!transportUrl(server)) return false;
    setBusy(server.id, true);
    try {
      const begin = await readBridge().beginMcpServerOauth({ server });
      if (begin.status === "error") {
        const message = begin.message;
        toast.danger(t`Could not sign in to ${serverName}: ${message}`);
        return false;
      }
      if (begin.status === "redirect") {
        // OAuth consent always goes to the system browser (matching agent
        // login): that's where the user's sessions and password manager live.
        await readBridge().openExternalNative(begin.authorizationUrl);
        const result = await readBridge().waitMcpServerOauth({ flowId: begin.flowId });
        if (result.status === "error") {
          const message = result.message;
          toast.danger(t`Could not sign in to ${serverName}: ${message}`);
          return false;
        }
      }
      toast.success(t`Signed in to ${serverName}.`);
      await refreshAuthenticatedUrls(setAuthenticatedUrls);
      return true;
    } catch {
      toast.danger(t`Could not sign in to ${serverName}.`);
      return false;
    } finally {
      setBusy(server.id, false);
    }
  };

  const signOut = async (server: McpServer): Promise<void> => {
    const serverName = server.name;
    const url = transportUrl(server);
    if (!url) return;
    setBusy(server.id, true);
    try {
      await readBridge().clearMcpServerOauth({ url });
      toast.success(t`Signed out of ${serverName}.`);
      await refreshAuthenticatedUrls(setAuthenticatedUrls);
    } catch {
      toast.danger(t`Could not sign out of ${serverName}.`);
    } finally {
      setBusy(server.id, false);
    }
  };

  return { authenticatedUrls, busyServerIds, authenticate, signOut };
}
