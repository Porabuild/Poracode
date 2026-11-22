import { OpenCodePluginsSettings } from "@/renderer/components/providers/opencode/OpenCodePluginsSettings";
import { Trans } from "@lingui/react/macro";
import type { AgentStatus } from "@/shared/contracts";
import { ProviderCredentialAccounts } from "./ProviderCredentialAccounts";

/**
 * OpenCode credential management. It authenticates per upstream AI provider, so
 * the panel lists the connected providers rather than offering one sign-in.
 * Adding one runs `auth login` in the terminal overlay (the CLI owns the OAuth
 * and API-key flows); signing out goes straight through the server's credential
 * API, so it never leaves this page.
 */
export function OpenCodeProviderSettings(props: {
  agentKind: string;
  statuses: readonly AgentStatus[];
  wslDistros: string[];
}) {
  const { agentKind, statuses, wslDistros } = props;

  return (
    <>
      <ProviderCredentialAccounts
        agentKind={agentKind}
        statuses={statuses}
        wslDistros={wslDistros}
        fallbackLabel="OpenCode"
        description={
          <Trans>Connect the AI providers OpenCode can use and sign out of them here.</Trans>
        }
      />

      <OpenCodePluginsSettings agentKind={agentKind} statuses={statuses} />
    </>
  );
}
