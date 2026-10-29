import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowLeft, Box, Plug } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/renderer/components/common";
import { ConfirmDialog } from "@/renderer/components/common/ConfirmDialog";
import { isPluginSupportedOnHost } from "@/shared/plugins/catalog";
import { canonicalPluginCategory } from "@/shared/plugins/categories";
import { PluginIcon } from "./PluginIcon";
import { usePluginCategoryLabel } from "./pluginCategories";
import { useLocalizedPluginDiagnostic, type LocalizedPlugin } from "./pluginCopy";
import {
  catalogEntryKey,
  type PluginCatalogController,
  type PluginCatalogTarget,
} from "./usePluginCatalog";

export function PluginCatalogDetail(props: {
  target: PluginCatalogTarget;
  controller: PluginCatalogController;
  plugins: readonly LocalizedPlugin[];
  hostPlatform: NodeJS.Platform;
  onBack: () => void;
  onOpen: (name: string) => void;
}) {
  const { t } = useLingui();
  const { result, review, run, busy, error } = props.controller;
  const [removing, setRemoving] = useState(false);
  const backRef = useRef<HTMLButtonElement>(null);
  const describeDiagnostic = useLocalizedPluginDiagnostic();
  const categoryLabel = usePluginCategoryLabel();
  const catalog = result.catalogs.find((item) => item.id === props.target.catalogId);
  const entry = catalog?.entries.find((item) => item.name === props.target.entryName);
  const receipt = result.installations.find(
    (item) =>
      item.catalogId === props.target.catalogId && item.entryName === props.target.entryName,
  );
  const inspection =
    review && catalogEntryKey(review.target) === catalogEntryKey(props.target)
      ? review.inspection
      : undefined;
  const installed =
    receipt &&
    props.plugins.find(
      (item) => item.plugin.source === "user" && item.plugin.name === receipt.pluginName,
    );
  const collision =
    inspection &&
    (result.installations.some(
      (item) => item.pluginName === inspection.plugin.name && item !== receipt,
    ) ||
      props.plugins.some(
        (item) =>
          item.plugin.name === inspection.plugin.name &&
          !(receipt && item.plugin.source === "user"),
      ));
  const supported = !inspection || isPluginSupportedOnHost(inspection.plugin, props.hostPlatform);
  const source = entry?.source ?? receipt?.packageSource;
  const catalogSource = catalog?.source ?? receipt?.catalogSource;
  const catalogName = catalog?.name ?? receipt?.catalogName;
  const catalogLocation =
    catalogSource?.type === "git"
      ? catalogSource.url
      : catalogSource?.type === "local"
        ? catalogSource.path
        : undefined;
  const catalogReference =
    catalogSource?.type === "git" && catalogSource.ref ? catalogSource.ref : undefined;
  const name = entry?.name ?? receipt?.entryName ?? props.target.entryName;
  const canonicalCategory = canonicalPluginCategory(entry?.category);
  const categoryText = canonicalCategory ? categoryLabel(canonicalCategory) : entry?.category;

  useEffect(() => {
    backRef.current?.focus();
  }, []);

  return (
    <div className="mx-auto min-h-full max-w-[880px] pb-8">
      <Button
        ref={backRef}
        size="sm"
        variant="ghost"
        className="-ms-2 mb-4 gap-2 px-2 text-muted"
        isDisabled={busy}
        onPress={props.onBack}
      >
        <ArrowLeft className="size-4" />
        <Trans>Back to plugins</Trans>
      </Button>
      <div className="mb-4">
        <div className="mb-3 flex size-14 items-center justify-center rounded-xl bg-surface-secondary">
          <PluginIcon
            pluginId={name}
            className="size-9"
            target={{ type: "catalog", ...props.target }}
          />
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="min-w-0 break-words text-lg font-semibold text-foreground">{name}</h1>
          {installed ? (
            <Button
              size="sm"
              variant="tertiary"
              isDisabled={busy}
              onPress={() => props.onOpen(installed.plugin.name)}
            >
              <Trans>Manage</Trans>
            </Button>
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            {entry?.description ?? installed?.description}
          </p>
        </div>
      </div>

      <section
        aria-label={t`Plugin source`}
        className="rounded-2xl border border-[var(--hairline-soft)] bg-surface-secondary/30 p-3.5 text-xs"
      >
        <h2 className="text-xs font-semibold text-foreground">
          <Trans>Plugin source</Trans>
        </h2>
        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1">
          {catalogName ? (
            <>
              <dt className="text-muted">
                <Trans>Marketplace</Trans>
              </dt>
              <dd className="break-words text-foreground">{catalogName}</dd>
            </>
          ) : null}
          {catalogLocation ? (
            <>
              <dt className="text-muted">
                <Trans>Marketplace source</Trans>
              </dt>
              <dd className="break-all text-foreground">
                {catalogLocation}
                {catalogReference ? ` (${catalogReference})` : ""}
              </dd>
            </>
          ) : null}
          {entry?.version ? (
            <>
              <dt className="text-muted">
                <Trans>Version</Trans>
              </dt>
              <dd className="text-foreground">{entry.version}</dd>
            </>
          ) : null}
          {categoryText ? (
            <>
              <dt className="text-muted">
                <Trans>Category</Trans>
              </dt>
              <dd className="break-words text-foreground">{categoryText}</dd>
            </>
          ) : null}
          {source?.type === "git" ? (
            <>
              <dt className="text-muted">
                <Trans>Repository</Trans>
              </dt>
              <dd className="break-all text-foreground">{source.url}</dd>
              <dt className="text-muted">
                <Trans>Reference</Trans>
              </dt>
              <dd className="break-all text-foreground">
                {source.ref ?? "HEAD"}
                {source.sha ? ` (${source.sha})` : ""}
              </dd>
              <dt className="text-muted">
                <Trans>Path</Trans>
              </dt>
              <dd className="break-all text-foreground">{source.path}</dd>
            </>
          ) : source?.type === "path" ? (
            <>
              <dt className="text-muted">
                <Trans>Path</Trans>
              </dt>
              <dd className="break-all text-foreground">{source.path}</dd>
            </>
          ) : null}
        </dl>
        <p className="mt-2 text-muted">
          <Trans>
            Review downloads this plugin for inspection. Installation is a separate step.
          </Trans>
        </p>
        {entry?.unavailable.length ? (
          <p className="mt-1.5 text-warning">
            <Trans>Unsupported marketplace requirements</Trans>
          </p>
        ) : null}
        {!entry ? (
          <p className="mt-1.5 text-muted">
            <Trans>This plugin is no longer listed in a registered source.</Trans>
          </p>
        ) : null}
        <Button
          className="mt-2.5"
          size="sm"
          variant="tertiary"
          aria-label={t`Review ${props.target.entryName}`}
          isDisabled={busy || !entry || entry.unavailable.length > 0}
          onPress={() => void run({ action: "inspect", ...props.target })}
        >
          {receipt ? <Trans>Review update</Trans> : <Trans>Review</Trans>}
        </Button>
      </section>

      {inspection ? (
        <section className="space-y-4 py-5" aria-label={t`Plugin review`}>
          <h2 className="text-xs font-semibold text-foreground">
            <Trans>Plugin review</Trans>
          </h2>
          <p className="text-xs text-muted">
            <Trans>
              Installing makes this plugin available in Plugins. Enable it after reviewing its
              skills, servers, and required access.
            </Trans>
          </p>
          {inspection.plugin.skills.length ? (
            <div>
              <div className="flex items-baseline gap-1.5 border-b border-[var(--hairline)] pb-1.5">
                <h3 className="text-xs font-semibold text-foreground">{t`Skills`}</h3>
                <span className="text-[11px] tabular-nums text-muted">
                  {inspection.plugin.skills.length}
                </span>
              </div>
              {inspection.plugin.skills.map((skill) => (
                <div
                  key={skill.folder}
                  className="flex items-center gap-2.5 border-b border-[var(--hairline)] py-2 last:border-0"
                >
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-secondary text-muted"
                    aria-hidden="true"
                  >
                    <Box className="size-3" />
                  </span>
                  <span className="min-w-0 break-words text-[13px] text-foreground">
                    {skill.folder}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {inspection.plugin.mcpServers.length ? (
            <div>
              <div className="flex items-baseline gap-1.5 border-b border-[var(--hairline)] pb-1.5">
                <h3 className="text-xs font-semibold text-foreground">{t`MCP servers`}</h3>
                <span className="text-[11px] tabular-nums text-muted">
                  {inspection.plugin.mcpServers.length}
                </span>
              </div>
              {inspection.plugin.mcpServers.map((server) => {
                const endpoint =
                  server.entry.type === "stdio"
                    ? [server.entry.command, ...server.entry.args].join(" ")
                    : server.entry.url;
                return (
                  <div
                    key={server.name}
                    className="flex items-center gap-2.5 border-b border-[var(--hairline)] py-2 last:border-0"
                  >
                    <span
                      className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-secondary text-muted"
                      aria-hidden="true"
                    >
                      <Plug className="size-3" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-foreground">{server.name}</p>
                      <p className="truncate text-[11px] text-muted" title={endpoint}>
                        {endpoint}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
          <p className="break-all font-mono text-[10px] text-muted">
            {inspection.revision} · {inspection.digest}
          </p>
          {inspection.plugin.diagnostics.map((diagnostic, index) => (
            <p key={index} className="text-xs text-warning">
              {describeDiagnostic(diagnostic)}
            </p>
          ))}
          {collision ? (
            <p className="text-xs text-warning">
              <Trans>
                A different plugin already uses this identifier. It will not be replaced.
              </Trans>
            </p>
          ) : null}
          {!supported ? (
            <p className="text-xs text-warning">
              <Trans>Unavailable on this device</Trans>
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="tertiary"
              isDisabled={
                busy ||
                !!collision ||
                !supported ||
                (!inspection.plugin.skills.length && !inspection.plugin.mcpServers.length)
              }
              onPress={() =>
                void run({
                  action: receipt ? "update" : "install",
                  ...props.target,
                  reviewDigest: inspection.digest,
                })
              }
            >
              {receipt ? <Trans>Update plugin</Trans> : <Trans>Install plugin</Trans>}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              isDisabled={busy}
              onPress={props.controller.clearReview}
            >
              <Trans>Cancel</Trans>
            </Button>
          </div>
        </section>
      ) : null}
      {receipt ? (
        <section className="space-y-2.5 border-t border-[var(--hairline)] py-4">
          <p className="break-all text-[11px] text-muted">
            {t`Installed`}: {receipt.revision} · {receipt.digest}
          </p>
          <Button size="sm" variant="danger" isDisabled={busy} onPress={() => setRemoving(true)}>
            <Trans>Remove plugin</Trans>
          </Button>
        </section>
      ) : null}
      {busy ? (
        <p className="py-3 text-xs text-muted" role="status">
          <Trans>Loading plugins and marketplaces…</Trans>
        </p>
      ) : null}
      {error ? (
        <p className="py-3 text-xs text-warning" role="alert">
          <Trans>
            Could not manage this plugin or marketplace. Check the source, compatibility, and local
            file changes, then try again.
          </Trans>
        </p>
      ) : null}
      <ConfirmDialog
        isOpen={removing}
        title={t`Remove plugin`}
        body={t`Remove this plugin and its service accounts from Poracode?`}
        confirmLabel={t`Remove plugin`}
        isPending={busy}
        onClose={() => {
          if (!busy) setRemoving(false);
        }}
        onConfirm={() => {
          if (receipt)
            void run({ action: "remove-package", pluginName: receipt.pluginName }).then((value) => {
              setRemoving(false);
              if (value) {
                props.onBack();
              }
            });
        }}
      />
    </div>
  );
}
