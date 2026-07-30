import { ArrowLeft, Box, Cable } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button, ToggleSwitch } from "@/renderer/components/common";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  isPluginAppEnabled,
  isPluginSkillEnabled,
  isPluginSupportedOnHost,
} from "@/shared/plugins/catalog";
import { PluginIcon } from "./PluginIcon";
import type { LocalizedPlugin } from "./pluginCopy";

export function PluginDetail(props: {
  plugin: LocalizedPlugin;
  hostPlatform: NodeJS.Platform;
  onBack: () => void;
}) {
  const { t } = useLingui();
  const state = useSharedSettings(
    (settings) => settings.installedPlugins[props.plugin.manifest.id],
  );
  const installPlugin = useSharedSettings((settings) => settings.installPlugin);
  const uninstallPlugin = useSharedSettings((settings) => settings.uninstallPlugin);
  const setPluginEnabled = useSharedSettings((settings) => settings.setPluginEnabled);
  const setPluginSkillEnabled = useSharedSettings((settings) => settings.setPluginSkillEnabled);
  const setPluginAppEnabled = useSharedSettings((settings) => settings.setPluginAppEnabled);
  const manifest = props.plugin.manifest;
  const supported = isPluginSupportedOnHost(manifest, props.hostPlatform);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const pluginToggleLabelId = useId();

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
          <PluginIcon pluginId={manifest.id} className="size-7" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 id={titleId} className="truncate text-xl font-semibold text-foreground">
                {props.plugin.name}
              </h1>
              <p className="mt-1 text-sm text-muted">{props.plugin.description}</p>
            </div>
            {state ? (
              <Button size="sm" variant="danger" onPress={() => uninstallPlugin(manifest.id)}>
                <Trans>Uninstall</Trans>
              </Button>
            ) : (
              <Button size="sm" isDisabled={!supported} onPress={() => installPlugin(manifest.id)}>
                {supported ? <Trans>Install</Trans> : <Trans>Unavailable on this device</Trans>}
              </Button>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted">
            <span>{manifest.publisher}</span>
            <span aria-hidden="true">·</span>
            <span>{props.plugin.category}</span>
            <span aria-hidden="true">·</span>
            <span>v{manifest.version}</span>
          </div>
          {!supported ? (
            <p className="mt-2 text-xs text-warning">
              <Trans>Unavailable on this device</Trans>
            </p>
          ) : null}
        </div>
      </div>

      {state ? (
        <section className="flex items-center justify-between gap-4 border-b border-[var(--hairline)] py-5">
          <div>
            <h2 id={pluginToggleLabelId} className="text-sm font-semibold text-foreground">
              <Trans>Enable plugin</Trans>
            </h2>
            <p className="text-xs text-muted">
              <Trans>Enable this plugin's active skills and apps for new threads.</Trans>
            </p>
          </div>
          <ToggleSwitch
            aria-labelledby={`${titleId} ${pluginToggleLabelId}`}
            isSelected={state.enabled}
            isDisabled={!supported}
            onChange={(enabled) => setPluginEnabled(manifest.id, enabled)}
          />
        </section>
      ) : null}

      <ContributionSection
        icon={<Cable className="size-4" />}
        title={t`Apps`}
        description={t`MCP-powered tools contributed by this plugin.`}
      >
        {manifest.apps.map((app, index) => {
          const copy = props.plugin.apps.find((candidate) => candidate.id === app.id)!;
          const enabled = state ? isPluginAppEnabled(manifest, state, app.id) : app.defaultEnabled;
          const labelId = `${titleId}-app-${app.id}`;
          const badgeId = `${labelId}-kind`;
          return (
            <ContributionRow
              key={app.id}
              labelId={labelId}
              badgeId={badgeId}
              name={copy.name}
              description={copy.description}
              badge={t`MCP`}
              last={index === manifest.apps.length - 1}
              control={
                state ? (
                  <ToggleSwitch
                    aria-labelledby={`${labelId} ${badgeId}`}
                    isSelected={enabled}
                    isDisabled={!supported || !state.enabled}
                    onChange={(next) => setPluginAppEnabled(manifest.id, app.id, next)}
                  />
                ) : undefined
              }
            />
          );
        })}
      </ContributionSection>

      <ContributionSection
        icon={<Box className="size-4" />}
        title={t`Skills`}
        description={t`Reusable guidance delivered across supported agents.`}
      >
        {manifest.skills.map((skill, index) => {
          const copy = props.plugin.skills.find((candidate) => candidate.id === skill.id)!;
          const enabled = state
            ? isPluginSkillEnabled(manifest, state, skill.id)
            : skill.defaultEnabled;
          const labelId = `${titleId}-skill-${skill.id}`;
          const badgeId = `${labelId}-kind`;
          return (
            <ContributionRow
              key={skill.id}
              labelId={labelId}
              badgeId={badgeId}
              name={copy.name}
              description={copy.description}
              badge={t`Skill`}
              last={index === manifest.skills.length - 1}
              control={
                state ? (
                  <ToggleSwitch
                    aria-labelledby={`${labelId} ${badgeId}`}
                    isSelected={enabled}
                    isDisabled={!supported || !state.enabled}
                    onChange={(next) => setPluginSkillEnabled(manifest.id, skill.id, next)}
                  />
                ) : undefined
              }
            />
          );
        })}
      </ContributionSection>

      <section className="border-t border-[var(--hairline)] py-5">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          <Trans>Information</Trans>
        </h2>
        <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-xs">
          <dt className="text-muted">
            <Trans>Publisher</Trans>
          </dt>
          <dd className="text-foreground">{manifest.publisher}</dd>
          <dt className="text-muted">
            <Trans>Category</Trans>
          </dt>
          <dd className="text-foreground">{props.plugin.category}</dd>
          <dt className="text-muted">
            <Trans>Version</Trans>
          </dt>
          <dd className="text-foreground">{manifest.version}</dd>
        </dl>
      </section>
    </div>
  );
}

function ContributionSection(props: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="py-5">
      <div className="mb-3 flex items-start gap-2">
        <span className="mt-0.5 text-muted">{props.icon}</span>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{props.title}</h2>
          <p className="text-xs text-muted">{props.description}</p>
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
  description: string;
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
        <p className="truncate text-xs text-muted">{props.description}</p>
      </div>
      {props.control}
    </div>
  );
}
