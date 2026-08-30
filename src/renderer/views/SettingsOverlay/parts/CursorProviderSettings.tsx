import type { ReactNode } from "react";
import { RadioGroup, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { readBridge } from "@/renderer/bridge";
import { useProviderUsage } from "@/renderer/state/providerUsageStore";
import { flushSharedSettings, useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  cursorProfileKind,
  extractCursorProfileInstanceId,
  type AgentCapability,
  type AgentStatus,
  type AuthState,
} from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { CursorRuntimeCard } from "./CursorRuntimeCard";
import { AgentProfileList } from "./AgentProfileList";
import { CursorProfileIdentity } from "./CursorProfileIdentity";
import { cursorProfileSupport } from "./CursorProfileSettings";
import { CursorSdkRuntimeSetup } from "./CursorSdkRuntimeSetup";
import { cursorRuntimeInstallState } from "./cursorRuntimeInstall";

type CursorStructuredRuntime = "acp" | "sdk";

function readStructuredRuntime(
  settings: Record<string, boolean | string> | undefined,
  fallback: CursorStructuredRuntime = "acp",
): CursorStructuredRuntime {
  if (settings?.structuredRuntime === "sdk") return "sdk";
  if (settings?.structuredRuntime === "acp") return "acp";
  return fallback;
}

/**
 * Cursor's ACP and SDK GUI runtimes have independent installation and
 * authentication, so each one owns a card holding its own status and setup.
 * Cursor CLI install/update/sign-in stays in the environment rows above — ACP
 * runs through that same CLI, so repeating its auth controls here would give
 * one credential two homes. Existing sessions remain pinned to the runtime that
 * created them; changing the default only affects new chats.
 */
export function CursorProviderSettings(props: {
  agentKind: string;
  statuses?: readonly AgentStatus[];
  wslDistros: string[];
  /** Per-environment Cursor CLI rows, handed over by `SingleAgentSettings`. */
  installRows?: ReactNode;
  onOpenProfile?: ((profileKind: string) => void) | undefined;
}) {
  const { t } = useLingui();
  const { agentKind, statuses, wslDistros } = props;
  const profileInstanceId = extractCursorProfileInstanceId(agentKind);
  const savedAgentSettings = useSharedSettings((state) => state.agentSettings[agentKind]);
  const agentInstances = useSharedSettings((state) => state.agentInstances);
  const cursorProfileKinds = Object.values(agentInstances)
    .filter((instance) => instance.driver === "cursor" && instance.enabled !== false)
    .map((instance) => cursorProfileKind(instance.id));
  const selectedRuntime = readStructuredRuntime(
    savedAgentSettings,
    profileInstanceId ? "sdk" : "acp",
  );
  const setAgentSetting = useSharedSettings((state) => state.setAgentSetting);

  const firstStatus = statuses?.[0];
  const acpStatus =
    statuses?.find((candidate) => cursorRuntimeInstallState(candidate).acpInstalled) ?? firstStatus;
  const sdkStatus =
    statuses?.find((candidate) => cursorRuntimeInstallState(candidate).sdkInstalled) ?? firstStatus;
  const acpInstallState = cursorRuntimeInstallState(acpStatus);
  const sdkInstallState = cursorRuntimeInstallState(sdkStatus);
  const acpVariant = acpStatus?.runtimeVariants?.acp;
  const sdkVariant = sdkStatus?.runtimeVariants?.sdk;
  const acpAuthState = acpVariant?.authState ?? acpStatus?.authState ?? "unknown";
  const sdkAuthState = sdkVariant?.authState ?? "unknown";
  const providerUsage = useProviderUsage(agentKind);
  const sdkAccountEmail =
    sdkVariant?.providerMetadata?.authenticatedAs?.trim() ||
    (profileInstanceId && providerUsage?.status === "ok"
      ? providerUsage.authenticatedAs?.trim()
      : undefined);

  const authLabel = (
    authState: AuthState,
    runtime: CursorStructuredRuntime,
    accountEmail?: string,
  ) => {
    if (authState === "authenticated") {
      return accountEmail ? `${t`Authenticated`} · ${accountEmail}` : t`Authenticated`;
    }
    if (authState === "missing") {
      return runtime === "sdk" ? t`API key required` : t`Sign in required`;
    }
    return t`Authentication unavailable`;
  };
  const statusLine = (
    installed: boolean,
    authState: AuthState,
    runtime: CursorStructuredRuntime,
    accountEmail?: string,
  ) =>
    installed
      ? `${t`Installed`} · ${authLabel(authState, runtime, accountEmail)}`
      : t`Not installed`;
  const detailLine = (capabilities: AgentCapability | undefined) => {
    if (!capabilities?.models.length) return undefined;
    const modes = capabilities.modes.map((mode) =>
      mode === "agent" ? t`Work` : mode === "plan" ? t`Plan` : t`Autopilot`,
    );
    const models = t`${capabilities.models.length} models`;
    return modes.length ? `${models} · ${t`Modes`}: ${modes.join(", ")}` : models;
  };

  const acpDetailLine = detailLine(acpVariant?.capabilities);
  const sdkDetailLine = detailLine(sdkVariant?.capabilities);

  const refreshStatus = () =>
    readBridge().refreshAgentStatuses(wslDistros, { agentKinds: [agentKind] });
  const refreshPackageStatus = () =>
    readBridge().refreshAgentStatuses(wslDistros, {
      agentKinds: ["cursor", ...cursorProfileKinds],
    });

  /**
   * Persists the default runtime right away; there is nothing else to batch.
   * The selected card is its own confirmation, so success stays silent.
   */
  const selectRuntime = async (next: CursorStructuredRuntime) => {
    if (next === selectedRuntime) return;
    setAgentSetting(agentKind, "structuredRuntime", next);
    try {
      await flushSharedSettings();
      await refreshStatus();
    } catch (error) {
      setAgentSetting(agentKind, "structuredRuntime", selectedRuntime);
      toast.danger(friendlyError(error));
    }
  };

  const fallBackToAcp = async () => {
    if (selectedRuntime !== "sdk") return;
    setAgentSetting(agentKind, "structuredRuntime", "acp");
    await flushSharedSettings();
  };

  const sdkSetup = (
    <CursorSdkRuntimeSetup
      agentKind={agentKind}
      {...(profileInstanceId ? { profileInstanceId } : {})}
      status={sdkStatus}
      authDescription={authLabel(sdkAuthState, "sdk", sdkAccountEmail)}
      refreshStatus={refreshStatus}
      refreshPackageStatus={refreshPackageStatus}
      onApiKeyCleared={fallBackToAcp}
    />
  );

  if (profileInstanceId) {
    return (
      <div className="border-t border-border/10 pt-3">
        <CursorProfileIdentity
          agentKind={agentKind}
          profileInstanceId={profileInstanceId}
          authDescription={authLabel(sdkAuthState, "sdk", sdkAccountEmail)}
          refreshStatus={refreshStatus}
        />
        <div className="mb-2">
          <p className="text-sm font-medium text-foreground">
            <Trans>Cursor SDK</Trans>
          </p>
          <p className="text-xs text-muted">
            <Trans>
              This profile runs on the Cursor SDK. Cursor CLI and ACP share one machine login, so
              they stay on the main Cursor tile.
            </Trans>
          </p>
        </div>
        <div className="rounded-lg border border-border/40 bg-surface-secondary/35">
          <div className="px-3 py-2">
            <p className="text-xs text-muted">
              {statusLine(sdkInstallState.sdkInstalled, sdkAuthState, "sdk", sdkAccountEmail)}
            </p>
            {sdkDetailLine ? (
              <p className="mt-0.5 text-[11px] text-muted/80">{sdkDetailLine}</p>
            ) : null}
          </div>
          <div className="space-y-1.5 border-t border-border/10 px-3 py-2">{sdkSetup}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-border/10 pt-3">
      <div className="mb-2">
        <p className="text-sm font-medium text-foreground">
          <Trans>GUI runtime</Trans>
        </p>
        <p className="text-xs text-muted">
          <Trans>
            Pick the runtime that backs new Cursor GUI chats. Each runtime installs and
            authenticates on its own; open chats keep the runtime they started with.
          </Trans>
        </p>
      </div>

      {/* `items-stretch` keeps both runtime cards the same height regardless of
          how many setup rows each one carries. */}
      <RadioGroup
        aria-label={t`Structured runtime`}
        className="!grid items-stretch gap-2 py-1.5 sm:grid-cols-2 [&_[data-slot=radio]]:!mt-0"
        value={selectedRuntime}
        onChange={(value) => void selectRuntime(value === "sdk" ? "sdk" : "acp")}
      >
        <CursorRuntimeCard
          value="acp"
          label={t`Cursor CLI (ACP)`}
          isSelected={selectedRuntime === "acp"}
          isSelectable={acpInstallState.acpInstalled}
          statusLine={statusLine(acpInstallState.acpInstalled, acpAuthState, "acp")}
          {...(acpDetailLine ? { detailLine: acpDetailLine } : {})}
        >
          {/* The CLI environment rows are this runtime's install and sign-in. */}
          <div className="space-y-0.5">{props.installRows}</div>
        </CursorRuntimeCard>

        <CursorRuntimeCard
          value="sdk"
          label={t`Cursor SDK`}
          isSelected={selectedRuntime === "sdk"}
          isSelectable={sdkInstallState.sdkInstalled && sdkAuthState === "authenticated"}
          statusLine={statusLine(
            sdkInstallState.sdkInstalled,
            sdkAuthState,
            "sdk",
            sdkAccountEmail,
          )}
          {...(sdkDetailLine ? { detailLine: sdkDetailLine } : {})}
        >
          {sdkSetup}
        </CursorRuntimeCard>
      </RadioGroup>
      <AgentProfileList
        profiles={cursorProfileSupport}
        {...(statuses ? { statuses } : {})}
        onOpenProfile={props.onOpenProfile}
      />
    </div>
  );
}
