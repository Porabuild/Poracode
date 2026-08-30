import { useState } from "react";
import { toast } from "@heroui/react";
import { KeyRound, LogIn, RefreshCw, Settings } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { AgentStatus, Project } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { runAgentLoginCommand } from "@/renderer/actions/agentLoginActions";
import { openSettings } from "@/renderer/actions/panelActions";
import { Button } from "@/renderer/components/common/Button";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import {
  agentAuthTarget,
  currentWslDistros,
  findAgentAuthMethodForStatus,
  findTerminalAuthMethodForStatus,
  scopeEnvForStatus,
  shouldPreferTerminalLogin,
} from "@/renderer/utils/acpRegistryAuth";
import { ThreadDockHeader, ThreadDockIconButton, ThreadDockSection } from "./ThreadDockUI";

async function refreshAgentStatus(status: AgentStatus, project?: Project): Promise<void> {
  if (project?.remoteServerId) {
    await useRemoteServersStore.getState().refreshServer(project.remoteServerId);
    return;
  }
  await readBridge().refreshAgentStatuses(currentWslDistros(), {
    agentKinds: [status.kind],
    envs: [scopeEnvForStatus(status)],
  });
}

/**
 * Keep focus on whatever the user had focused before they mouse-clicked the
 * dock's action button. Without this, clicking the button takes focus, the
 * `isDisabled` swap during the in-flight action then releases focus, and
 * react-aria restores focus to the composer for one frame before the dock
 * finally unmounts — producing a visible border blink on the composer.
 */
function preventFocusSteal(event: React.MouseEvent<HTMLElement>): void {
  event.preventDefault();
}

export function ThreadAuthRequiredDock(props: {
  agentStatus: AgentStatus;
  project?: Project;
  multilineDescription?: boolean;
}) {
  const { agentStatus, project } = props;
  const { t } = useLingui();
  const isRemote = isRemoteSession();
  const [pendingAction, setPendingAction] = useState<"login" | "refresh" | undefined>();
  const agentAuthMethod = findAgentAuthMethodForStatus(agentStatus);
  const terminalAuthMethod = findTerminalAuthMethodForStatus(agentStatus);
  const canUseAgentAuth = agentAuthMethod !== undefined;
  const canUseTerminalLogin = Boolean(agentStatus.loginCommand);
  const hasDirectLogin = canUseAgentAuth || canUseTerminalLogin;
  const preferTerminalLogin = shouldPreferTerminalLogin(agentStatus);
  const useTerminalLogin = canUseTerminalLogin && (preferTerminalLogin || !canUseAgentAuth);
  const description = isRemote
    ? t`Sign in on the paired desktop, then refresh this status.`
    : useTerminalLogin
      ? t`Run ${agentStatus.loginCommand} before this thread can run.`
      : agentAuthMethod
        ? t`Complete ${agentAuthMethod.name} sign-in before this thread can run.`
        : t`Add credentials before this thread can run.`;

  async function handleLogin() {
    if (pendingAction) return;

    if (useTerminalLogin && agentStatus.loginCommand) {
      setPendingAction("login");
      const opened = runAgentLoginCommand({
        label: agentStatus.label,
        command: agentStatus.loginCommand,
        ...(terminalAuthMethod?.env ? { env: terminalAuthMethod.env } : {}),
        ...(project ? { project } : {}),
        onCommandComplete: (exitCode) => {
          // Unlock the button as soon as the command exits so the user can
          // retry without waiting for the (post-exit) status refresh.
          setPendingAction(undefined);
          void refreshAgentStatus(agentStatus, project)
            .then(() => {
              if (exitCode === 0) toast.success(t`${agentStatus.label} authenticated.`);
            })
            .catch((error: unknown) => {
              toast.danger(
                error instanceof Error
                  ? error.message
                  : t`Unable to refresh ${agentStatus.label} status.`,
              );
            });
        },
      });
      if (!opened) setPendingAction(undefined);
      return;
    }

    if (canUseAgentAuth) {
      setPendingAction("login");
      try {
        await readBridge().authenticateAcpAgent({
          agentKind: agentStatus.kind,
          methodId: agentAuthMethod.id,
          ...agentAuthTarget(agentStatus),
        });
        void readBridge().focusWindow();
        await refreshAgentStatus(agentStatus, project);
        toast.success(t`${agentStatus.label} authenticated.`);
      } catch (error) {
        toast.danger(
          error instanceof Error
            ? friendlyError(error)
            : t`Unable to authenticate ${agentStatus.label}.`,
        );
      } finally {
        setPendingAction(undefined);
      }
      return;
    }
  }

  async function handleRefresh() {
    if (pendingAction) return;
    setPendingAction("refresh");
    try {
      await refreshAgentStatus(agentStatus, project);
    } catch (error) {
      toast.danger(
        error instanceof Error ? error.message : t`Unable to refresh ${agentStatus.label}.`,
      );
    } finally {
      setPendingAction(undefined);
    }
  }

  return (
    <ThreadDockSection
      placement="composer"
      collapsed={false}
      ariaLabel={t`Authentication required`}
    >
      <ThreadDockHeader
        icon={KeyRound}
        iconClassName="text-warning"
        title={t`Sign in required`}
        {...(props.multilineDescription ? { stackedContent: true } : {})}
        actions={
          <div className="flex shrink-0 items-center gap-1">
            {!isRemote && hasDirectLogin ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 min-w-0 px-2 text-xs text-foreground"
                isDisabled={pendingAction !== undefined}
                isPending={pendingAction === "login"}
                onMouseDown={preventFocusSteal}
                onPress={() => void handleLogin()}
              >
                <LogIn className="size-3.5" />
                <Trans>Login</Trans>
              </Button>
            ) : !isRemote ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 min-w-0 px-2 text-xs text-foreground"
                onMouseDown={preventFocusSteal}
                onPress={openSettings}
              >
                <Settings className="size-3.5" />
                <Trans>Settings</Trans>
              </Button>
            ) : null}
            <ThreadDockIconButton
              label={t`Refresh ${agentStatus.label} authentication`}
              isDisabled={pendingAction !== undefined}
              isPending={pendingAction === "refresh"}
              onMouseDown={preventFocusSteal}
              onPress={() => void handleRefresh()}
            >
              <RefreshCw className="size-3.5" />
            </ThreadDockIconButton>
          </div>
        }
      >
        <span
          className={`min-w-0 flex-1 leading-5 text-[color:var(--muted)] ${
            props.multilineDescription ? "line-clamp-2 whitespace-normal" : "truncate"
          }`}
        >
          {agentStatus.label}: {description}
        </span>
      </ThreadDockHeader>
    </ThreadDockSection>
  );
}
