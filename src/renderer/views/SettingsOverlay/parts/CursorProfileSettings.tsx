import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { AgentInstanceConfig } from "@/shared/contracts";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { NativeAgentProfileSupport } from "./agentRegistryNative";

/**
 * Cursor CLI cannot isolate a second login, so every profile is an SDK
 * account. The list subtitle names that runtime rather than repeating the key.
 */
function CursorProfileRuntimeLabel(_props: { instance: AgentInstanceConfig }) {
  const { t } = useLingui();
  return t`Cursor SDK`;
}

/**
 * Cursor's profile descriptor: a second account via User API key, running on
 * the SDK. CLI/ACP stay on the main Cursor tile. Everything structural lives
 * in `AgentProfileList`.
 */
export const cursorProfileSupport: NativeAgentProfileSupport = {
  driver: "cursor",
  description: (
    <Trans>
      Create a second Cursor account with its own User API key. Cursor CLI and ACP share one machine
      login, so they stay on the main Cursor tile.
    </Trans>
  ),
  field: {
    ariaLabel: msg`New Cursor profile API key`,
    placeholder: msg`Paste Cursor API key`,
    secret: true,
    required: true,
  },
  RowSubtitle: CursorProfileRuntimeLabel,
  removalBody: (profileName) => (
    <Trans>
      Removing {profileName} deletes its saved API key. Threads that use this profile will no longer
      find their agent.
    </Trans>
  ),
  createPayload: ({ id, displayName, field }) => ({
    driver: "cursor",
    id,
    displayName,
    environment: { CURSOR_API_KEY: { value: field, sensitive: true } },
  }),
  onCreated: ({ profileKind }) => {
    useSharedSettings.getState().setAgentSetting(profileKind, "structuredRuntime", "sdk");
  },
};
