import { OpenCode2PluginsSettings } from "@/renderer/components/providers/opencode2/OpenCode2PluginsSettings";
import { Trans } from "@lingui/react/macro";
import type { AgentStatus } from "@/shared/contracts";
import { ProviderCredentialAccounts } from "./ProviderCredentialAccounts";
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
  const { agentKind, statuses, wslDistros } = props;

  return (
    <>
      <ProviderCredentialAccounts
        agentKind={agentKind}
        statuses={statuses}
        wslDistros={wslDistros}
        fallbackLabel="OpenCode 2"
        description={
          <Trans>Connect the AI providers OpenCode 2 can use and sign out of them here.</Trans>
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
    </>
  );
}
