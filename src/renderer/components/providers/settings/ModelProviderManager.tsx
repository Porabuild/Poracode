import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { AgentEnv } from "@/shared/machines";
import type {
  ConfiguredModelProvider,
  ManageModelProvidersPayload,
  ManageModelProvidersResult,
} from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { ConfirmDialog } from "@/renderer/components/common";
import { ModelProviderEditor } from "./ModelProviderEditor";

export function ModelProviderManager({
  agentKind,
  env,
  onChanged,
}: {
  agentKind: string;
  env: AgentEnv;
  onChanged: () => void;
}) {
  const { t } = useLingui();
  const [data, setData] = useState<Extract<ManageModelProvidersResult, { ok: true }>>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [editing, setEditing] = useState<ConfiguredModelProvider | "new">();
  const [removing, setRemoving] = useState<ConfiguredModelProvider>();
  useEffect(() => {
    let active = true;
    void readBridge()
      .manageModelProviders({ agentKind, env, action: "list" })
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          setData(result);
          setError("");
        } else setError(t`Unable to load providers.`);
      })
      .catch(() => {
        if (active) setError(t`Unable to load providers.`);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [agentKind, env, t]);

  const mutate = async (request: ManageModelProvidersPayload) => {
    setBusy(true);
    setError("");
    try {
      const result = await readBridge().manageModelProviders(request);
      if (result.ok) {
        setData(result);
        setEditing(undefined);
        if (request.action !== "list") onChanged();
      } else
        setError(
          result.reason === "conflict"
            ? t`Provider settings changed. Reload before saving.`
            : result.reason === "credential"
              ? t`Provider saved, but its API key could not be stored. Reload and try again.`
              : t`Unable to update providers. Check the native configuration for overrides.`,
        );
    } catch {
      setError(t`Unable to update providers. Check the native configuration for overrides.`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="tertiary"
          isDisabled={busy}
          onPress={() => {
            setEditing(undefined);
            void mutate({ agentKind, env, action: "list" });
          }}
        >
          <Trans>Reload</Trans>
        </Button>
        <Button
          size="sm"
          variant="secondary"
          isDisabled={busy || !data || editing !== undefined}
          onPress={() => setEditing("new")}
        >
          <Trans>Add provider</Trans>
        </Button>
      </div>
      {busy && !data ? (
        <p role="status" className="text-sm text-muted">
          <Trans>Loading…</Trans>
        </p>
      ) : null}
      {data?.providers.length === 0 && !editing ? (
        <p className="text-sm text-muted">
          <Trans>No providers connected yet.</Trans>
        </p>
      ) : null}
      {data?.providers.map((provider) => (
        <div
          key={provider.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-border/10 p-3"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{provider.name}</p>
            <p className="truncate text-xs text-muted">{provider.id}</p>
            <p className="text-xs text-muted">
              {provider.credentialConfigured
                ? t`API key configured`
                : t`No API key stored; native authentication may apply.`}
            </p>
          </div>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="tertiary"
              isDisabled={busy || editing !== undefined}
              onPress={() => setEditing(provider)}
            >
              <Trans>Edit</Trans>
            </Button>
            <Button
              size="sm"
              variant="danger-soft"
              isDisabled={busy || editing !== undefined || !provider.removable}
              onPress={() => setRemoving(provider)}
            >
              <Trans>Remove</Trans>
            </Button>
          </div>
        </div>
      ))}
      {editing && data ? (
        <ModelProviderEditor
          key={typeof editing === "string" ? editing : editing.id}
          provider={typeof editing === "string" ? undefined : editing}
          catalog={data.catalog.filter(
            (entry) => !data.providers.some((provider) => provider.id === entry.id),
          )}
          busy={busy}
          onCancel={() => setEditing(undefined)}
          onSave={(provider, apiKey) => {
            void mutate({
              agentKind,
              env,
              action: "save",
              create: editing === "new",
              revision: data.revision,
              provider,
              ...(apiKey ? { apiKey } : {}),
            });
          }}
        />
      ) : null}
      <ConfirmDialog
        isOpen={removing !== undefined}
        title={t`Remove provider`}
        body={
          <Trans>
            Remove this model route? Saved credentials are kept. Existing threads pick up changes
            when restarted.
          </Trans>
        }
        confirmLabel={t`Remove`}
        onClose={() => setRemoving(undefined)}
        onConfirm={() => {
          const provider = removing;
          setRemoving(undefined);
          if (provider && data)
            void mutate({
              agentKind,
              env,
              action: "remove",
              revision: data.revision,
              providerId: provider.id,
            });
        }}
      />
    </div>
  );
}
