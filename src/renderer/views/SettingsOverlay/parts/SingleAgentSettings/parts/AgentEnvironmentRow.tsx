import { Button, Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { AlertTriangle, ArrowUpCircle, Download } from "lucide-react";
import {
  formatUpdateCommandLine,
  isNewerVersion,
  resolveSharedUpdateCommand,
} from "@/shared/agents/updateResolver";
import type {
  AgentOwnedAuthMethod,
  AgentProviderMetadata,
  AgentStatus,
  AgentTerminalAuthMethod,
} from "@/shared/contracts";
import { envLabelForStatus, statusUpdateScope } from "@/renderer/utils/acpRegistryAuth";
import { PixelLoader } from "@/renderer/components/common";
import { formatAgentMetadataSummary } from "./authHelpers";

export function AgentInstallEnvironmentRow(props: {
  agentLabel: string;
  status: AgentStatus;
  installPending: boolean;
  onInstall: (status: AgentStatus) => void;
}) {
  const { t } = useLingui();
  const env = envLabelForStatus(props.status);

  return (
    <div className="flex flex-col py-1.5 px-2 -mx-2 hover:bg-surface-secondary/40 rounded-lg transition-colors group/env">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <span className="shrink-0 text-foreground/90">{env || t`Default`}</span>
          <span className="shrink-0 tabular-nums text-muted/60 font-normal text-xs">
            <Trans>Not installed</Trans>
          </span>
        </div>
        <Button
          size="sm"
          variant="tertiary"
          className="h-6 min-h-6 px-2 py-0 text-[10px] text-muted hover:text-foreground"
          aria-label={env ? t`Install on ${env}` : t`Install`}
          isPending={props.installPending}
          onPress={() => props.onInstall(props.status)}
        >
          {props.installPending ? <PixelLoader size="xs" /> : <Download className="size-3" />}
          {props.installPending ? t`Installing` : t`Install`}
        </Button>
      </div>
      <div className="flex min-w-0 h-4 items-center">
        <span className="min-w-0 truncate text-[11px] font-normal text-muted/60">
          {env ? t`Install ${props.agentLabel} for ${env}.` : t`Install ${props.agentLabel}.`}
        </span>
      </div>
    </div>
  );
}

/**
 * A provider whose tile hosts several independently installed runtimes
 * (Antigravity's `agy` CLI plus its ACP chat artifact) reports all of them
 * through one environment row: one version chip, one install action for
 * whichever runtime is missing, one update action for whichever is stale.
 * Composed by the caller so the row stays presentational.
 */
export interface AgentEnvironmentRuntimes {
  /** Replaces the single-version chip, e.g. `CLI v1.1.22 · ACP not installed`. */
  summary: string;
  install?: { label: string; isPending: boolean; onInstall: () => void };
  /**
   * One action reconciling every stale runtime. `label` names a target version
   * ("Update to v0.3.2") when a single runtime is behind; omit it when several
   * are, so the button does not claim one runtime's version for all of them.
   */
  update?: { label?: string; isPending: boolean; onUpdate: () => void };
}

export function AgentEnvironmentRow(props: {
  agentLabel: string;
  status: AgentStatus;
  runtimes?: AgentEnvironmentRuntimes | undefined;
  authMethods: ReadonlyArray<AgentOwnedAuthMethod | AgentTerminalAuthMethod>;
  canLogout: boolean;
  authPending: boolean;
  pendingMessage: string | undefined;
  onLogin: (method: AgentOwnedAuthMethod | AgentTerminalAuthMethod) => void;
  onLogout: () => void;

  latestNpmVersion: string | undefined;
  newestInstalledVersion: string | undefined;
  binaryUpdatePending: boolean;
  isRedetecting: boolean;
  onUpdate: (status: AgentStatus) => void;

  includeAuthFallback: boolean;
  acpInstanceId: string | undefined;
  /**
   * Identity resolved out-of-band (Antigravity's account lives behind its
   * language server, not in the detected status). When present it overrides the
   * status's own `providerMetadata` for the summary line.
   */
  accountMetadata?: AgentProviderMetadata | undefined;
  /**
   * Plan label read from the provider's live usage snapshot. Takes precedence
   * over the detected `providerMetadata.plan`, which snapshots the plan at
   * sign-in time and goes stale when the user changes subscription.
   */
  livePlan?: string | undefined;
}) {
  const { t } = useLingui();
  const { status, authMethods } = props;
  const hasAnyMethod = authMethods.length > 0;
  const isAuthenticated = status.authState === "authenticated";
  const isMissing =
    status.authState === "missing" ||
    (status.authState === "unknown" && hasAnyMethod && status.acpSessionEstablished !== true);
  const env = envLabelForStatus(status);
  const canLogout = isAuthenticated && props.canLogout;
  const canReLogin = isAuthenticated && !canLogout && hasAnyMethod;
  const canLogin = (isMissing || canReLogin) && hasAnyMethod;
  const loginLabel = canReLogin ? t`Re-login` : t`Login`;
  const pendingLabel = canLogout ? t`Logging out` : t`Logging in`;

  const hasMultipleMethods = authMethods.length > 1;
  const singleMethod = !hasMultipleMethods ? authMethods[0] : undefined;

  // Only override with the out-of-band account on an env that is itself signed
  // in — otherwise a not-authenticated row (e.g. a WSL distro pending login)
  // would show the shared account next to its own "Login required" warning.
  const metadataSummary = formatAgentMetadataSummary(
    props.accountMetadata && isAuthenticated
      ? { ...status, providerMetadata: props.accountMetadata }
      : status,
    {
      includeAuthFallback: props.includeAuthFallback,
      // Same gate as `accountMetadata`: usage is collected for the signed-in
      // account, so a row awaiting its own login must not borrow that plan.
      ...(isAuthenticated && props.livePlan ? { livePlan: props.livePlan } : {}),
    },
  );

  const installedVer = status.version;
  const registryTargetVersion =
    props.latestNpmVersion !== undefined &&
    installedVer !== undefined &&
    isNewerVersion(props.latestNpmVersion, installedVer)
      ? props.latestNpmVersion
      : undefined;
  const peerTargetVersion =
    props.newestInstalledVersion !== undefined &&
    installedVer !== undefined &&
    isNewerVersion(props.newestInstalledVersion, installedVer)
      ? props.newestInstalledVersion
      : undefined;
  const targetVersion = registryTargetVersion ?? peerTargetVersion;
  const updateLabel = props.runtimes
    ? props.runtimes.update?.label
    : targetVersion
      ? `v${targetVersion}`
      : "";
  const showUpdateButton = props.runtimes
    ? !props.isRedetecting && props.runtimes.update !== undefined
    : !props.isRedetecting &&
      props.acpInstanceId === undefined &&
      status.installed &&
      targetVersion !== undefined;
  const updatePending = props.runtimes
    ? (props.runtimes.update?.isPending ?? false)
    : props.binaryUpdatePending;
  const runUpdate = () => {
    if (props.runtimes?.update) {
      props.runtimes.update.onUpdate();
      return;
    }
    props.onUpdate(status);
  };

  const runtimeInstall = props.runtimes?.install;
  const previewScope = statusUpdateScope(status);
  // The combined update reconciles several runtimes at once, so previewing one
  // runtime's shell command there would misreport what the button runs.
  const previewCommand =
    showUpdateButton && !props.runtimes
      ? resolveSharedUpdateCommand({
          update: status.update,
          executablePath: status.executablePath,
          envKind: previewScope.envKind,
        })
      : undefined;
  const previewCommandLine = previewCommand ? formatUpdateCommandLine(previewCommand) : undefined;

  const envOrAgentLabel = env || t`Agent`;
  const description = isMissing
    ? hasMultipleMethods
      ? env
        ? t`Choose how to sign in for ${env}.`
        : t`Choose how to sign in.`
      : singleMethod
        ? env
          ? t`Complete ${singleMethod.name} sign-in for ${env}.`
          : t`Complete ${singleMethod.name} sign-in.`
        : t`${envOrAgentLabel} needs authentication.`
    : "";

  return (
    <div className="@container flex flex-col py-1.5 px-2 -mx-2 hover:bg-surface-secondary/40 rounded-lg transition-colors group/env">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium @max-[400px]:flex-wrap">
          <span className="shrink-0 text-foreground/90">{env || t`Default`}</span>
          {props.isRedetecting ? (
            <PixelLoader size="xs" />
          ) : (
            <span className="shrink-0 tabular-nums text-muted/60 font-normal text-xs">
              {props.runtimes?.summary ?? (installedVer ? `v${installedVer}` : "—")}
            </span>
          )}
          {runtimeInstall && !props.isRedetecting ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-5 min-h-5 shrink-0 gap-1 px-1.5 py-0 text-[10px] text-muted hover:text-foreground @max-[400px]:basis-full"
              aria-label={env ? `${runtimeInstall.label} (${env})` : runtimeInstall.label}
              isPending={runtimeInstall.isPending}
              onPress={runtimeInstall.onInstall}
            >
              {runtimeInstall.isPending ? (
                <PixelLoader size="xs" />
              ) : (
                <Download className="size-3" />
              )}
              {runtimeInstall.label}
            </Button>
          ) : null}
          {updatePending && !props.isRedetecting ? (
            <div
              className="flex h-5 min-h-5 items-center @max-[400px]:basis-full"
              role="status"
              aria-label={
                env ? t`Updating ${props.agentLabel} (${env})` : t`Updating ${props.agentLabel}`
              }
            >
              <PixelLoader size="xs" />
            </div>
          ) : showUpdateButton ? (
            <Tooltip delay={0}>
              <Tooltip.Trigger className="@max-[400px]:basis-full">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 min-h-5 gap-1 px-1.5 py-0 text-[10px] text-muted hover:text-foreground"
                  aria-label={
                    updateLabel
                      ? env
                        ? t`Update to ${updateLabel} for ${props.agentLabel} (${env})`
                        : t`Update to ${updateLabel} for ${props.agentLabel}`
                      : env
                        ? t`Update ${props.agentLabel} (${env})`
                        : t`Update ${props.agentLabel}`
                  }
                  onPress={runUpdate}
                >
                  <ArrowUpCircle className="size-3" />
                  {updateLabel ? <Trans>Update to {updateLabel}</Trans> : <Trans>Update</Trans>}
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Content placement="right" className="max-w-[440px]">
                {previewCommandLine ? (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] text-muted">
                      <Trans>Will run in {env || t`this environment`}:</Trans>
                    </span>
                    <code className="font-mono text-[11px]">{previewCommandLine}</code>
                  </div>
                ) : updateLabel ? (
                  <span className="text-[11px]">
                    <Trans>
                      Update {props.agentLabel} to {updateLabel}
                    </Trans>
                  </span>
                ) : (
                  <span className="text-[11px]">
                    <Trans>Bring every {props.agentLabel} runtime up to date</Trans>
                  </span>
                )}
              </Tooltip.Content>
            </Tooltip>
          ) : null}
          {isMissing && (
            <span className="text-warning flex items-center gap-1.5 whitespace-nowrap text-[11px] font-normal">
              <AlertTriangle className="size-3" />
              <Trans>Login required</Trans>
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {props.authPending ? (
            <div
              className="flex h-6 w-6 items-center justify-center"
              role="status"
              aria-label={pendingLabel}
            >
              <PixelLoader size="xs" />
            </div>
          ) : (
            <>
              {canLogin && hasMultipleMethods
                ? authMethods.map((method) => (
                    <Button
                      key={method.id}
                      size="sm"
                      variant="tertiary"
                      className="h-6 min-h-6 px-2 py-0 text-[10px] text-muted hover:text-foreground"
                      aria-label={
                        env
                          ? t`${loginLabel} ${method.name} ${env}`
                          : t`${loginLabel} ${method.name}`
                      }
                      onPress={() => props.onLogin(method)}
                    >
                      {method.name}
                    </Button>
                  ))
                : null}
              {canLogin && !hasMultipleMethods && singleMethod ? (
                <Button
                  size="sm"
                  variant="tertiary"
                  className="h-6 min-h-6 px-2 py-0 text-[10px] text-muted hover:text-foreground"
                  aria-label={env ? t`${loginLabel} ${env}` : loginLabel}
                  onPress={() => props.onLogin(singleMethod)}
                >
                  {loginLabel}
                </Button>
              ) : null}
              {canLogout ? (
                <Button
                  size="sm"
                  variant="tertiary"
                  className="h-6 min-h-6 px-2 py-0 text-[10px] text-muted hover:text-foreground"
                  aria-label={env ? t`Logout ${env}` : t`Logout`}
                  onPress={props.onLogout}
                >
                  <Trans>Logout</Trans>
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col min-w-0 h-4 justify-center">
        {props.pendingMessage ? (
          <span className="min-w-0 truncate text-[11px] font-normal text-muted/60 italic">
            {props.pendingMessage}
          </span>
        ) : metadataSummary ? (
          <span className="min-w-0 truncate text-[11px] font-normal text-muted/60 group-hover/env:text-muted/80 transition-colors">
            {metadataSummary}
          </span>
        ) : description ? (
          <p className="text-[10px] text-muted/50 truncate">{description}</p>
        ) : null}
      </div>
    </div>
  );
}
