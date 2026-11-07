import { Button } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { RefreshCw } from "lucide-react";
import type { RemoteAccessScope } from "@/shared/remote";
import { useAsyncOperation } from "@/renderer/hooks/useAsyncOperation";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { remoteConnectionKey, type RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import { useRemoteServerStatusLabel } from "@/renderer/components/common/RemoteServerStatusDot";

const scopeLabels = {
  "session:read": msg`Read sessions`,
  "session:operate": msg`Operate sessions`,
  "terminal:read": msg`Read terminals`,
  "terminal:operate": msg`Control terminals`,
  "requests:resolve": msg`Respond to agent requests`,
  "projects:manage": msg`Manage projects`,
  "ports:forward": msg`Forward ports`,
} satisfies Record<RemoteAccessScope, MessageDescriptor>;

export function RemoteConnectionDetails({ server }: { readonly server: RemoteServerRecord }) {
  const { t } = useLingui();
  const connectionKey = remoteConnectionKey(server);
  const runtime = useRemoteServersStore((state) => state.runtime[connectionKey]);
  const reconnectServer = useRemoteServersStore((state) => state.reconnectServer);
  const { busy, error, run } = useAsyncOperation();
  const status = runtime?.status ?? "offline";
  const statusLabel = useRemoteServerStatusLabel(status);
  const transport = server.transport;
  let endpoint: string | null = null;
  if (transport?.kind === "ssh") {
    const { target, port } = transport.connection;
    endpoint = port === undefined ? target : `${target}:${port}`;
  } else if (transport?.kind !== "environment") {
    try {
      const url = new URL(server.endpoint);
      if (url.protocol === "http:" || url.protocol === "https:") {
        endpoint = `${url.origin}${url.pathname}`;
      }
    } catch {
      // A malformed saved endpoint must not expose credentials as raw text.
    }
  }

  return (
    <section aria-label={t`Connection details`} className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold text-foreground/80">
          <Trans>Connection details</Trans>
        </h3>
        <Button
          variant="tertiary"
          size="sm"
          isDisabled={busy || status === "connecting"}
          onPress={() => run(() => reconnectServer(connectionKey))}
        >
          <RefreshCw
            className={`size-3.5 ${busy || status === "connecting" ? "animate-spin" : ""}`}
          />
          <Trans>Reconnect</Trans>
        </Button>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
        <dt className="text-muted">
          <Trans>Status</Trans>
        </dt>
        <dd>{statusLabel}</dd>
        <dt className="text-muted">
          <Trans>Connection method</Trans>
        </dt>
        <dd>
          {transport?.kind === "ssh"
            ? "SSH"
            : transport?.kind === "environment"
              ? t`Host-owned environment`
              : t`Paired connection`}
        </dd>
        {transport?.kind !== "environment" ? (
          <>
            <dt className="text-muted">
              <Trans>Saved endpoint</Trans>
            </dt>
            <dd className="break-all font-mono select-text">{endpoint ?? t`Unavailable`}</dd>
          </>
        ) : null}
        <dt className="text-muted">
          <Trans>Host ID</Trans>
        </dt>
        <dd className="break-all font-mono select-text">{server.desktopId}</dd>
        {server.appVersion ? (
          <>
            <dt className="text-muted">
              <Trans>Version</Trans>
            </dt>
            <dd className="break-all">{server.appVersion}</dd>
          </>
        ) : null}
      </dl>
      <details className="text-xs">
        <summary className="cursor-pointer text-foreground/80">
          <Trans>Granted permissions</Trans> ({server.scopes.length})
        </summary>
        {server.scopes.length ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
            {server.scopes.map((scope) => (
              <li key={scope}>{t(scopeLabels[scope])}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-muted">
            <Trans>No permissions granted.</Trans>
          </p>
        )}
      </details>
      {error || ((status === "error" || status === "offline") && runtime?.message) ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">
          {error || runtime?.message}
        </p>
      ) : null}
    </section>
  );
}
