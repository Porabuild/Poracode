import { useEffect, useState } from "react";
import { Button, Checkbox, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { AgentStatus, NativeMcpSetupPayload, NativeMcpSetupStatus } from "@/shared/contracts";
import { hookEnvForAgentStatus, hookEnvKey } from "@/shared/agentHookPluginEnv";
import { readBridge } from "@/renderer/bridge";
import { localEnvLabel } from "@/renderer/utils/machineLabels";

function NativeMcpEnvironment({ input }: { input: NativeMcpSetupPayload }) {
  const { t } = useLingui();
  const [status, setStatus] = useState<NativeMcpSetupStatus>();
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const envKey = hookEnvKey(input.env);
  useEffect(() => {
    let cancelled = false;
    setSelected([]);
    setFailed(false);
    readBridge()
      .getNativeMcpSetup(input)
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // The parent keys this component by provider and environment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.agentKind, envKey, refresh]);

  if (!failed && !status?.supported) return null;
  const apply = (installIds: string[], removeNames: string[]) => {
    if (!status?.revision) return;
    setPending(true);
    readBridge()
      .applyNativeMcpSetup({ ...input, revision: status.revision, installIds, removeNames })
      .then((next) => {
        setStatus(next);
        setSelected([]);
        toast.success(t`Native MCP configuration updated. Start a new CLI session to use it.`);
      })
      .catch(() => {
        toast.danger(
          t`Unable to update native MCP configuration. Refresh and review the configuration before retrying.`,
        );
        setStatus(undefined);
        setRefresh((value) => value + 1);
      })
      .finally(() => setPending(false));
  };
  return (
    <section className="mt-6 border-t border-border/10 pt-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-medium">
          <Trans>Native MCP setup</Trans> · {localEnvLabel(input.env)}
        </p>
        <Button
          size="sm"
          variant="tertiary"
          isDisabled={pending}
          onPress={() => {
            setStatus(undefined);
            setRefresh((value) => value + 1);
          }}
        >
          <Trans>Refresh</Trans>
        </Button>
      </div>
      <p className="mb-2 text-xs text-muted">
        <Trans>
          Optional: copy selected user MCP servers into this CLI's native configuration for all its
          sessions. Commands, arguments, and credentials are copied only when you click Install.
          Changes are not synced automatically.
        </Trans>
      </p>
      {status?.configPath ? (
        <p className="mb-3 break-all font-mono text-xs text-muted">{status.configPath}</p>
      ) : null}
      {failed || status?.issue ? (
        <p role="alert" className="text-xs text-danger">
          <Trans>Unable to read native MCP configuration.</Trans>
        </p>
      ) : null}
      {status && !status.issue ? (
        <>
          {!status.candidates.length ? (
            <p className="text-xs text-muted">
              <Trans>Add user MCP servers in MCP Servers settings to install them here.</Trans>
            </p>
          ) : null}
          <div className="space-y-2">
            {status.candidates.map((candidate) => (
              <div key={candidate.id}>
                <Checkbox
                  isSelected={selected.includes(candidate.id)}
                  isDisabled={pending || !candidate.eligible || candidate.conflict}
                  onChange={(checked) =>
                    setSelected((current) =>
                      checked
                        ? [...current, candidate.id]
                        : current.filter((id) => id !== candidate.id),
                    )
                  }
                >
                  <Checkbox.Content>
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    {candidate.name}
                  </Checkbox.Content>
                </Checkbox>
                <p className="ml-6 break-all text-xs text-muted">
                  {candidate.target} ·{" "}
                  {candidate.conflict
                    ? t`Existing or edited native entry; left unchanged`
                    : !candidate.eligible
                      ? t`Disabled server or unsupported native options`
                      : candidate.installed
                        ? t`Installed`
                        : t`Not installed`}
                </p>
              </div>
            ))}
          </div>
          {status.candidates.length ? (
            <Button
              className="mt-3"
              size="sm"
              variant="secondary"
              isDisabled={pending || !selected.length}
              isPending={pending}
              onPress={() => apply(selected, [])}
            >
              <Trans>Install</Trans>
            </Button>
          ) : null}
          {status.installedNames.map((name) => (
            <div key={name} className="mt-2 flex items-center justify-between gap-3 text-xs">
              <span>
                {name} · <Trans>Installed</Trans>
              </span>
              <Button
                size="sm"
                variant="tertiary"
                isDisabled={pending}
                aria-label={t`Uninstall ${name}`}
                onPress={() => apply([], [name])}
              >
                <Trans>Uninstall</Trans>
              </Button>
            </div>
          ))}
          {status.modifiedNames.length ? (
            <p className="mt-2 text-xs text-warning">
              <Trans>Existing or edited native entry; left unchanged</Trans>:{" "}
              {status.modifiedNames.join(", ")}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
export function NativeMcpSettings(props: { agentKind: string; statuses: readonly AgentStatus[] }) {
  const envs = new Map(
    props.statuses.map((status) => {
      const env = hookEnvForAgentStatus(status);
      return [hookEnvKey(env), env] as const;
    }),
  );
  return [...envs].map(([key, env]) => (
    <NativeMcpEnvironment
      key={`${props.agentKind}:${key}`}
      input={{ agentKind: props.agentKind, env }}
    />
  ));
}
