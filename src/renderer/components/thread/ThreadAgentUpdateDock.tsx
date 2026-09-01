import { useEffect, useState } from "react";
import { toast } from "@heroui/react";
import { Download } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { extractAcpGenericInstanceId, type AgentStatus, type Project } from "@/shared/contracts";
import {
  formatUpdateCommandLine,
  isNewerVersion,
  resolveSharedUpdateCommand,
} from "@/shared/agents/updateResolver";
import { readBridge } from "@/renderer/bridge";
import { runAgentInstallCommand } from "@/renderer/actions/agentLoginActions";
import { Button } from "@/renderer/components/common/Button";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { getComposerRuntimeUpdate } from "@/renderer/components/providers/providerComposer";
import { CombinedRuntimeVersionList } from "@/renderer/components/providers/CombinedRuntimeVersionList";
import { useCombinedProviderRuntimeUpdates } from "@/renderer/components/providers/useCombinedProviderRuntimeUpdates";
import {
  currentWslDistros,
  envLabelForStatus,
  scopeEnvForStatus,
  statusUpdateScope,
} from "@/renderer/utils/acpRegistryAuth";
import { ThreadDockHeader, ThreadDockSection } from "./ThreadDockUI";

/**
 * Composer-placed status row that surfaces "{agent} v0.130.0 → v0.130.5 is
 * available" with an inline Update button. Reads the *project-scoped* status
 * (Windows for Windows projects, the matching WSL distro for WSL projects), so
 * a draft against a WSL project never offers to update the Windows binary —
 * and vice versa. Providers with independently versioned composer runtimes can
 * register runtime-specific or combined-runtime probes and update commands;
 * otherwise this uses the provider binary metadata on `AgentStatus`.
 *
 * Mirrors `ThreadAuthRequiredDock` in pattern. Hidden when:
 *   - The agent is not installed in the project's env.
 *   - The kind has no npm package mapping (no way to probe latest).
 *   - The npm registry probe hasn't returned a version yet (no flicker).
 *   - The installed version is equal-or-newer than the latest published one.
 *   - The agent is an ACP-registry instance (those route through the registry
 *     update flow in the settings overlay, not this dock).
 */
export function ThreadAgentUpdateDock(props: {
  agentStatus: AgentStatus;
  project: Project;
  onUpdatingChange?: (updating: boolean) => void;
}) {
  const { agentStatus, project, onUpdatingChange } = props;
  const { t } = useLingui();
  const [latestVersion, setLatestVersion] = useState<
    { updateKey: string; version: string | undefined } | undefined
  >(undefined);
  const [pending, setPending] = useState(false);
  const combinedUpdates = useCombinedProviderRuntimeUpdates([agentStatus]);
  const combinedEntry = combinedUpdates.entryFor(agentStatus);

  const registryAgentId = extractAcpGenericInstanceId(agentStatus.kind);
  const runtimeUpdate = getComposerRuntimeUpdate(agentStatus.kind)?.({ agentStatus, project });
  const updateKey = `${agentStatus.kind}:${runtimeUpdate?.label ?? "provider"}`;
  const installed = runtimeUpdate?.installed ?? agentStatus.installed;
  const installedVersion = runtimeUpdate?.installedVersion ?? agentStatus.version;
  const npmPackageName = runtimeUpdate?.npmPackage?.name;
  const npmPackageMinVersion = runtimeUpdate?.npmPackage?.minVersion;
  const npmPackageMaxExclusiveMajor = runtimeUpdate?.npmPackage?.maxExclusiveMajor;
  const runtimeUpdateHandled = runtimeUpdate !== undefined;

  useEffect(() => {
    if (combinedEntry.supported) return;
    if (registryAgentId) return;
    if (!installed || !installedVersion) return;
    if (runtimeUpdateHandled && !npmPackageName) return;
    let cancelled = false;
    const kind = agentStatus.kind;
    readBridge()
      .getLatestAgentVersion({
        agentKind: kind,
        ...(npmPackageName
          ? {
              npmPackage: {
                name: npmPackageName,
                ...(npmPackageMinVersion ? { minVersion: npmPackageMinVersion } : {}),
                ...(npmPackageMaxExclusiveMajor
                  ? { maxExclusiveMajor: npmPackageMaxExclusiveMajor }
                  : {}),
              },
            }
          : {}),
      })
      .then((result) => {
        if (cancelled) return;
        setLatestVersion({ updateKey, version: result.version });
      })
      .catch((error) => {
        console.warn(
          `[ThreadAgentUpdateDock] getLatestAgentVersion(${kind}) failed:`,
          error instanceof Error ? error.message : error,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [
    agentStatus.kind,
    combinedEntry.supported,
    installed,
    installedVersion,
    npmPackageMaxExclusiveMajor,
    npmPackageMinVersion,
    npmPackageName,
    registryAgentId,
    runtimeUpdateHandled,
    updateKey,
  ]);

  // Identity-gated read so a stale entry from a previous agent never matches
  // the current one (avoids one-frame flash on agent switch).
  const resolvedLatest =
    latestVersion && latestVersion.updateKey === updateKey ? latestVersion.version : undefined;

  const isOutdated =
    !combinedEntry.supported &&
    registryAgentId === undefined &&
    installed &&
    resolvedLatest !== undefined &&
    installedVersion !== undefined &&
    isNewerVersion(resolvedLatest, installedVersion);

  useEffect(() => {
    if (!combinedEntry.supported) {
      onUpdatingChange?.(false);
      return;
    }
    onUpdatingChange?.(combinedEntry.pending);
    return () => onUpdatingChange?.(false);
  }, [combinedEntry.pending, combinedEntry.supported, onUpdatingChange]);

  if (combinedEntry.supported) {
    if (!combinedEntry.updateAvailable) return null;
    return (
      <ThreadDockSection
        placement="composer"
        collapsed={false}
        ariaLabel={t`Agent update available`}
      >
        <ThreadDockHeader
          icon={Download}
          iconClassName="text-foreground"
          title={t`Update available`}
          actions={
            <Button
              size="sm"
              variant="ghost"
              className="h-6 min-w-0 px-2 text-xs text-foreground"
              isDisabled={combinedEntry.pending}
              isPending={combinedEntry.pending}
              onPress={() => void combinedUpdates.updateStatus(agentStatus)}
            >
              {combinedEntry.pending ? (
                <PixelLoader size="xs" />
              ) : (
                <Download className="size-3.5" />
              )}
              <Trans>Update</Trans>
            </Button>
          }
        />
        <CombinedRuntimeVersionList
          entry={combinedEntry}
          className="px-7 pb-1.5 text-[11px]"
          updatesOnly
        />
      </ThreadDockSection>
    );
  }

  if (!isOutdated || !resolvedLatest || !installedVersion) {
    return null;
  }

  const scope = statusUpdateScope(agentStatus);
  const previewCommand = runtimeUpdate
    ? undefined
    : resolveSharedUpdateCommand({
        update: agentStatus.update,
        executablePath: agentStatus.executablePath,
        envKind: scope.envKind,
      });
  const previewCommandLine = previewCommand ? formatUpdateCommandLine(previewCommand) : undefined;

  const envLabel = envLabelForStatus(agentStatus);
  const updateLabel = runtimeUpdate?.label ?? agentStatus.label;

  async function handleUpdate() {
    if (pending) return;
    setPending(true);
    onUpdatingChange?.(true);
    try {
      const runtimeCommand = runtimeUpdate?.command;
      if (runtimeCommand) {
        const exitCode = await new Promise<number>((resolve) => {
          const opened = runAgentInstallCommand({
            label: updateLabel,
            command: runtimeCommand,
            project,
            purpose: "update",
            onCommandComplete: resolve,
          });
          if (!opened) resolve(-1);
        });
        if (exitCode !== 0) return;
      } else {
        const result = await readBridge().updateAgentBinary({
          agentKind: agentStatus.kind,
          envKind: scope.envKind,
          ...(scope.wslDistro ? { wslDistro: scope.wslDistro } : {}),
        });
        if (!result.ok) {
          const detail = result.output?.trim();
          toast.danger(
            detail
              ? t`Unable to update ${agentStatus.label}: ${detail.slice(0, 240)}`
              : t`Unable to update ${agentStatus.label}.`,
          );
          return;
        }
      }
      toast.success(t`${agentStatus.label} updated to v${resolvedLatest}.`);
      await readBridge().refreshAgentStatuses(currentWslDistros(), {
        agentKinds: [agentStatus.kind],
        envs: [scopeEnvForStatus(agentStatus)],
      });
    } catch (error) {
      toast.danger(
        error instanceof Error ? error.message : t`Unable to update ${agentStatus.label}.`,
      );
    } finally {
      setPending(false);
      onUpdatingChange?.(false);
    }
  }

  const description = `${envLabel ? `${envLabel} · ` : ""}v${installedVersion} → v${resolvedLatest}${
    previewCommandLine ? ` · ${previewCommandLine}` : ""
  }`;

  return (
    <ThreadDockSection placement="composer" collapsed={false} ariaLabel={t`Agent update available`}>
      <ThreadDockHeader
        icon={Download}
        iconClassName="text-foreground"
        title={t`Update available`}
        actions={
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 min-w-0 px-2 text-xs text-foreground"
              isDisabled={pending}
              isPending={pending}
              onPress={() => void handleUpdate()}
            >
              {pending ? <PixelLoader size="xs" /> : <Download className="size-3.5" />}
              <Trans>Update</Trans>
            </Button>
          </div>
        }
      >
        <span className="min-w-0 flex-1 truncate leading-5 text-[color:var(--muted)]">
          {updateLabel}: {description}
        </span>
      </ThreadDockHeader>
    </ThreadDockSection>
  );
}
