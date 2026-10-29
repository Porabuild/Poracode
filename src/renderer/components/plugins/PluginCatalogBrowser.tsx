import { Input, Modal } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/renderer/components/common";
import { RECOMMENDED_PLUGIN_CATALOGS } from "@/shared/plugins/marketplaces";
import type { PluginCatalogController } from "./usePluginCatalog";

export function PluginCatalogBrowser(props: {
  controller: PluginCatalogController;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useLingui();
  const [source, setSource] = useState("");
  const { result, run, busy, error } = props.controller;

  return (
    <Modal.Backdrop
      isOpen={props.isOpen}
      isDismissable
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <Modal.Container scroll="inside">
        <Modal.Dialog className="sm:max-w-[520px]">
          <Modal.CloseTrigger aria-label={t`Close`} />
          <Modal.Header>
            <Modal.Heading>
              <Trans>Marketplace sources</Trans>
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="space-y-4 p-4">
            <div className="divide-y divide-[var(--hairline)]">
              {result.catalogs.map((catalog) => {
                const location =
                  catalog.source.type === "git" ? catalog.source.url : catalog.source.path;
                return (
                  <section
                    key={catalog.id}
                    aria-label={catalog.name}
                    className="flex items-start gap-2 py-2.5 first:pt-0"
                  >
                    <div className="min-w-0 flex-1">
                      <h3
                        className="truncate text-[13px] font-medium text-foreground"
                        title={catalog.name}
                      >
                        {catalog.name}
                      </h3>
                      <p className="mt-0.5 truncate text-[11px] text-muted" title={location}>
                        {location}
                      </p>
                      <p className="mt-0.5 text-[10px] leading-snug text-muted">
                        {catalog.source.type === "git" ? (
                          <>
                            {t`Reference`}: {catalog.source.ref ?? "HEAD"}
                            {" · "}
                          </>
                        ) : null}
                        <span>
                          {catalog.refreshedAt === 0 ? (
                            <Trans>Not loaded</Trans>
                          ) : (
                            <>
                              {t`Plugins`}: {catalog.entries.length} ·{" "}
                              {i18n.date(catalog.refreshedAt, {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })}
                            </>
                          )}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        isIconOnly
                        className="size-7 text-muted"
                        isDisabled={busy}
                        aria-label={t`Refresh ${catalog.name}`}
                        onPress={() => void run({ action: "refresh", catalogId: catalog.id })}
                      >
                        <RefreshCw className="size-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        isIconOnly
                        className="size-7 text-muted hover:text-danger"
                        aria-label={t`Remove marketplace`}
                        isDisabled={busy}
                        onPress={() => void run({ action: "remove-source", catalogId: catalog.id })}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </section>
                );
              })}
            </div>
            <p className="text-[10px] text-muted">
              <Trans>Removing a source keeps its installed plugins.</Trans>
            </p>
            <div className="space-y-2.5 border-t border-[var(--hairline)] pt-3">
              <h3 className="text-xs font-medium text-foreground">
                <Trans>Add a source</Trans>
              </h3>
              <p className="text-[11px] text-muted">
                <Trans>
                  Add a public Git repository or a local marketplace. Review supported components
                  before installing.
                </Trans>
              </p>
              <div className="flex items-stretch gap-2">
                <Input
                  aria-label={t`Marketplace URL or local path`}
                  placeholder={t`Marketplace URL or local path`}
                  value={source}
                  disabled={busy}
                  onChange={(event) => setSource(event.target.value)}
                  className="min-w-0 flex-1"
                />
                <Button
                  size="sm"
                  variant="tertiary"
                  className="h-auto"
                  isDisabled={busy || !source.trim()}
                  onPress={() =>
                    void run({
                      action: "add",
                      source: source.trim().startsWith("https://")
                        ? { type: "git", url: source.trim() }
                        : { type: "local", path: source.trim() },
                    }).then((value) => {
                      if (value) setSource("");
                    })
                  }
                >
                  <Trans>Add marketplace</Trans>
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {RECOMMENDED_PLUGIN_CATALOGS.filter(
                  (catalog) =>
                    !result.catalogs.some(
                      (item) => item.source.type === "git" && item.source.url === catalog.url,
                    ),
                ).map((catalog) => (
                  <span key={catalog.name} title={catalog.url}>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      isDisabled={busy}
                      onPress={() =>
                        void run({ action: "add", source: { type: "git", url: catalog.url } })
                      }
                    >
                      {t`Add ${catalog.name}`}
                    </Button>
                  </span>
                ))}
              </div>
            </div>
            {busy ? (
              <p role="status" className="text-xs text-muted">
                <Trans>Loading plugins and marketplaces…</Trans>
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-xs text-warning">
                <Trans>
                  Could not manage this plugin or marketplace. Check the source, compatibility, and
                  local file changes, then try again.
                </Trans>
              </p>
            ) : null}
          </Modal.Body>
          <Modal.Footer>
            <Button slot="close" variant="ghost" className="text-muted">
              <Trans>Close</Trans>
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
