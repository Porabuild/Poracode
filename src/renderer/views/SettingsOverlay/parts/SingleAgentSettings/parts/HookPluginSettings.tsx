import { useEffect, useState } from "react";
import { Button, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Download, Trash2 } from "lucide-react";
import type { AgentHookPluginEnv, AgentHookPluginStatus, AgentStatus } from "@/shared/contracts";
import { hookEnvForAgentStatus, hookEnvKey } from "@/shared/agentHookPluginEnv";
import { localEnvLabel } from "@/renderer/utils/machineLabels";
import { readBridge } from "@/renderer/bridge";

function HookPluginEnvironmentRow(props: {
  agentKind: string;
  agentLabel: string;
  status: AgentHookPluginStatus;
  pending: boolean;
  onRefresh: (status: AgentHookPluginStatus) => void;
  onPending: (pending: boolean) => void;
}) {
  const { t } = useLingui();
  const { status } = props;
  const versionText = status.installed
    ? status.version
      ? `v${status.version}`
      : t`Installed`
    : status.supported
      ? t`Not installed`
      : t`Unsupported`;
  const isOutdated =
    status.installed && status.version !== undefined && status.version !== status.bundledVersion;
  // Install and update both go through installAgentHookPlugin. Only offer
  // uninstall when the provider actually supports it (status.canUninstall) —
  // otherwise the supervisor rejects the call and we'd surface a useless error.
  const mode: "install" | "update" | "uninstall" | "none" = !status.installed
    ? "install"
    : isOutdated
      ? "update"
      : status.canUninstall
        ? "uninstall"
        : "none";
  const actionLabel =
    mode === "install" ? t`Install` : mode === "update" ? t`Update` : t`Uninstall`;
  const runAction = () => {
    props.onPending(true);
    const action =
      mode === "uninstall"
        ? readBridge().uninstallAgentHookPlugin
        : readBridge().installAgentHookPlugin;
    action({ agentKind: props.agentKind, env: status.env })
      .then((result) => {
        props.onRefresh(result.status);
        const envName = localEnvLabel(status.env);
        toast.success(
          mode === "uninstall"
            ? t`${props.agentLabel} hooks removed for ${envName}.`
            : t`${props.agentLabel} hooks installed for ${envName}.`,
        );
      })
      .catch((error) =>
        toast.danger(
          error instanceof Error ? error.message : t`Unable to update ${props.agentLabel} hooks.`,
        ),
      )
      .finally(() => props.onPending(false));
  };

  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span className="shrink-0 font-medium text-foreground/90">{localEnvLabel(status.env)}</span>
        <span className="shrink-0 tabular-nums text-xs text-muted/60">{versionText}</span>
        {isOutdated ? (
          <span className="shrink-0 text-[10px] text-warning">
            <Trans>v{status.bundledVersion} available</Trans>
          </span>
        ) : null}
      </div>
      {mode === "none" ? null : (
        <Button
          size="sm"
          variant={mode === "uninstall" ? "tertiary" : "secondary"}
          className="h-7 min-h-7 gap-1 px-2 text-[11px]"
          isDisabled={!status.supported || props.pending}
          isPending={props.pending}
          onPress={runAction}
        >
          {mode === "uninstall" ? (
            <Trash2 className="size-3 text-danger" />
          ) : (
            <Download className="size-3" />
          )}
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export function HookPluginSettings(props: {
  agentKind: string;
  agentLabel: string;
  statuses: readonly AgentStatus[];
}) {
  const [pluginStatuses, setPluginStatuses] = useState<AgentHookPluginStatus[]>([]);
  const [pendingKey, setPendingKey] = useState<string | undefined>(undefined);

  // `props.statuses` is a fresh array on every parent render; depend on a
  // content-addressed key instead so the IPC only re-fires when the underlying
  // env set actually changes.
  const envsKey = [...new Set(props.statuses.map((s) => hookEnvKey(hookEnvForAgentStatus(s))))]
    .sort()
    .join("|");

  useEffect(() => {
    const envs = new Map<string, AgentHookPluginEnv>();
    for (const status of props.statuses) {
      const env = hookEnvForAgentStatus(status);
      envs.set(hookEnvKey(env), env);
    }
    const envList = [...envs.values()];
    if (envList.length === 0) {
      setPluginStatuses([]);
      return;
    }
    let cancelled = false;
    readBridge()
      .getAgentHookPluginStatuses({ agentKind: props.agentKind, envs: envList })
      .then((statuses) => {
        if (!cancelled) setPluginStatuses(statuses);
      })
      .catch(() => {
        if (!cancelled) setPluginStatuses([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.agentKind, envsKey]);

  if (pluginStatuses.length === 0 || pluginStatuses.every((status) => !status.supported)) {
    return null;
  }

  return (
    <div className="mt-6 border-t border-border/10 pt-3">
      <div className="mb-2">
        <p className="text-sm font-medium text-foreground">
          <Trans>CLI hooks</Trans>
        </p>
        <p className="text-xs text-muted">
          <Trans>
            Optional status hooks. Installed hooks update automatically; missing hooks are never
            installed automatically.
          </Trans>
        </p>
      </div>
      <div className="space-y-0.5">
        {pluginStatuses.map((status) => {
          const key = hookEnvKey(status.env);
          return (
            <HookPluginEnvironmentRow
              key={key}
              agentKind={props.agentKind}
              agentLabel={props.agentLabel}
              status={status}
              pending={pendingKey === key}
              onPending={(pending) => setPendingKey(pending ? key : undefined)}
              onRefresh={(next) =>
                setPluginStatuses((current) =>
                  current.map((entry) => (hookEnvKey(entry.env) === key ? next : entry)),
                )
              }
            />
          );
        })}
      </div>
    </div>
  );
}
