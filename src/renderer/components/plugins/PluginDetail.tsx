import { ArrowLeft, ArrowRight, Box, Plug, Sparkles, TriangleAlert } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button, ToggleSwitch } from "@/renderer/components/common";
import { ensureHomeScopeProject } from "@/renderer/actions/projectActions";
import { newThreadFromText } from "@/renderer/actions/notesActions";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  isPluginMcpServerEnabled,
  isPluginSkillEnabled,
  isPluginSupportedOnHost,
  getPluginCoreSkill,
} from "@/shared/plugins/catalog";
import { PluginIcon } from "./PluginIcon";
import { PluginTag } from "./PluginTag";
import { usePluginOauth } from "./usePluginOauth";
import { useLocalizedPluginDiagnostic, type LocalizedPlugin } from "./pluginCopy";

export function PluginDetail(props: {
  plugin: LocalizedPlugin;
  hostPlatform: NodeJS.Platform;
  onBack: () => void;
}) {
  const { t } = useLingui();
  const plugin = props.plugin.plugin;
  const state = useSharedSettings((settings) => settings.installedPlugins[plugin.name]);
  const installPlugin = useSharedSettings((settings) => settings.installPlugin);
  const uninstallPlugin = useSharedSettings((settings) => settings.uninstallPlugin);
  const setPluginEnabled = useSharedSettings((settings) => settings.setPluginEnabled);
  const setPluginSkillEnabled = useSharedSettings((settings) => settings.setPluginSkillEnabled);
  const setPluginMcpServerEnabled = useSharedSettings(
    (settings) => settings.setPluginMcpServerEnabled,
  );
  const supported = isPluginSupportedOnHost(plugin, props.hostPlatform);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const pluginToggleLabelId = useId();
  const author = plugin.manifest.author?.name;
  const examplePrompt = plugin.poracode.examplePrompt;
  const coreSkill = getPluginCoreSkill(plugin);
  const closeSettings = usePanelStore((panel) => panel.closeSettings);
  const oauth = usePluginOauth(plugin);
  const describeDiagnostic = useLocalizedPluginDiagnostic();
  // Warnings are tolerated by the loader; errors mean something was dropped.
  const problems = plugin.diagnostics.filter((diagnostic) => diagnostic.severity === "error");

  // Seeds a draft composer rather than sending anything, so the user still
  // reviews the prompt and picks a model before the thread starts.
  const tryNow = async () => {
    if (!examplePrompt || !coreSkill) return;
    const project = await ensureHomeScopeProject();
    newThreadFromText(project.id, `/${coreSkill.folder} ${examplePrompt}`, {
      bindLeadingSkill: true,
    });
    closeSettings();
  };

  useEffect(() => {
    backButtonRef.current?.focus();
  }, []);

  return (
    <div className="mx-auto min-h-full max-w-[720px]">
      <Button
        ref={backButtonRef}
        size="sm"
        variant="ghost"
        className="mb-4 !px-0"
        onPress={props.onBack}
      >
        <ArrowLeft className="size-4" />
        <Trans>Back to plugins</Trans>
      </Button>

      <div className="flex items-start gap-4 border-b border-[var(--hairline)] pb-6">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-[var(--hairline)] bg-surface-secondary text-foreground">
          <PluginIcon pluginId={plugin.name} className="size-7" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 id={titleId} className="truncate text-xl font-semibold text-foreground">
                {props.plugin.name}
              </h1>
              <p className="mt-1 text-sm text-muted">{props.plugin.description}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {examplePrompt && coreSkill ? (
                <Button
                  size="sm"
                  variant="tertiary"
                  isDisabled={!state?.enabled}
                  onPress={() => void tryNow()}
                >
                  <Sparkles className="size-4" />
                  <Trans>Try now</Trans>
                </Button>
              ) : null}
              {state ? (
                <Button size="sm" variant="danger" onPress={() => uninstallPlugin(plugin)}>
                  <Trans>Uninstall</Trans>
                </Button>
              ) : (
                <Button size="sm" isDisabled={!supported} onPress={() => installPlugin(plugin)}>
                  {supported ? <Trans>Install</Trans> : <Trans>Unavailable on this device</Trans>}
                </Button>
              )}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted">
            <span>{author ?? plugin.name}</span>
            {plugin.poracode.communityMaintained ? (
              <PluginTag>
                <Trans>Community</Trans>
              </PluginTag>
            ) : null}
            <span aria-hidden="true">·</span>
            <span>{props.plugin.category}</span>
            {plugin.manifest.version ? (
              <>
                <span aria-hidden="true">·</span>
                <span>v{plugin.manifest.version}</span>
              </>
            ) : null}
          </div>
          {!supported ? (
            <p className="mt-2 text-xs text-warning">
              <Trans>Unavailable on this device</Trans>
            </p>
          ) : null}
        </div>
      </div>

      {examplePrompt && coreSkill ? (
        <Button
          variant="tertiary"
          isDisabled={!state?.enabled}
          className="mt-6 flex w-full items-center gap-3 rounded-2xl border border-[var(--hairline)] bg-surface-secondary !px-4 !py-3 text-left hover:border-[var(--hairline-strong)] focus-visible:border-[var(--hairline-strong)]"
          onPress={() => void tryNow()}
        >
          <span className="shrink-0 text-muted">
            <PluginIcon pluginId={plugin.name} className="size-4" />
          </span>
          <span className="min-w-0 flex-1 text-sm text-foreground">{examplePrompt}</span>
          <ArrowRight className="size-4 shrink-0 text-muted" />
        </Button>
      ) : null}

      {problems.length > 0 ? (
        <section className="border-b border-[var(--hairline)] py-5">
          <div className="mb-2 flex items-center gap-2 text-warning">
            <TriangleAlert className="size-4" />
            <h2 className="text-sm font-semibold">
              <Trans>Some contributions could not be loaded</Trans>
            </h2>
          </div>
          <ul className="space-y-1 text-xs text-muted">
            {problems.map((diagnostic, index) => (
              <li key={`${diagnostic.code}-${diagnostic.target ?? index}`}>
                {describeDiagnostic(diagnostic)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {plugin.poracode.communityMaintained ? (
        <p className="mt-5 rounded-xl border border-[var(--hairline)] px-3 py-2.5 text-xs text-muted">
          <Trans>
            The server this plugin launches is maintained by a third party, not by the service it
            connects to. Review the source before enabling it.
          </Trans>
        </p>
      ) : null}

      {state ? (
        <section className="flex items-center justify-between gap-4 border-b border-[var(--hairline)] py-5">
          <div>
            <h2 id={pluginToggleLabelId} className="text-sm font-semibold text-foreground">
              <Trans>Enable plugin</Trans>
            </h2>
            <p className="text-xs text-muted">
              <Trans>Enable this plugin's skills and servers for new threads.</Trans>
            </p>
          </div>
          <ToggleSwitch
            aria-labelledby={`${titleId} ${pluginToggleLabelId}`}
            isSelected={state.enabled}
            isDisabled={!supported}
            onChange={(enabled) => setPluginEnabled(plugin, enabled)}
          />
        </section>
      ) : null}

      {props.plugin.mcpServers.length > 0 ? (
        <ContributionSection
          icon={<Plug className="size-4" />}
          title={t`MCP servers`}
          {...(plugin.mcpServers.length > 0
            ? {
                description: t`Servers this plugin declares in mcp.json. Poracode passes them to every supported agent.`,
              }
            : {})}
        >
          {props.plugin.mcpServers.map((server, index) => {
            const declared = plugin.mcpServers.some((candidate) => candidate.name === server.id);
            const enabled =
              state && declared ? isPluginMcpServerEnabled(plugin, state, server.id) : true;
            const labelId = `${titleId}-server-${server.id}`;
            const badgeId = `${labelId}-kind`;
            return (
              <ContributionRow
                key={server.id}
                labelId={labelId}
                badgeId={badgeId}
                name={server.name}
                {...(server.description ? { description: server.description } : {})}
                badge={t`MCP`}
                last={index === props.plugin.mcpServers.length - 1}
                control={
                  state && declared ? (
                    <div className="flex items-center gap-2">
                      {oauth.isRemoteServer(server.id) ? (
                        <ConnectControl
                          state={oauth.stateFor(server.id)}
                          ariaLabelledBy={`${labelId} ${badgeId}`}
                          onConnect={() => void oauth.connect(server.id)}
                          onDisconnect={() => void oauth.disconnect(server.id)}
                        />
                      ) : null}
                      <ToggleSwitch
                        aria-labelledby={`${labelId} ${badgeId}`}
                        isSelected={enabled}
                        isDisabled={!supported || !state.enabled}
                        onChange={(next) => setPluginMcpServerEnabled(plugin.name, server.id, next)}
                      />
                    </div>
                  ) : undefined
                }
              />
            );
          })}
        </ContributionSection>
      ) : null}

      {oauth.error ? (
        <p className="text-xs text-warning" role="alert">
          {oauth.error}
        </p>
      ) : null}

      {props.plugin.skills.length > 0 ? (
        <ContributionSection
          icon={<Box className="size-4" />}
          title={t`Skills`}
          description={t`Reusable guidance delivered across supported agents.`}
        >
          {props.plugin.skills.map((skill, index) => {
            const enabled = state ? isPluginSkillEnabled(plugin, state, skill.id) : true;
            const labelId = `${titleId}-skill-${skill.id}`;
            const badgeId = `${labelId}-kind`;
            return (
              <ContributionRow
                key={skill.id}
                labelId={labelId}
                badgeId={badgeId}
                name={skill.name}
                {...(skill.description ? { description: skill.description } : {})}
                badge={t`Skill`}
                last={index === props.plugin.skills.length - 1}
                control={
                  state ? (
                    <ToggleSwitch
                      aria-labelledby={`${labelId} ${badgeId}`}
                      isSelected={enabled}
                      isDisabled={!supported || !state.enabled}
                      onChange={(next) => setPluginSkillEnabled(plugin.name, skill.id, next)}
                    />
                  ) : undefined
                }
              />
            );
          })}
        </ContributionSection>
      ) : null}

      <section className="border-t border-[var(--hairline)] py-5">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          <Trans>Information</Trans>
        </h2>
        <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-xs">
          <dt className="text-muted">
            <Trans>Identifier</Trans>
          </dt>
          <dd className="break-all text-foreground">{plugin.name}</dd>
          {author ? (
            <>
              <dt className="text-muted">
                <Trans>Author</Trans>
              </dt>
              <dd className="text-foreground">{author}</dd>
            </>
          ) : null}
          <dt className="text-muted">
            <Trans>Category</Trans>
          </dt>
          <dd className="text-foreground">{props.plugin.category}</dd>
          {plugin.manifest.version ? (
            <>
              <dt className="text-muted">
                <Trans>Version</Trans>
              </dt>
              <dd className="text-foreground">{plugin.manifest.version}</dd>
            </>
          ) : null}
          {plugin.manifest.license ? (
            <>
              <dt className="text-muted">
                <Trans>License</Trans>
              </dt>
              <dd className="text-foreground">{plugin.manifest.license}</dd>
            </>
          ) : null}
          {plugin.manifest.homepage ? (
            <>
              <dt className="text-muted">
                <Trans>Homepage</Trans>
              </dt>
              <dd className="break-all text-foreground">{plugin.manifest.homepage}</dd>
            </>
          ) : null}
          {plugin.manifest.repository ? (
            <>
              <dt className="text-muted">
                <Trans>Repository</Trans>
              </dt>
              <dd className="break-all text-foreground">{plugin.manifest.repository}</dd>
            </>
          ) : null}
          <dt className="text-muted">
            <Trans>Location</Trans>
          </dt>
          <dd className="break-all text-foreground">{plugin.root}</dd>
        </dl>
      </section>
    </div>
  );
}

function ConnectControl(props: {
  state: "unknown" | "connected" | "disconnected" | "connecting";
  ariaLabelledBy: string;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const connected = props.state === "connected";
  const connecting = props.state === "connecting";
  return (
    <Button
      size="sm"
      variant="tertiary"
      aria-labelledby={props.ariaLabelledBy}
      isPending={connecting}
      onPress={connected ? props.onDisconnect : props.onConnect}
    >
      {connected ? <span className="size-1.5 rounded-full bg-success" aria-hidden="true" /> : null}
      {connecting ? (
        <Trans>Connecting...</Trans>
      ) : connected ? (
        <Trans>Connected</Trans>
      ) : (
        <Trans>Connect</Trans>
      )}
    </Button>
  );
}

function ContributionSection(props: {
  icon: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="py-5">
      <div className="mb-3 flex items-start gap-2">
        <span className="mt-0.5 text-muted">{props.icon}</span>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{props.title}</h2>
          {props.description ? <p className="text-xs text-muted">{props.description}</p> : null}
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-[var(--hairline)]">
        {props.children}
      </div>
    </section>
  );
}

function ContributionRow(props: {
  labelId: string;
  badgeId: string;
  name: string;
  description?: string;
  badge: string;
  control?: ReactNode;
  last: boolean;
}) {
  return (
    <div
      className={`flex min-h-16 items-center gap-3 px-3 py-2.5 ${props.last ? "" : "border-b border-[var(--hairline)]"}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span id={props.labelId} className="truncate text-sm font-medium text-foreground">
            {props.name}
          </span>
          <span
            id={props.badgeId}
            className="rounded bg-surface-secondary px-1.5 py-0.5 text-[10px] text-muted"
          >
            {props.badge}
          </span>
        </div>
        {props.description ? (
          <p className="truncate text-xs text-muted">{props.description}</p>
        ) : null}
      </div>
      {props.control}
    </div>
  );
}
