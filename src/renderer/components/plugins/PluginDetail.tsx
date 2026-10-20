import { ArrowLeft, ArrowRight, Box, Plug, Sparkles, TriangleAlert } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button, ToggleSwitch } from "@/renderer/components/common";
import { ConfirmDialog } from "@/renderer/components/common/ConfirmDialog";
import type { PluginInstallation } from "@/shared/contracts/pluginCatalog";
import { ensureHomeScopeProject } from "@/renderer/actions/projectActions";
import { newThreadFromText } from "@/renderer/actions/notesActions";
import { usePanelStore } from "@/renderer/state/panelStore";
import { runRendererAction, useRendererActionStore } from "@/renderer/state/rendererActionStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type {
  BuiltInMcpServerDisabled,
  InstalledPlugins,
  LoadedPlugin,
  PluginSkillRef,
} from "@/shared/contracts";
import {
  canDisablePlugin,
  canUninstallPlugin,
  isPluginMcpServerEnabled,
  isPluginSkillEnabled,
  isPluginSupportedOnHost,
  getPluginCoreSkill,
  resolveInstalledPluginState,
} from "@/shared/plugins/catalog";
import { PluginIcon } from "./PluginIcon";
import { PluginTag } from "./PluginTag";
import { usePluginOauth } from "./usePluginOauth";
import { PluginServiceAccounts } from "./PluginServiceAccounts";
import { useLocalizedPluginDiagnostic, type LocalizedPlugin } from "./pluginCopy";

function canTryPluginNow(input: {
  plugin: LoadedPlugin;
  coreSkill: PluginSkillRef | undefined;
  hostPlatform: NodeJS.Platform;
  installedPlugins: InstalledPlugins;
  disabledBuiltInMcpServers: BuiltInMcpServerDisabled;
}): boolean {
  const state = resolveInstalledPluginState(input.plugin, input.installedPlugins);
  return Boolean(
    isPluginSupportedOnHost(input.plugin, input.hostPlatform) &&
    state &&
    input.coreSkill &&
    isPluginSkillEnabled(input.plugin, state, input.coreSkill.folder) &&
    input.plugin.mcpServers.every((server) =>
      isPluginMcpServerEnabled(input.plugin, state, server.name),
    ) &&
    input.plugin.poracode.builtInMcpServerIds.every(
      (id) => input.disabledBuiltInMcpServers[id] !== true,
    ),
  );
}

export function PluginDetail(props: {
  plugin: LocalizedPlugin;
  hostPlatform: NodeJS.Platform;
  onBack: () => void;
  catalogPackage?: {
    receipt: PluginInstallation;
    busy: boolean;
    error: boolean;
    /** Category published by the source entry, when the source is still known. */
    entryCategory?: string;
    onReview: () => void;
    onRemove: () => Promise<void>;
  };
}) {
  const { t } = useLingui();
  const plugin = props.plugin.plugin;
  const displayCategory = props.catalogPackage?.entryCategory ?? props.plugin.category;
  const installedPlugins = useSharedSettings((settings) => settings.installedPlugins);
  const disabledBuiltInMcpServers = useSharedSettings(
    (settings) => settings.disabledBuiltInMcpServers,
  );
  const state = resolveInstalledPluginState(plugin, installedPlugins);
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
  const canTryNow = canTryPluginNow({
    plugin,
    coreSkill,
    hostPlatform: props.hostPlatform,
    installedPlugins,
    disabledBuiltInMcpServers,
  });
  const closeSettings = usePanelStore((panel) => panel.closeSettings);
  const oauth = usePluginOauth(plugin);
  const tryActionKey = `plugin:try:${plugin.name}`;
  const trying = useRendererActionStore((actionState) => !!actionState.pending[tryActionKey]);
  const describeDiagnostic = useLocalizedPluginDiagnostic();
  // Warnings are tolerated by the loader; errors mean something was dropped.
  const problems = plugin.diagnostics;
  const [removing, setRemoving] = useState(false);
  const catalogPackage = props.catalogPackage;

  // Seeds a draft composer rather than sending anything, so the user still
  // reviews the prompt and picks a model before the thread starts.
  const tryNow = async () => {
    if (!examplePrompt || !coreSkill || !canTryNow) return;
    const project = await ensureHomeScopeProject();
    const latestSettings = useSharedSettings.getState();
    if (
      !canTryPluginNow({
        plugin,
        coreSkill,
        hostPlatform: props.hostPlatform,
        installedPlugins: latestSettings.installedPlugins,
        disabledBuiltInMcpServers: latestSettings.disabledBuiltInMcpServers,
      })
    ) {
      return;
    }
    newThreadFromText(project.id, `/${coreSkill.folder} ${examplePrompt}`, {
      bindLeadingSkill: true,
      leadingSkillPluginId: plugin.name,
      ...(plugin.poracode.builtInMcpServerIds.length > 0
        ? { enableMcpServerIds: plugin.poracode.builtInMcpServerIds }
        : {}),
    });
    closeSettings();
  };

  useEffect(() => {
    backButtonRef.current?.focus();
  }, []);

  return (
    <div className="mx-auto min-h-full max-w-[880px] pb-8">
      {/* Focused on mount, so it keeps its own padding: with `px-0` the hover
          and focus surface hugged the glyph and the row read as a stray box. The
          negative inline-start margin keeps the label optically aligned with the
          heading below. */}
      <Button
        ref={backButtonRef}
        size="sm"
        variant="ghost"
        className="-ms-2 mb-4 gap-2 px-2 text-muted"
        onPress={props.onBack}
        isDisabled={catalogPackage?.busy ?? false}
      >
        <ArrowLeft className="size-4" />
        <Trans>Back to plugins</Trans>
      </Button>

      <div className="pb-4">
        <div className="mb-3 flex size-14 items-center justify-center rounded-xl bg-surface-secondary text-foreground">
          <PluginIcon pluginId={plugin.name} pluginRoot={plugin.root} className="size-9" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 id={titleId} className="break-words text-lg font-semibold text-foreground">
                {props.plugin.name}
              </h1>
            </div>
            <div className="flex max-w-full flex-wrap items-center gap-1.5">
              {/* "Try now" opens a home-scope thread, which cannot see a
                  package that belongs to one project's repository. */}
              {examplePrompt && coreSkill && plugin.source !== "project" ? (
                <Button
                  size="sm"
                  variant="tertiary"
                  isDisabled={!canTryNow || trying}
                  isPending={trying}
                  onPress={() => void runRendererAction(tryActionKey, tryNow)}
                >
                  <Sparkles className="size-4" />
                  <Trans>Try now</Trans>
                </Button>
              ) : null}
              {catalogPackage ? (
                <>
                  {!state && supported ? (
                    <Button
                      size="sm"
                      variant="tertiary"
                      isDisabled={catalogPackage.busy}
                      onPress={() => {
                        installPlugin(plugin);
                        setPluginEnabled(plugin, true);
                      }}
                    >
                      <Trans>Enable plugin</Trans>
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="tertiary"
                    isDisabled={catalogPackage.busy}
                    onPress={catalogPackage.onReview}
                  >
                    <Trans>Review update</Trans>
                  </Button>
                </>
              ) : !supported ? (
                // Host support is independent of install state: a built-in
                // tool plugin still ships installed where it cannot run.
                <Button size="sm" isDisabled>
                  <Trans>Unavailable on this device</Trans>
                </Button>
              ) : !state ? (
                <Button size="sm" onPress={() => installPlugin(plugin)}>
                  <Trans>Install</Trans>
                </Button>
              ) : canUninstallPlugin(plugin) ? (
                <Button
                  size="sm"
                  variant="tertiary"
                  className="text-danger transition-colors hover:bg-danger hover:text-white"
                  onPress={() => uninstallPlugin(plugin)}
                >
                  <Trans>Uninstall</Trans>
                </Button>
              ) : (
                // Built-in tool plugins ship inside the app: they can be
                // switched off, but there is nothing to remove from disk.
                <PluginTag>
                  <Trans>Built-in</Trans>
                </PluginTag>
              )}
            </div>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">{props.plugin.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
            <span>{author ?? plugin.name}</span>
            {plugin.poracode.communityMaintained ? (
              <PluginTag>
                <Trans>Community</Trans>
              </PluginTag>
            ) : null}
            {plugin.source === "project" ? (
              <PluginTag>
                <Trans>Project</Trans>
              </PluginTag>
            ) : null}
            <span aria-hidden="true">·</span>
            <span>{displayCategory}</span>
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
          isDisabled={!canTryNow || trying}
          isPending={trying}
          className="mt-4 flex w-full min-w-0 max-w-full items-center gap-3 overflow-hidden rounded-xl border border-[var(--hairline)] bg-surface-secondary !px-3.5 !py-2.5 text-left hover:border-[var(--hairline-strong)] focus-visible:border-[var(--hairline-strong)]"
          onPress={() => void runRendererAction(tryActionKey, tryNow)}
        >
          <span className="shrink-0 text-muted">
            <PluginIcon pluginId={plugin.name} pluginRoot={plugin.root} className="size-4" />
          </span>
          <span
            className="min-w-0 flex-1 truncate text-[13px] text-foreground"
            title={examplePrompt}
          >
            {examplePrompt}
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted" />
        </Button>
      ) : null}

      {problems.length > 0 ? (
        <section className="border-b border-[var(--hairline)] py-4">
          <div className="mb-1.5 flex items-center gap-2 text-warning">
            <TriangleAlert className="size-3.5" />
            <h2 className="text-xs font-semibold">
              <Trans>Some contributions could not be loaded</Trans>
            </h2>
          </div>
          <ul className="space-y-0.5 text-xs text-muted">
            {problems.map((diagnostic, index) => (
              <li key={`${diagnostic.code}-${diagnostic.target ?? index}`}>
                {describeDiagnostic(diagnostic)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {plugin.poracode.communityMaintained ? (
        <p className="mt-4 rounded-lg border border-[var(--hairline)] px-3 py-2 text-xs text-muted">
          <Trans>
            The server this plugin launches is maintained by a third party, not by the service it
            connects to. Review the source before enabling it.
          </Trans>
        </p>
      ) : null}

      {state && canDisablePlugin(plugin) ? (
        <section className="flex items-center justify-between gap-4 border-b border-[var(--hairline)] py-4">
          <div>
            <h2 id={pluginToggleLabelId} className="text-xs font-semibold text-foreground">
              <Trans>Enable plugin</Trans>
            </h2>
            <p className="text-[11px] text-muted">
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
          count={props.plugin.mcpServers.length}
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
                icon={<Plug className="size-3.5" />}
                {...(server.description ? { description: server.description } : {})}
                badge={t`MCP`}
                last={index === props.plugin.mcpServers.length - 1}
                control={
                  state && declared ? (
                    <div className="flex items-center gap-2">
                      {oauth.isRemoteServer(server.id) ? (
                        <ConnectControl
                          state={oauth.stateFor(server.id)}
                          isPending={oauth.isPending(server.id)}
                          isDisabled={oauth.isBusy}
                          ariaLabelledBy={`${labelId} ${badgeId}`}
                          onConnect={() => void oauth.connect(server.id)}
                          onDisconnect={() => void oauth.disconnect(server.id)}
                        />
                      ) : null}
                      <ToggleSwitch
                        aria-labelledby={`${labelId} ${badgeId}`}
                        isSelected={enabled}
                        isDisabled={!supported || !state.enabled}
                        onChange={(next) => setPluginMcpServerEnabled(plugin, server.id, next)}
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

      {state ? <PluginServiceAccounts plugin={plugin} oauth={oauth} /> : null}

      {props.plugin.skills.length > 0 ? (
        <ContributionSection
          icon={<Box className="size-4" />}
          title={t`Skills`}
          count={props.plugin.skills.length}
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
                icon={<Box className="size-3.5" />}
                {...(skill.description ? { description: skill.description } : {})}
                badge={t`Skill`}
                last={index === props.plugin.skills.length - 1}
                control={
                  state && canDisablePlugin(plugin) ? (
                    <ToggleSwitch
                      aria-labelledby={`${labelId} ${badgeId}`}
                      isSelected={enabled}
                      isDisabled={!supported || !state.enabled}
                      onChange={(next) => setPluginSkillEnabled(plugin, skill.id, next)}
                    />
                  ) : undefined
                }
              />
            );
          })}
        </ContributionSection>
      ) : null}

      {catalogPackage ? (
        <section className="space-y-2.5 border-t border-[var(--hairline)] py-4 text-[11px]">
          <h2 className="text-xs font-semibold text-foreground">
            <Trans>Plugin source</Trans>
          </h2>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1">
            <dt className="text-muted">
              <Trans>Marketplace</Trans>
            </dt>
            <dd className="break-words text-foreground">{catalogPackage.receipt.catalogName}</dd>
            <dt className="text-muted">
              <Trans>Marketplace source</Trans>
            </dt>
            <dd className="break-all text-foreground">
              {catalogPackage.receipt.catalogSource.type === "git"
                ? catalogPackage.receipt.catalogSource.url
                : catalogPackage.receipt.catalogSource.path}
              {catalogPackage.receipt.catalogSource.type === "git" &&
              catalogPackage.receipt.catalogSource.ref
                ? ` (${catalogPackage.receipt.catalogSource.ref})`
                : ""}
            </dd>
            {catalogPackage.receipt.packageSource.type === "git" ? (
              <>
                <dt className="text-muted">
                  <Trans>Repository</Trans>
                </dt>
                <dd className="break-all text-foreground">
                  {catalogPackage.receipt.packageSource.url}
                </dd>
                <dt className="text-muted">
                  <Trans>Reference</Trans>
                </dt>
                <dd className="break-all text-foreground">
                  {catalogPackage.receipt.packageSource.ref ?? "HEAD"}
                </dd>
                <dt className="text-muted">
                  <Trans>Path</Trans>
                </dt>
                <dd className="break-all text-foreground">
                  {catalogPackage.receipt.packageSource.path}
                </dd>
              </>
            ) : catalogPackage.receipt.packageSource.type === "path" ? (
              <>
                <dt className="text-muted">
                  <Trans>Path</Trans>
                </dt>
                <dd className="break-all text-foreground">
                  {catalogPackage.receipt.packageSource.path}
                </dd>
              </>
            ) : null}
          </dl>
          <p className="break-all font-mono text-[10px] text-muted">
            {t`Installed`}: {catalogPackage.receipt.revision} · {catalogPackage.receipt.digest}
          </p>
          {catalogPackage.error ? (
            <p role="alert" className="text-warning">
              <Trans>
                Could not manage this plugin or marketplace. Check the source, compatibility, and
                local file changes, then try again.
              </Trans>
            </p>
          ) : null}
          <Button
            size="sm"
            variant="danger"
            isDisabled={catalogPackage.busy}
            onPress={() => setRemoving(true)}
          >
            <Trans>Remove plugin</Trans>
          </Button>
        </section>
      ) : null}
      <section className="py-5">
        <h2 className="mb-3 border-b border-[var(--hairline)] pb-2 text-xs font-semibold text-foreground">
          <Trans>Information</Trans>
        </h2>
        <dl className="grid grid-cols-[minmax(0,110px)_minmax(0,1fr)] gap-x-4 gap-y-2 text-[11px]">
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
          <dd className="text-foreground">{displayCategory}</dd>
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
      <ConfirmDialog
        isOpen={removing}
        title={t`Remove plugin`}
        body={t`Remove this plugin and its service accounts from Poracode?`}
        confirmLabel={t`Remove plugin`}
        isPending={catalogPackage?.busy ?? false}
        onClose={() => {
          if (!catalogPackage?.busy) setRemoving(false);
        }}
        onConfirm={() => void catalogPackage?.onRemove().then(() => setRemoving(false))}
      />
    </div>
  );
}

function ConnectControl(props: {
  state: "unknown" | "connected" | "disconnected" | "connecting";
  ariaLabelledBy: string;
  onConnect: () => void;
  onDisconnect: () => void;
  isPending: boolean;
  isDisabled: boolean;
}) {
  const connected = props.state === "connected";
  const connecting = props.state === "connecting";
  return (
    <Button
      size="sm"
      variant="tertiary"
      aria-labelledby={props.ariaLabelledBy}
      isPending={props.isPending}
      isDisabled={props.isDisabled}
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
  count: number;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="py-4">
      <div className="mb-1.5 flex items-start gap-2 border-b border-[var(--hairline)] pb-2">
        <span className="mt-0.5 text-muted">{props.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h2 className="text-xs font-semibold text-foreground">{props.title}</h2>
            <span className="text-[11px] tabular-nums text-muted">{props.count}</span>
          </div>
          {props.description ? <p className="text-[11px] text-muted">{props.description}</p> : null}
        </div>
      </div>
      <div>{props.children}</div>
    </section>
  );
}

function ContributionRow(props: {
  labelId: string;
  badgeId: string;
  name: string;
  icon: ReactNode;
  description?: string;
  badge: string;
  control?: ReactNode;
  last: boolean;
}) {
  return (
    <div
      className={`flex min-h-12 flex-wrap items-center gap-x-2.5 gap-y-1.5 py-2 ${props.last ? "" : "border-b border-[var(--hairline)]"}`}
    >
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-secondary text-muted"
        aria-hidden="true"
      >
        {props.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span id={props.labelId} className="truncate text-[13px] font-medium text-foreground">
            {props.name}
          </span>
          <span id={props.badgeId} className="sr-only">
            {props.badge}
          </span>
        </div>
        {props.description ? (
          <p className="truncate text-[11px] text-muted" title={props.description}>
            {props.description}
          </p>
        ) : null}
      </div>
      {props.control}
    </div>
  );
}
