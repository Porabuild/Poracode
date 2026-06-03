import { useState } from "react";
import { toast } from "@heroui/react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  LogIn,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { useShallow } from "zustand/shallow";
import type { AgentStatus, ProjectLocation, RefreshAgentScope } from "@/shared/contracts";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import { readBridge } from "@/renderer/bridge";
import { runAgentLoginCommand } from "@/renderer/actions/agentLoginActions";
import { Button, PixelLoader } from "@/renderer/components/common";
import { getRegisteredProviders, ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import {
  isDetectingAgentsForLocation,
  useAgentStatusesStore,
} from "@/renderer/state/agentStatusesStore";
import { useProject } from "@/renderer/state/useThread";
import { findTerminalAuthMethodForStatus } from "@/renderer/utils/acpRegistryAuth";

type SshLocation = Extract<ProjectLocation, { kind: "ssh" }>;

function statusRank(status: AgentStatus): number {
  if (!status.installed) return 2;
  return status.authState === "missing" ? 0 : 1;
}

function statusBadge(status: AgentStatus): {
  label: string;
  className: string;
  icon: LucideIcon;
} {
  if (!status.installed) {
    return {
      label: "Not found",
      className: "border-border text-muted",
      icon: CircleDashed,
    };
  }
  if (status.authState === "missing") {
    return {
      label: "Sign in needed",
      className: "border-warning/40 text-warning",
      icon: AlertTriangle,
    };
  }
  return {
    label: "Ready",
    className: "border-success/40 text-success",
    icon: CheckCircle2,
  };
}

function statusDetail(status: AgentStatus): string {
  const parts: string[] = [];
  if (status.version) parts.push(`v${status.version}`);
  const modelCount = status.capabilities.models.length;
  if (modelCount > 0) parts.push(`${modelCount} model${modelCount === 1 ? "" : "s"}`);
  if (status.providerMetadata?.authenticatedAs) {
    parts.push(status.providerMetadata.authenticatedAs);
  }
  if (parts.length > 0) return parts.join(" - ");
  return status.installed ? "Detected on remote host" : "CLI not found on remote host";
}

function refreshScope(location: SshLocation, agentKinds: string[]): RefreshAgentScope {
  return {
    agentKinds,
    envs: [{ kind: "ssh", host: location.host, path: location.path }],
  };
}

export function AgentsSection(props: { projectId: string }) {
  const project = useProject(props.projectId);
  const statuses = useAgentStatusesStore(
    useShallow((s) =>
      project
        ? getProjectAgentStatuses(
            project.location,
            s.agentStatuses,
            s.wslAgentStatuses,
            s.sshAgentStatuses,
          )
        : [],
    ),
  );
  const isDetecting = useAgentStatusesStore((s) =>
    project ? isDetectingAgentsForLocation(s, project.location) : false,
  );
  const [pendingRefreshKey, setPendingRefreshKey] = useState<string | undefined>();
  const [pendingLoginKind, setPendingLoginKind] = useState<string | undefined>();

  if (!project || project.location.kind !== "ssh") return null;

  const sshProject = project;
  const location = project.location;
  const registeredKinds = getRegisteredProviders().map((provider) => provider.kind);
  const allAgentKinds = [
    ...new Set([...registeredKinds, ...statuses.map((status) => status.kind)]),
  ];
  const sortedStatuses = [...statuses].sort((left, right) => {
    const rank = statusRank(left) - statusRank(right);
    if (rank !== 0) return rank;
    return left.label.localeCompare(right.label);
  });

  async function refreshAgents(agentKinds = allAgentKinds): Promise<void> {
    if (agentKinds.length === 0) return;
    const key = agentKinds.length === 1 ? agentKinds[0]! : "all";
    setPendingRefreshKey(key);
    try {
      await readBridge().refreshAgentStatuses([], refreshScope(location, agentKinds), [location]);
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : "Unable to refresh SSH agents.");
    } finally {
      setPendingRefreshKey(undefined);
    }
  }

  function runLogin(status: AgentStatus): void {
    if (!status.loginCommand) return;
    const terminalMethod = findTerminalAuthMethodForStatus(status);
    setPendingLoginKind(status.kind);
    const opened = runAgentLoginCommand({
      label: status.label,
      command: status.loginCommand,
      ...(terminalMethod?.env ? { env: terminalMethod.env } : {}),
      project: sshProject,
      onCommandComplete: (exitCode) => {
        setPendingLoginKind(undefined);
        void refreshAgents([status.kind]).then(() => {
          if (exitCode === 0) toast.success(`${status.label} authenticated.`);
        });
      },
    });
    if (!opened) setPendingLoginKind(undefined);
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto px-6 pb-8 pt-4">
      <div className="mx-auto max-w-[720px]">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-foreground">Agents</h1>
            <p className="mt-1 truncate text-xs text-muted">
              {location.host}:{location.path}
            </p>
          </div>
          <Button
            size="sm"
            variant="tertiary"
            isPending={pendingRefreshKey === "all"}
            onPress={() => void refreshAgents()}
          >
            {({ isPending }) => (
              <>
                {isPending ? <PixelLoader size="xs" /> : <RefreshCw className="size-4" />}
                Refresh
              </>
            )}
          </Button>
        </div>

        {sortedStatuses.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-secondary px-3 py-3 text-sm text-muted">
            {isDetecting ? <PixelLoader size="xs" /> : <CircleDashed className="size-4" />}
            {isDetecting ? "Detecting agents..." : "No SSH agent statuses yet."}
          </div>
        ) : (
          <div className="space-y-2">
            {sortedStatuses.map((status) => {
              const badge = statusBadge(status);
              const BadgeIcon = badge.icon;
              const canLogin = status.authState === "missing" && Boolean(status.loginCommand);
              const refreshKey = status.kind;
              return (
                <div
                  key={`${status.kind}-${status.envHost ?? location.host}`}
                  className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface-secondary px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <ProviderIcon
                      kind={status.kind}
                      {...(status.icon ? { icon: status.icon } : {})}
                      fallbackLabel={status.label}
                      tone={status.installed ? "active" : "inactive"}
                      className="size-7 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{status.label}</p>
                      <p className="truncate text-xs text-muted">{statusDetail(status)}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`inline-flex h-7 items-center gap-1 rounded border px-2 text-xs ${badge.className}`}
                    >
                      <BadgeIcon className="size-3.5" />
                      {badge.label}
                    </span>
                    {canLogin ? (
                      <Button
                        size="sm"
                        variant="tertiary"
                        isPending={pendingLoginKind === status.kind}
                        onPress={() => runLogin(status)}
                      >
                        {({ isPending }) => (
                          <>
                            {isPending ? <PixelLoader size="xs" /> : <LogIn className="size-4" />}
                            Login
                          </>
                        )}
                      </Button>
                    ) : null}
                    <Button
                      isIconOnly
                      aria-label={`Refresh ${status.label}`}
                      size="sm"
                      variant="tertiary"
                      isPending={pendingRefreshKey === refreshKey}
                      onPress={() => void refreshAgents([status.kind])}
                    >
                      {({ isPending }) =>
                        isPending ? <PixelLoader size="xs" /> : <RefreshCw className="size-4" />
                      }
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
