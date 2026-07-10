import { useEffect, useState } from "react";
import { Button, Modal } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Loader2, Play, Server } from "lucide-react";
import type { AgentStatus, ThreadPresentationMode } from "@/shared/contracts";
import type { RemoteAgentStatuses } from "@/shared/remote";
import { useAsyncOperation } from "@/renderer/hooks/useAsyncOperation";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";

const FIELD_CLASS =
  "w-full rounded-lg border border-default-200 bg-default-50 px-2.5 py-1.5 text-sm text-foreground outline-none transition-colors focus:border-default-400";

function statusesForProject(
  statuses: RemoteAgentStatuses | undefined,
  locationKind: "windows" | "wsl" | "posix",
): AgentStatus[] {
  if (!statuses) return [];
  const source = locationKind === "wsl" ? statuses.wsl : statuses.windows;
  return source.filter((status) => status.installed && status.capabilities.models.length > 0);
}

function availableEfforts(agent: AgentStatus | undefined, model: string): string[] {
  if (!agent) return [];
  return agent.capabilities.modelEfforts[model] ?? agent.capabilities.efforts;
}

function presentationModesFor(agent: AgentStatus | undefined): ThreadPresentationMode[] {
  if (!agent) return [];
  return agent.capabilities.presentationModes ?? [agent.capabilities.presentationMode];
}

export function RemoteProjectModal() {
  const { t } = useLingui();
  const draft = useRemoteServersStore((state) => state.remoteProjectDraft);
  const servers = useRemoteServersStore((state) => state.servers);
  const runtime = useRemoteServersStore((state) => state.runtime);
  const close = useRemoteServersStore((state) => state.closeRemoteProject);
  const startRemoteThread = useRemoteServersStore((state) => state.startRemoteThread);
  const { busy, error, run } = useAsyncOperation();

  const server = draft ? servers.find((entry) => entry.desktopId === draft.desktopId) : undefined;
  const serverRuntime = draft ? runtime[draft.desktopId] : undefined;
  const project = draft
    ? serverRuntime?.projects.find((entry) => entry.id === draft.projectId)
    : undefined;
  const agents = project
    ? statusesForProject(serverRuntime?.agentStatuses, project.location.kind)
    : [];
  const [agentKind, setAgentKind] = useState("");
  const selectedAgent = agents.find((agent) => agent.kind === agentKind) ?? agents[0];
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const [presentationMode, setPresentationMode] = useState<ThreadPresentationMode>("gui");
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    if (!selectedAgent) {
      setAgentKind("");
      setModel("");
      return;
    }
    if (agentKind !== selectedAgent.kind) setAgentKind(selectedAgent.kind);
    const nextModel = selectedAgent.capabilities.models[0]?.id ?? "";
    if (!selectedAgent.capabilities.models.some((option) => option.id === model)) {
      setModel(nextModel);
    }
    const modes = presentationModesFor(selectedAgent);
    if (!modes.includes(presentationMode)) setPresentationMode(modes[0] ?? "terminal");
  }, [agentKind, model, presentationMode, selectedAgent]);

  const efforts = availableEfforts(selectedAgent, model);
  useEffect(() => {
    const nextEfforts = availableEfforts(selectedAgent, model);
    if (nextEfforts.length === 0) {
      setEffort("");
      return;
    }
    if (!nextEfforts.includes(effort)) {
      setEffort(selectedAgent?.capabilities.defaultEffort ?? nextEfforts[0] ?? "");
    }
  }, [effort, model, selectedAgent]);

  const start = () => {
    if (!draft || !selectedAgent || !model || !prompt.trim()) return;
    run(() =>
      startRemoteThread({
        desktopId: draft.desktopId,
        projectId: draft.projectId,
        agentKind: selectedAgent.kind,
        config: {
          model,
          ...(effort ? { effort } : {}),
          ...(selectedAgent.capabilities.defaultApprovalPolicy
            ? { approvalPolicy: selectedAgent.capabilities.defaultApprovalPolicy }
            : {}),
          ...(selectedAgent.capabilities.defaultSandboxMode
            ? { sandboxMode: selectedAgent.capabilities.defaultSandboxMode }
            : {}),
        },
        prompt: prompt.trim(),
        presentationMode,
      }),
    );
  };

  return (
    <Modal.Backdrop isOpen={draft !== null} onOpenChange={(open) => !open && !busy && close()}>
      <Modal.Container size="md">
        <Modal.Dialog className="sm:max-w-[600px]">
          <Modal.CloseTrigger isDisabled={busy} />
          <Modal.Header>
            <Modal.Icon className="bg-default text-foreground">
              <Server className="size-5" />
            </Modal.Icon>
            <Modal.Heading>{project?.name ?? t`Remote project`}</Modal.Heading>
            <p className="text-sm text-muted">
              {server
                ? t`Run a new thread on ${server.label}.`
                : t`Remote environment unavailable.`}
            </p>
          </Modal.Header>
          <Modal.Body className="gap-3">
            {!project ? (
              <p className="text-sm text-danger">
                <Trans>
                  This remote project is unavailable. Reconnect the environment and try again.
                </Trans>
              </p>
            ) : agents.length === 0 ? (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
                <Trans>
                  No supported agents are installed on this remote machine. Install and sign in to
                  an agent remotely before starting a thread.
                </Trans>
              </div>
            ) : (
              <>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  <Trans>Agent</Trans>
                  <select
                    className={FIELD_CLASS}
                    value={selectedAgent?.kind ?? ""}
                    onChange={(event) => setAgentKind(event.currentTarget.value)}
                  >
                    {agents.map((agent) => (
                      <option key={agent.kind} value={agent.kind}>
                        {agent.label}
                        {agent.authState === "missing" ? ` — ${t`sign-in required`}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  <Trans>Model</Trans>
                  <select
                    className={FIELD_CLASS}
                    value={model}
                    onChange={(event) => setModel(event.currentTarget.value)}
                  >
                    {selectedAgent?.capabilities.models.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {efforts.length > 0 ? (
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    <Trans>Effort</Trans>
                    <select
                      className={FIELD_CLASS}
                      value={effort}
                      onChange={(event) => setEffort(event.currentTarget.value)}
                    >
                      {efforts.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {presentationModesFor(selectedAgent).length > 1 ? (
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    <Trans>Presentation</Trans>
                    <select
                      className={FIELD_CLASS}
                      value={presentationMode}
                      onChange={(event) =>
                        setPresentationMode(event.currentTarget.value as ThreadPresentationMode)
                      }
                    >
                      <option value="gui">{t`Chat`}</option>
                      <option value="terminal">{t`Terminal`}</option>
                    </select>
                  </label>
                ) : null}
                <textarea
                  className={`${FIELD_CLASS} min-h-32 resize-y`}
                  value={prompt}
                  aria-label={t`Prompt`}
                  placeholder={t`What should the remote agent work on?`}
                  onChange={(event) => setPrompt(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault();
                      start();
                    }
                  }}
                />
              </>
            )}
            {error ? <p className="text-sm whitespace-pre-wrap text-danger">{error}</p> : null}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="tertiary" isDisabled={busy} onPress={close}>
              <Trans>Cancel</Trans>
            </Button>
            <Button
              variant="primary"
              isDisabled={busy || !selectedAgent || !model || !prompt.trim()}
              onPress={start}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              {busy ? <Trans>Starting remotely…</Trans> : <Trans>Start remote thread</Trans>}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
