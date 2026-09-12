import { useState } from "react";
import { Trans } from "@lingui/react/macro";
import type { AgentConnectedProvider, AgentStatus } from "@/shared/contracts";
import { runAgentLoginCommand } from "@/renderer/actions/agentLoginActions";
import { readBridge } from "@/renderer/bridge";
import {
  ADD_PROVIDER_KEY,
  ProviderAccountsSection,
  providerActionKey,
} from "./ProviderAccountsSection";
import { ProviderMcpServersSection } from "./ProviderMcpServersSection";

// auth.json provider ids are upstream slugs (e.g. `opencode`, `github-copilot`).
// Only pass an id straight into the shell command when it stays within that safe
// shape — anything else degrades to OpenCode's interactive picker rather than
// risk an injected logout argument.
const SAFE_PROVIDER_ID = /^[a-zA-Z0-9_.-]+$/;

/**
 * OpenCode credential management. OpenCode authenticates per upstream AI
 * provider (its `opencode providers` CLI), so instead of the generic single
 * sign-in row we surface the connected providers and drive add / remove through
 * the interactive terminal overlay, re-probing detection on completion so the
 * list reflects the change.
 */
export function OpenCodeProviderSettings(props: {
  agentKind: string;
  statuses: readonly AgentStatus[];
  wslDistros: string[];
}) {
  const { agentKind, statuses, wslDistros } = props;
  const [pendingKey, setPendingKey] = useState<string | undefined>();

  // Credentials live in a host-global auth.json, and only the native probe
  // resolves stable logout ids — prefer that status's provider list.
  const status = statuses.find((entry) => entry.envKind !== "wsl") ?? statuses[0];
  const label = status?.label ?? "OpenCode";
  const providers = status?.providerMetadata?.connectedProviders ?? [];

  const clearPending = (key: string) =>
    setPendingKey((current) => (current === key ? undefined : current));

  const runProviderCommand = (key: string, command: string) => {
    setPendingKey(key);
    const opened = runAgentLoginCommand({
      label,
      command,
      onCommandComplete: (exitCode) => {
        if (exitCode !== 0) {
          clearPending(key);
          return;
        }
        void readBridge()
          .refreshAgentStatuses(wslDistros, { agentKinds: [agentKind] })
          .finally(() => clearPending(key));
      },
    });
    if (!opened) clearPending(key);
  };

  const addProvider = () => runProviderCommand(ADD_PROVIDER_KEY, "opencode providers login");

  const logoutProvider = (provider: AgentConnectedProvider, index: number) => {
    const command =
      provider.id && SAFE_PROVIDER_ID.test(provider.id)
        ? `opencode providers logout ${provider.id}`
        : "opencode providers logout";
    runProviderCommand(providerActionKey(provider, index), command);
  };

  return (
    <>
      <ProviderAccountsSection
        agentKind={agentKind}
        description={
          <Trans>Connect the AI providers OpenCode can use and sign out of them here.</Trans>
        }
        providers={providers}
        pendingKey={pendingKey}
        onAdd={addProvider}
        onSignOut={logoutProvider}
      />

      <ProviderMcpServersSection
        agentKind={agentKind}
        description={
          <Trans>
            These built-in MCP servers are shared by OpenCode threads. Saving updates running GUI
            projects; removing a server can interrupt an active turn. Terminal threads pick up
            changes on their next launch.
          </Trans>
        }
      />
    </>
  );
}
