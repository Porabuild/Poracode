import { Trans, useLingui } from "@lingui/react/macro";
import { msg } from "@lingui/core/macro";
import type { AgentInstanceConfig, AgentStatus } from "@/shared/contracts";
import {
  extractOpenCodeProfileInstanceId,
  opencodeProfileKind,
  parseOpenCodeProfileInstanceConfig,
} from "@/shared/agents/opencode/profileConfig";
import { ContentSurface } from "@/renderer/components/common/ContentSurface";
import {
  useAgentSettingsHost,
  useHostAgentInstance,
} from "@/renderer/components/providers/settings/AgentSettingsHostContext";
import { OllamaContextSetting } from "@/renderer/components/providers/settings/OllamaContextSetting";
import { OpenCodeProviderSettings } from "@/renderer/components/providers/settings/OpenCodeProviderSettings";
import { ollamaModelInventory } from "@/shared/agents/ollamaModelInventory";
import type {
  NativeAgentProfileSupport,
  NativeAgentSettingsPanelProps,
} from "@/renderer/views/SettingsOverlay/parts/agentRegistryNative";
import { AgentProfileList } from "@/renderer/views/SettingsOverlay/parts/AgentProfileList";

function OpenCodeProfileSubtitle(props: { instance: AgentInstanceConfig }) {
  let config;
  try {
    config = parseOpenCodeProfileInstanceConfig(props.instance.config);
  } catch {
    return <Trans>Invalid OpenCode profile configuration</Trans>;
  }
  if (config.connection === "agent") {
    return <Trans>OpenCode · agent default</Trans>;
  }
  return (
    <span className="block truncate font-mono text-[11px]">
      {config.baseModel ?? config.model ?? ""} · {config.endpoint}
    </span>
  );
}

export const opencodeProfileSupport: NativeAgentProfileSupport = {
  driver: "opencode",
  description: (
    <Trans>
      Pin an OpenAI-compatible endpoint and model. Local profiles run an isolated OpenCode server
      and database; they never inherit the base account&apos;s cloud credentials.
    </Trans>
  ),
  addProfile: {
    label: msg`OpenCode`,
    order: 0,
    local: {
      ollamaEndpoint: "http://127.0.0.1:11434/v1",
      createPayload: ({ id, displayName, endpoint, model, baseModel, contextLength }) => ({
        driver: "opencode",
        id,
        displayName,
        config: {
          connection: "local",
          endpoint,
          model,
          ...(baseModel && contextLength ? { baseModel, contextLength } : {}),
        },
      }),
      modelSuggestions: ollamaModelInventory,
      modelHint: (
        <Trans>
          OpenCode treats this URL as an OpenAI-compatible base URL. Include <code>/v1</code> when
          the server exposes OpenAI routes under that path.
        </Trans>
      ),
    },
  },
  RowSubtitle: OpenCodeProfileSubtitle,
  removalBody: (profileName) => (
    <Trans>
      Removing {profileName} drops its Poracode profile settings. Its OpenCode config and database
      stay on the host.
    </Trans>
  ),
  createPayload: ({ id, displayName }) => ({
    driver: "opencode",
    id,
    displayName,
    config: { connection: "agent" },
  }),
};

function OpenCodeProfileDetails(props: { instanceId: string }) {
  const { t } = useLingui();
  const settingsHost = useAgentSettingsHost();
  const instance = useHostAgentInstance(props.instanceId);
  if (!instance || instance.driver !== "opencode") return null;
  let config;
  try {
    config = parseOpenCodeProfileInstanceConfig(instance.config);
  } catch {
    return null;
  }
  const declaredOllamaEndpoint = opencodeProfileSupport.addProfile?.local?.ollamaEndpoint ?? "";
  const rawConfig =
    typeof instance.config === "object" && instance.config !== null
      ? (instance.config as Record<string, unknown>)
      : {};
  return (
    <ContentSurface className="space-y-2 p-3">
      <div>
        <p className="text-sm font-medium text-foreground">
          <Trans>Model profile</Trans>
        </p>
        <p className="text-xs text-muted">
          <Trans>
            This profile launches its own OpenCode server on the selected host. The model endpoint
            is not shared with the base OpenCode agent.
          </Trans>
        </p>
      </div>
      {config.connection === "local" ? (
        <>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted">{t`Server`}</dt>
            <dd className="min-w-0 break-all font-mono text-foreground">{config.endpoint ?? ""}</dd>
            <dt className="text-muted">{t`Model`}</dt>
            <dd className="min-w-0 break-all font-mono text-foreground">
              {config.baseModel ?? config.model ?? ""}
            </dd>
          </dl>
          <OllamaContextSetting
            instanceId={instance.id}
            profileKind={opencodeProfileKind(instance.id)}
            endpoint={config.endpoint ?? ""}
            declaredEndpoint={declaredOllamaEndpoint}
            baseModel={config.baseModel ?? config.model ?? ""}
            contextLength={config.contextLength}
            applyContext={async (next) => {
              const { baseModel: _baseModel, contextLength: _contextLength, ...rest } = rawConfig;
              const nextConfig = {
                ...rest,
                model: next.model,
                ...(next.baseModel ? { baseModel: next.baseModel } : {}),
                ...(next.contextLength ? { contextLength: next.contextLength } : {}),
              };
              await settingsHost.updateProfile(instance.id, { config: nextConfig });
            }}
          />
        </>
      ) : (
        <p className="text-xs text-muted">
          <Trans>Uses this host&apos;s normal OpenCode account and default model.</Trans>
        </p>
      )}
    </ContentSurface>
  );
}

export function OpenCodeProfileSettings(props: {
  statuses?: readonly AgentStatus[] | undefined;
  suggestionStatuses?: readonly AgentStatus[] | undefined;
  workspaceIsClientDevice?: boolean | undefined;
  onOpenProfile?: ((profileKind: string) => void) | undefined;
}) {
  return (
    <AgentProfileList
      profiles={opencodeProfileSupport}
      {...(props.statuses ? { statuses: props.statuses } : {})}
      {...(props.suggestionStatuses ? { suggestionStatuses: props.suggestionStatuses } : {})}
      workspaceIsClientDevice={props.workspaceIsClientDevice}
      onOpenProfile={props.onOpenProfile}
    />
  );
}

export function OpenCodeAgentSettingsPanel(props: NativeAgentSettingsPanelProps) {
  const instanceId = extractOpenCodeProfileInstanceId(props.agentKind);
  if (instanceId !== undefined) {
    return <OpenCodeProfileDetails key={props.agentKind} instanceId={instanceId} />;
  }
  return (
    <>
      <OpenCodeProviderSettings
        agentKind={props.agentKind}
        statuses={props.statuses}
        wslDistros={props.wslDistros}
      />
      <OpenCodeProfileSettings
        statuses={props.statuses}
        suggestionStatuses={props.hostStatuses}
        workspaceIsClientDevice={props.workspaceIsClientDevice}
        onOpenProfile={props.onOpenProfile}
      />
    </>
  );
}
