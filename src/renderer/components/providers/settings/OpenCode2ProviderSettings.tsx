import { OpenCode2PluginsSettings } from "@/renderer/components/providers/opencode2/OpenCode2PluginsSettings";
import { useState } from "react";
import { toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { AgentConnectedProvider, AgentStatus } from "@/shared/contracts";
import { agentEnvForStatus } from "@/shared/machines";
import { runAgentLoginCommand } from "@/renderer/actions/agentLoginActions";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { findProjectForStatus } from "@/renderer/utils/acpRegistryAuth";
import { ConfirmDialog } from "@/renderer/components/common";
import { friendlyError } from "@/shared/messages";
import {
  ADD_PROVIDER_KEY,
  ProviderAccountsSection,
  providerActionKey,
} from "./ProviderAccountsSection";
import { ProviderMcpServersSection } from "./ProviderMcpServersSection";

/**
 * OpenCode 2 credential management. Like OpenCode 1 it authenticates per
 * upstream AI provider, so the panel lists the connected providers rather than
 * offering one sign-in. Adding one runs `auth login` in the terminal overlay
 * (the CLI owns the OAuth and API-key flows); signing out goes straight through
 * the V2 server's credential API, so it never leaves this page.
 *
 */
export function OpenCode2ProviderSettings(props: {
  agentKind: string;
  statuses: readonly AgentStatus[];
  wslDistros: string[];
}) {
  const { t } = useLingui();
  const { agentKind, statuses, wslDistros } = props;
  const [pendingKey, setPendingKey] = useState<string | undefined>();
  const [signingOut, setSigningOut] = useState<
    { provider: AgentConnectedProvider; key: string } | undefined
  >();

  const status = statuses.find((entry) => entry.envKind !== "wsl") ?? statuses[0];
  const label = status?.label ?? "OpenCode 2";
  const providers = status?.providerMetadata?.connectedProviders ?? [];

  const clearPending = (key: string) =>
    setPendingKey((current) => (current === key ? undefined : current));

  const refreshStatuses = () =>
    readBridge().refreshAgentStatuses(wslDistros, { agentKinds: [agentKind] });

  const addProvider = () => {
    const command = status?.loginCommand;
    if (!command) return;
    const project = findProjectForStatus(status, useAppStore.getState().projects);
    if (!project && (status?.envKind === "windows" || status?.envKind === "wsl")) {
      toast.warning(t`Add a project in this environment before signing in.`);
      return;
    }
    setPendingKey(ADD_PROVIDER_KEY);
    const opened = runAgentLoginCommand({
      label,
      command,
      ...(project ? { project } : {}),
      onCommandComplete: (exitCode) => {
        if (exitCode !== 0) {
          clearPending(ADD_PROVIDER_KEY);
          return;
        }
        void refreshStatuses()
          .catch((error) => toast.danger(friendlyError(error)))
          .finally(() => clearPending(ADD_PROVIDER_KEY));
      },
    });
    if (!opened) clearPending(ADD_PROVIDER_KEY);
  };

  const signOut = async (provider: AgentConnectedProvider, key: string) => {
    // Rows come from the credential list, so every one carries its removal id.
    if (!provider.id || !status) return;
    setPendingKey(key);
    try {
      await readBridge().manageAgentCredentials({
        agentKind,
        env: agentEnvForStatus(status),
        action: "remove",
        credentialId: provider.id,
      });
      await refreshStatuses();
    } catch (error) {
      toast.danger(friendlyError(error));
    } finally {
      clearPending(key);
    }
  };

  return (
    <>
      <ProviderAccountsSection
        agentKind={agentKind}
        description={
          <Trans>Connect the AI providers OpenCode 2 can use and sign out of them here.</Trans>
        }
        providers={providers}
        pendingKey={pendingKey}
        {...(!status?.loginCommand ? { addDisabled: true } : {})}
        onAdd={addProvider}
        onSignOut={(provider, index) =>
          setSigningOut({ provider, key: providerActionKey(provider, index) })
        }
      />

      <ProviderMcpServersSection
        agentKind={agentKind}
        description={
          <Trans>
            These built-in MCP servers are shared by OpenCode 2 threads. Saving updates running GUI
            projects; removing a server can interrupt an active turn. Terminal threads pick up
            changes on their next launch.
          </Trans>
        }
      />
      <OpenCode2PluginsSettings agentKind={agentKind} statuses={statuses} />
      <ConfirmDialog
        isOpen={signingOut !== undefined}
        title={t`Sign out of ${signingOut?.provider.label ?? ""}`}
        body={
          <Trans>
            Remove the saved credential for this provider? You can connect it again from Add
            provider.
          </Trans>
        }
        confirmLabel={t`Logout`}
        onConfirm={() => {
          const target = signingOut;
          setSigningOut(undefined);
          if (target) void signOut(target.provider, target.key);
        }}
        onClose={() => setSigningOut(undefined)}
      />
    </>
  );
}
