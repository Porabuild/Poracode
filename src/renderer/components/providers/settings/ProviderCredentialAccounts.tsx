import { useState, type ReactNode } from "react";
import { toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { AgentConnectedProvider, AgentStatus } from "@/shared/contracts";
import { agentEnvForStatus } from "@/shared/machines";
import { runAgentLoginCommand } from "@/renderer/actions/agentLoginActions";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { findProjectForStatus } from "@/renderer/utils/acpRegistryAuth";
import { ConfirmDialog } from "@/renderer/components/common";
import { friendlyError, localizeMessageSource } from "@/shared/messages";
import { SHARED_MESSAGE_DESCRIPTORS } from "@/renderer/i18n/sharedMessages";
import {
  ADD_PROVIDER_KEY,
  ProviderAccountsSection,
  providerActionKey,
} from "./ProviderAccountsSection";

/**
 * Connected-provider list for agents that sign in per upstream backend. Add
 * runs the agent's login command in the terminal overlay (with the chosen
 * option appended when `signInOptions` is set); Logout removes the saved
 * credential through `manageAgentCredentials` without leaving the page.
 */
export function ProviderCredentialAccounts(props: {
  agentKind: string;
  statuses: readonly AgentStatus[];
  wslDistros: string[];
  /** Name shown before any status has loaded. */
  fallbackLabel: string;
  description: ReactNode;
  /** Backends Add offers as `<loginCommand> <id>`; connected ones are left out. */
  signInOptions?: readonly { id: string; label: string }[];
}) {
  const { t } = useLingui();
  const { agentKind, statuses, wslDistros, signInOptions } = props;
  const [pendingKey, setPendingKey] = useState<string | undefined>();
  const [signingOut, setSigningOut] = useState<
    { provider: AgentConnectedProvider; key: string } | undefined
  >();

  const status = statuses.find((entry) => entry.envKind !== "wsl") ?? statuses[0];
  const label = status?.label ?? props.fallbackLabel;
  const providers = (status?.providerMetadata?.connectedProviders ?? []).map((provider) => ({
    ...provider,
    ...(provider.detail
      ? {
          detail:
            localizeMessageSource(provider.detail, (key) => t(SHARED_MESSAGE_DESCRIPTORS[key])) ??
            provider.detail,
        }
      : {}),
  }));
  const addOptions = signInOptions?.filter(
    (option) => !providers.some((provider) => provider.id === option.id),
  );

  const clearPending = (key: string) =>
    setPendingKey((current) => (current === key ? undefined : current));

  const refreshStatuses = () =>
    readBridge().refreshAgentStatuses(wslDistros, { agentKinds: [agentKind] });

  const addProvider = (optionId?: string) => {
    const command = status?.loginCommand;
    if (!command) return;
    if (signInOptions && !optionId) return;
    const project = findProjectForStatus(status, useAppStore.getState().projects);
    if (!project && (status?.envKind === "windows" || status?.envKind === "wsl")) {
      toast.warning(t`Add a project in this environment before signing in.`);
      return;
    }
    setPendingKey(ADD_PROVIDER_KEY);
    const opened = runAgentLoginCommand({
      label,
      command: optionId ? `${command} ${optionId}` : command,
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
        description={props.description}
        providers={providers}
        pendingKey={pendingKey}
        {...(addOptions ? { addOptions } : {})}
        {...(!status?.loginCommand ? { addDisabled: true } : {})}
        onAdd={addProvider}
        onSignOut={(provider, index) =>
          setSigningOut({ provider, key: providerActionKey(provider, index) })
        }
      />
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
