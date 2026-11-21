import { useRef, useState } from "react";
import { toast } from "@heroui/react";
import { Download } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { AgentStatus, Project } from "@/shared/contracts";
import type { ComposerRuntimeRequirement } from "../providers/composerRuntimeRequirement";
import { agentManagementHostForConnection } from "../providers/settings/agentManagementHost";
import { Button } from "../common/Button";
import { PixelLoader } from "../common/PixelLoader";
import { scopeEnvForStatus } from "@/renderer/utils/acpRegistryAuth";
import { ThreadDockHeader, ThreadDockSection } from "./ThreadDockUI";

export function ThreadRuntimeInstallDock(props: {
  requirement: ComposerRuntimeRequirement;
  agentStatus: AgentStatus;
  project: Project;
}) {
  const { t } = useLingui();
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const { requirement, agentStatus, project } = props;

  async function install() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    const host = agentManagementHostForConnection(
      project.remoteServerId ?? project.location.remoteServerId,
    );
    const target = scopeEnvForStatus(agentStatus);
    try {
      const result = await host.installAcpRegistryAgent({
        agentId: requirement.registryAgentId,
        target,
      });
      host.recordRegistryInstalls(result.installed, [requirement.registryAgentId]);
      await host.rediscoverAgents(target.kind === "wsl" ? [target.distro] : [], {
        agentKinds: [agentStatus.kind],
        envs: [target],
      });
    } catch (error) {
      toast.danger(
        error instanceof Error ? error.message : t`Unable to install ${agentStatus.label}.`,
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <ThreadDockSection placement="composer" collapsed={false} ariaLabel={t`Not installed`}>
      <ThreadDockHeader
        icon={Download}
        iconClassName="text-warning"
        title={t`Not installed`}
        actions={
          <Button
            size="sm"
            variant="ghost"
            className="h-6 min-w-0 px-2 text-xs text-foreground"
            isDisabled={pending}
            isPending={pending}
            onPress={() => void install()}
          >
            {pending ? <PixelLoader size="xs" /> : <Download className="size-3.5" />}
            {t(requirement.installLabel)}
          </Button>
        }
      >
        <span
          className="min-w-0 flex-1 truncate leading-5 text-[color:var(--muted)]"
          title={t(requirement.description)}
        >
          {t(requirement.description)}
        </span>
      </ThreadDockHeader>
    </ThreadDockSection>
  );
}
