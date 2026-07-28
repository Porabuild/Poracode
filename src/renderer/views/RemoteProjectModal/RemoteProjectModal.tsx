import { useEffect, useState } from "react";
import { Button, Modal } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Loader2, Play, Server } from "lucide-react";
import type { AgentStatus, ThreadPresentationMode } from "@/shared/contracts";
import { agentStatusForPresentation } from "@/shared/agentSelection";
import { useAsyncOperation } from "@/renderer/hooks/useAsyncOperation";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import {
  buildRemoteThreadConfig,
  remoteProjectAgentStatuses,
  remoteProjectPresentationModes,
  resolveRemoteProjectPresentationMode,
} from "./remoteProjectSelection";

const FIELD_CLASS =
  "w-full rounded-lg border border-default-200 bg-default-50 px-2.5 py-1.5 text-sm text-foreground outline-none transition-colors focus:border-default-400";

function availableEfforts(agent: AgentStatus | undefined, model: string): string[] {
  if (!agent) return [];
  return agent.capabilities.modelEfforts[model] ?? agent.capabilities.efforts;
}

function resolveEffort(agent: AgentStatus | undefined, model: string, preferred: string): string {
  const efforts = availableEfforts(agent, model);
  if (efforts.includes(preferred)) return preferred;
  const defaultEffort = agent?.capabilities.defaultEffort;
  return defaultEffort && efforts.includes(defaultEffort) ? defaultEffort : (efforts[0] ?? "");
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
    ? remoteProjectAgentStatuses(serverRuntime?.agentStatuses, project.location)
    : [];
  const [agentKind, setAgentKind] = useState("");
  const selectedBaseAgent = agents.find((agent) => agent.kind === agentKind) ?? agents[0];
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const [presentationMode, setPresentationMode] = useState<ThreadPresentationMode>("gui");
  const [prompt, setPrompt] = useState("");
  const activePresentationMode = resolveRemoteProjectPresentationMode(
    selectedBaseAgent,
    presentationMode,
  );
  const selectedAgent = selectedBaseAgent
    ? agentStatusForPresentation(selectedBaseAgent, activePresentationMode)
    : undefined;
  const selectedModel =
    selectedAgent?.capabilities.models.some((option) => option.id === model) === true
      ? model
      : (selectedAgent?.capabilities.models[0]?.id ?? "");
  const efforts = availableEfforts(selectedAgent, selectedModel);
  const selectedEffort = resolveEffort(selectedAgent, selectedModel, effort);

  useEffect(() => {
    if (!selectedBaseAgent) {
      setAgentKind("");
      return;
    }
    if (agentKind !== selectedBaseAgent.kind) setAgentKind(selectedBaseAgent.kind);
    if (presentationMode !== activePresentationMode) {
      setPresentationMode(activePresentationMode);
    }
  }, [activePresentationMode, agentKind, presentationMode, selectedBaseAgent]);

  useEffect(() => {
    if (model !== selectedModel) setModel(selectedModel);
  }, [model, selectedModel]);

  useEffect(() => {
    if (effort !== selectedEffort) setEffort(selectedEffort);
  }, [effort, selectedEffort]);

  const start = () => {
    if (!draft || !selectedAgent || !selectedModel || !prompt.trim()) return;
    run(() =>
      startRemoteThread({
        desktopId: draft.desktopId,
        projectId: draft.projectId,
        agentKind: selectedAgent.kind,
        config: buildRemoteThreadConfig(selectedAgent, selectedModel, selectedEffort),
        prompt: prompt.trim(),
        presentationMode: activePresentationMode,
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
                    {agents.map((agent) => {
                      const optionMode = resolveRemoteProjectPresentationMode(
                        agent,
                        presentationMode,
                      );
                      const optionStatus = agentStatusForPresentation(agent, optionMode);
                      return (
                        <option key={agent.kind} value={agent.kind}>
                          {agent.label}
                          {optionStatus.authState === "missing" ? ` — ${t`sign-in required`}` : ""}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  <Trans>Model</Trans>
                  <select
                    className={FIELD_CLASS}
                    value={selectedModel}
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
                      value={selectedEffort}
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
                {remoteProjectPresentationModes(selectedBaseAgent).length > 1 ? (
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    <Trans>Presentation</Trans>
                    <select
                      className={FIELD_CLASS}
                      value={activePresentationMode}
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
              isDisabled={busy || !selectedAgent || !selectedModel || !prompt.trim()}
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
