import { useEffect, useState } from "react";
import { toast } from "@heroui/react";
import { Download } from "lucide-react";
import type { AgentStatus } from "@/shared/contracts";
import {
  formatUpdateCommandLine,
  isNewerVersion,
  resolveSharedUpdateCommand,
} from "@/shared/agents/updateResolver";
import { readBridge } from "@/renderer/bridge";
import { Button, PixelLoader } from "@/renderer/components/common";
import {
  acpGenericInstanceId,
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
 * and vice versa.
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
  onUpdatingChange?: (updating: boolean) => void;
}) {
  const { agentStatus, onUpdatingChange } = props;
  const [latestVersion, setLatestVersion] = useState<
    { agentKind: string; version: string | undefined } | undefined
  >(undefined);
  const [pending, setPending] = useState(false);

  const isSshStatus = agentStatus.envKind === "ssh";
  const registryAgentId = acpGenericInstanceId(agentStatus.kind);

  useEffect(() => {
    if (isSshStatus) return;
    if (registryAgentId) return;
    if (!agentStatus.installed || !agentStatus.version) return;
    let cancelled = false;
    const kind = agentStatus.kind;
    readBridge()
      .getLatestAgentVersion({ agentKind: kind })
      .then((result) => {
        if (cancelled) return;
        setLatestVersion({ agentKind: kind, version: result.version });
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
  }, [agentStatus.kind, agentStatus.installed, agentStatus.version, isSshStatus, registryAgentId]);

  // Identity-gated read so a stale entry from a previous agent never matches
  // the current one (avoids one-frame flash on agent switch).
  const resolvedLatest =
    latestVersion && latestVersion.agentKind === agentStatus.kind
      ? latestVersion.version
      : undefined;

  const installedVersion = agentStatus.version;
  const isOutdated =
    registryAgentId === undefined &&
    agentStatus.installed &&
    resolvedLatest !== undefined &&
    installedVersion !== undefined &&
    isNewerVersion(resolvedLatest, installedVersion);

  if (isSshStatus || !isOutdated || !resolvedLatest || !installedVersion) {
    return null;
  }

  const scope = statusUpdateScope(agentStatus);
  if (scope.envKind === "ssh") {
    return null;
  }
  const updateEnvKind = scope.envKind;
  const previewCommand = resolveSharedUpdateCommand({
    update: agentStatus.update,
    executablePath: agentStatus.executablePath,
    envKind: updateEnvKind,
  });
  const previewCommandLine = previewCommand ? formatUpdateCommandLine(previewCommand) : undefined;

  const envLabel = envLabelForStatus(agentStatus);

  async function handleUpdate() {
    if (pending) return;
    setPending(true);
    onUpdatingChange?.(true);
    try {
      const result = await readBridge().updateAgentBinary({
        agentKind: agentStatus.kind,
        envKind: updateEnvKind,
        ...(scope.wslDistro ? { wslDistro: scope.wslDistro } : {}),
      });
      if (result.ok) {
        toast.success(`${agentStatus.label} updated to v${resolvedLatest}.`);
        await readBridge().refreshAgentStatuses(currentWslDistros(), {
          agentKinds: [agentStatus.kind],
          envs: [scopeEnvForStatus(agentStatus)],
        });
      } else {
        const detail = result.output?.trim();
        toast.danger(
          detail
            ? `Unable to update ${agentStatus.label}: ${detail.slice(0, 240)}`
            : `Unable to update ${agentStatus.label}.`,
        );
      }
    } catch (error) {
      toast.danger(
        error instanceof Error ? error.message : `Unable to update ${agentStatus.label}.`,
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
    <ThreadDockSection placement="composer" collapsed={false} ariaLabel="Agent update available">
      <ThreadDockHeader
        icon={Download}
        iconClassName="text-foreground"
        title="Update available"
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
              Update
            </Button>
          </div>
        }
      >
        <span className="min-w-0 flex-1 truncate leading-5 text-[color:var(--muted)]">
          {agentStatus.label}: {description}
        </span>
      </ThreadDockHeader>
    </ThreadDockSection>
  );
}
