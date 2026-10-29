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
} from "../settings/ProviderAccountsSection";

// Mirrors FX_BACKENDS in the supervisor's fx/credentials.ts; keep them in sync.
const FX_SIGN_IN_BACKENDS = [
  { id: "vercel", label: "Vercel AI Gateway" },
  { id: "codex", label: "Codex" },
  { id: "grok", label: "Grok" },
] as const;

/**
 * fx credential management. fx signs in to one AI backend at a time (AI
 * Gateway, Codex, Grok), so the panel lists the signed-in backends and Add
 * offers the rest; login runs in the terminal overlay and Logout is fx's own
 * non-interactive `fx logout <backend>`.
 */
export function FxProviderSettings(props: {
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
  const label = status?.label ?? "fx";
  const providers = status?.providerMetadata?.connectedProviders ?? [];
  const addOptions = FX_SIGN_IN_BACKENDS.filter(
    (backend) => !providers.some((provider) => provider.id === backend.id),
  );

  const clearPending = (key: string) =>
    setPendingKey((current) => (current === key ? undefined : current));

  const refreshStatuses = () =>
    readBridge().refreshAgentStatuses(wslDistros, { agentKinds: [agentKind] });

  const addProvider = (optionId?: string) => {
    const command = status?.loginCommand;
    if (!command || !optionId) return;
    const project = findProjectForStatus(status, useAppStore.getState().projects);
    if (!project && (status?.envKind === "windows" || status?.envKind === "wsl")) {
      toast.warning(t`Add a project in this environment before signing in.`);
      return;
    }
    setPendingKey(ADD_PROVIDER_KEY);
    const opened = runAgentLoginCommand({
      label,
      command: `${command} ${optionId}`,
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
          <Trans>Sign in to the AI backends fx can use, and sign out of them here.</Trans>
        }
        providers={providers}
        pendingKey={pendingKey}
        addOptions={addOptions}
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
