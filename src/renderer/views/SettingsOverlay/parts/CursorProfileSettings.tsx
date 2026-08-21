import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { AgentInstanceConfig, AgentStatus } from "@/shared/contracts";
import { cursorProfileKind } from "@/shared/contracts";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { NativeAgentProfileSupport } from "./agentRegistryNative";
import { cursorRuntimeInstallState } from "./cursorRuntimeInstall";

/**
 * Every Cursor profile has its own key, so naming that in the list would say
 * nothing; the runtime it launches on is what differs. A profile with no saved
 * choice runs on the SDK — the supervisor's default.
 */
function CursorProfileRuntimeLabel(props: { instance: AgentInstanceConfig }) {
  const { t } = useLingui();
  const saved = useSharedSettings(
    (state) => state.agentSettings[cursorProfileKind(props.instance.id)],
  );
  return saved?.structuredRuntime === "acp" ? t`Cursor CLI (ACP)` : t`Cursor SDK`;
}

/**
 * Cursor's profile descriptor: one API key per profile, carried into the CLI,
 * ACP and SDK runtimes. Everything structural lives in `AgentProfileList`.
 */
export const cursorProfileSupport: NativeAgentProfileSupport = {
  driver: "cursor",
  description: <Trans>Create separate Cursor profiles with their own API keys.</Trans>,
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
  onCreated: ({ profileKind, statuses }) => {
    // Pin the runtime rather than leaning on the implicit SDK default: on a
    // machine without `@cursor/sdk` that default leaves the profile pointing at
    // a runtime it cannot start, with nothing in the UI explaining why. The
    // package is shared by every Cursor kind, so the base provider's detection
    // answers whether the SDK is available.
    const sdkInstalled = statuses.some(
      (status: AgentStatus) => cursorRuntimeInstallState(status).sdkInstalled,
    );
    useSharedSettings
      .getState()
      .setAgentSetting(profileKind, "structuredRuntime", sdkInstalled ? "sdk" : "acp");
  },
};
