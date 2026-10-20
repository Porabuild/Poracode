import { Input } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { Button } from "@/renderer/components/common";
import type { LoadedPlugin } from "@/shared/contracts";
import type { usePluginOauth } from "./usePluginOauth";

export function PluginServiceAccounts({
  plugin,
  oauth,
}: {
  plugin: LoadedPlugin;
  oauth: ReturnType<typeof usePluginOauth>;
}) {
  const { t } = useLingui();
  const [labels, setLabels] = useState<Record<string, string>>({});
  const services = plugin.mcpServers.filter((server) => server.entry.type !== "stdio");
  if (services.length === 0) return null;
  return (
    <section className="space-y-2.5 border-t border-[var(--hairline)] py-4">
      <h2 className="text-xs font-semibold text-foreground">
        <Trans>Service accounts</Trans>
      </h2>
      <p className="text-xs text-muted">
        <Trans>
          Accounts belong to this plugin and service. Account labels are yours; the service may not
          report a verified identity. Provider logins are separate.
        </Trans>
      </p>
      <p className="text-xs text-muted">
        <Trans>Account changes apply to new threads.</Trans>
      </p>
      {services.map((service) => (
        <div
          key={service.name}
          className="space-y-2.5 rounded-2xl border border-[var(--hairline-soft)] p-2.5"
        >
          <h3 className="text-[13px] font-medium text-foreground">{service.name}</h3>
          {!oauth.isRemoteServer(service.name) ? (
            <p className="text-xs text-muted">
              <Trans>
                Sign-in is unavailable for project plugins and services with plugin-managed
                authentication.
              </Trans>
            </p>
          ) : (
            <>
              {oauth.accounts
                .filter((account) => account.serverName === service.name)
                .map((account) => (
                  <div
                    key={account.id}
                    className="space-y-1 border-b border-[var(--hairline)] pb-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 text-[13px] text-foreground">
                        {account.label}
                      </span>
                      <span className="text-[11px] text-muted">
                        {account.status === "connected"
                          ? t`Connected`
                          : account.status === "expired"
                            ? t`Sign-in expired`
                            : t`Disconnected`}
                      </span>
                      {account.selected ? (
                        <span className="text-[11px] text-muted">
                          <Trans>Selected</Trans>
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          isDisabled={oauth.isBusy || account.status !== "connected"}
                          onPress={() => void oauth.select(account)}
                        >
                          <Trans>Use account</Trans>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        isDisabled={oauth.isBusy}
                        onPress={() =>
                          account.status === "connected"
                            ? void oauth.disconnect(service.name, account.id)
                            : void oauth.connect(service.name, account.label, false, account.id)
                        }
                      >
                        {account.status === "connected" ? t`Sign out` : t`Sign in`}
                      </Button>
                    </div>
                    <p className="break-all text-[11px] text-muted">
                      {t`Granted scopes`}:{" "}
                      {account.scopes.length > 0
                        ? account.scopes.join(", ")
                        : t`Not reported by service`}
                    </p>
                  </div>
                ))}
              <div className="flex items-stretch gap-2">
                <Input
                  aria-label={t`Account label for ${service.name}`}
                  placeholder={t`Account label`}
                  value={labels[service.name] ?? ""}
                  maxLength={120}
                  className="min-w-0 flex-1"
                  onChange={(event) => setLabels({ ...labels, [service.name]: event.target.value })}
                />
                <Button
                  size="sm"
                  variant="tertiary"
                  className="h-auto"
                  isDisabled={oauth.isBusy || !labels[service.name]?.trim()}
                  onPress={() => void oauth.connect(service.name, labels[service.name], true)}
                >
                  <Trans>Add account</Trans>
                </Button>
              </div>
            </>
          )}
        </div>
      ))}
      {oauth.canCancel ? (
        <Button size="sm" variant="ghost" onPress={() => void oauth.cancel()}>
          <Trans>Cancel sign-in</Trans>
        </Button>
      ) : null}
    </section>
  );
}
