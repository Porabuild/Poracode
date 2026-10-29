import { Trans } from "@lingui/react/macro";
import type { AgentStatus } from "@/shared/contracts";
import { FX_BACKENDS } from "@/shared/agents/fxBackends";
import { ProviderCredentialAccounts } from "../settings/ProviderCredentialAccounts";

const FX_SIGN_IN_OPTIONS = FX_BACKENDS.map((backend) => ({
  id: backend.slug,
  label: backend.label,
}));

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
  return (
    <ProviderCredentialAccounts
      agentKind={props.agentKind}
      statuses={props.statuses}
      wslDistros={props.wslDistros}
      fallbackLabel="fx"
      description={<Trans>Sign in to the AI backends fx can use, and sign out of them here.</Trans>}
      signInOptions={FX_SIGN_IN_OPTIONS}
    />
  );
}
