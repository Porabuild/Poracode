import { useEffect, useState } from "react";
import { Modal, toast, Tooltip } from "@heroui/react";
import { GitFork, Info } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { formatBytes } from "@/shared/formatBytes";
import { friendlyError } from "@/shared/messages";
import type { ProviderDraftConfig, ThreadConfig } from "@/shared/contracts";
import { capabilitiesForPresentation, resolveModelSelection } from "@/shared/agentSelection";
import {
  canTransferThread,
  type ThreadTransferBlocker,
  transferableThreadConfig,
} from "@/shared/threadTransfer";
import {
  loadThreadTransferPreview,
  moveThreadToHost,
  transferCandidateMembers,
  transferTargetForMember,
  transferTargetOnline,
  type ThreadTransferPreview,
  type ThreadTransferProgress,
} from "@/renderer/actions/threadTransferActions";
import { resolveSavedProviderDraftConfig } from "./threadDraftViewHelpers";
import { Button, PixelLoader } from "@/renderer/components/common";
import { MachineIcon } from "@/renderer/components/common/MachineIcon";
import { useProjectEnvironmentMachineLookup } from "@/renderer/components/common/ProjectEnvironment";
import {
  ProjectSelectorIcon,
  useProjectRemoteServerLookup,
} from "@/renderer/components/common/ProjectRemoteServer";
import { ProjectEnvironmentMenu } from "./ProjectEnvironmentMenu";
import { MoveThreadAgentComposer, type MoveThreadAgentValue } from "./MoveThreadAgentComposer";
import { useHostAgentStatusPools } from "@/renderer/hooks/useHostAgentStatuses";
import { useAppStore } from "@/renderer/state/appStore";
import {
  getProjectGroupIndex,
  useProjectGroup,
} from "@/renderer/state/projectGroups/useProjectGroups";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useThreadTransferStore } from "@/renderer/state/threadTransferStore";
import { getThreadMap, useThread } from "@/renderer/state/useThread";

interface PreviewState {
  readonly memberId: string;
  readonly attempt: number;
  readonly preview?: ThreadTransferPreview;
  readonly error?: string;
}

/**
 * The opening `{ kind, config }` the move composer seeds from a loaded
 * preview. A ready source agent keeps the thread's own portable config with
 * its model re-validated against the target; otherwise the first ready agent
 * opens on its saved draft config, model validated the same way.
 */
function initialAgentSelection(
  preview: ThreadTransferPreview,
  thread: {
    readonly agentKind: string;
    readonly config: ThreadConfig;
  },
  providerConfigs: Record<string, ProviderDraftConfig>,
): MoveThreadAgentValue | undefined {
  const agents = preview.agents;
  if (agents.length === 0) return undefined;
  if (preview.sourceAgentReady) {
    const status = agents.find((agent) => agent.kind === thread.agentKind);
    if (!status) return undefined;
    const capabilities = capabilitiesForPresentation(status.capabilities, "gui");
    return {
      kind: thread.agentKind,
      config: {
        ...transferableThreadConfig(thread.config),
        model: resolveModelSelection(capabilities, thread.config.model),
      },
    };
  }
  const agent = agents[0];
  if (!agent) return undefined;
  const capabilities = capabilitiesForPresentation(agent.capabilities, "gui");
  const saved = resolveSavedProviderDraftConfig(agent.kind, undefined, providerConfigs);
  return {
    kind: agent.kind,
    config: { ...(saved ?? {}), model: resolveModelSelection(capabilities, saved?.model) },
  };
}

/** "Move to another machine": pick an environment of the same project, then hand the thread over. */
export function MoveThreadDialog({ sourceThreadId }: { sourceThreadId: string }) {
  const { t } = useLingui();
  const thread = useThread(sourceThreadId);
  const sourcePools = useHostAgentStatusPools(thread?.remoteServerId);
  const close = useThreadTransferStore((state) => state.close);
  const runtime = useRemoteServersStore((state) => state.runtime);
  const remoteServerFor = useProjectRemoteServerLookup();
  const environmentMachineFor = useProjectEnvironmentMachineLookup();
  const [pickedMemberId, setPickedMemberId] = useState<string>();
  const [previewState, setPreviewState] = useState<PreviewState | null>(null);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [agentSelection, setAgentSelection] = useState<MoveThreadAgentValue>();
  const [prompt, setPrompt] = useState("");
  const [progress, setProgress] = useState<ThreadTransferProgress | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [error, setError] = useState<string>();

  // Choosing a machine is choosing a member of the thread's logical project on
  // another host — the same rows the draft page's environment menu offers.
  const members = useProjectGroup(thread?.projectId)?.members ?? [];
  const candidates = thread ? transferCandidateMembers(thread, members) : [];
  const resolvedCandidates = candidates.flatMap((member) => {
    const resolved = transferTargetForMember(member);
    return resolved ? [{ member, ...resolved }] : [];
  });
  const candidateIds = new Set(candidates.map((member) => member.id));
  const targetEntry =
    resolvedCandidates.find((entry) => entry.member.id === pickedMemberId) ??
    resolvedCandidates.find((entry) => transferTargetOnline(entry.target, runtime)) ??
    resolvedCandidates[0];
  const targetMember = targetEntry?.member;
  const target = targetEntry?.target;
  const targetEnvironment = targetMember ? environmentMachineFor(targetMember) : undefined;
  const hostProjectId = targetEntry?.hostProjectId;
  const memberId = targetMember?.id;
  const targetOnline = target ? transferTargetOnline(target, runtime) : false;
  const pending = progress !== null;

  useEffect(() => {
    const current = getThreadMap(useAppStore.getState().threads).get(sourceThreadId);
    if (!current || !memberId || !targetOnline) return;
    const member = getProjectGroupIndex()
      .groupByProjectId.get(current.projectId)
      ?.members.find((entry) => entry.id === memberId);
    const resolved = member ? transferTargetForMember(member) : undefined;
    if (!resolved) return;
    let cancelled = false;
    loadThreadTransferPreview(current, resolved.target, resolved.hostProjectId).then(
      (preview) => {
        if (cancelled) return;
        setPreviewState({ memberId, attempt: previewAttempt, preview });
        setAgentSelection(
          initialAgentSelection(preview, current, useSharedSettings.getState().providerConfigs),
        );
      },
      (cause: unknown) => {
        if (!cancelled)
          setPreviewState({ memberId, attempt: previewAttempt, error: friendlyError(cause) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [memberId, sourceThreadId, targetOnline, previewAttempt]);

  // A preview read before the target dropped offline would describe a move that can't run now.
  const loaded =
    targetOnline && previewState?.memberId === memberId && previewState?.attempt === previewAttempt
      ? previewState
      : null;
  const preview = loaded?.preview;
  const targetLabel = target?.label ?? "";
  const blockerText: Record<Exclude<ThreadTransferBlocker, "busy">, string> = {
    not_chat: t`Only chat threads can move to another machine.`,
    no_history: t`This thread has no conversation to move yet.`,
    unsupported_location: t`Threads in WSL projects can't move to another machine yet.`,
  };
  // A working agent is stopped here and resumed on the target, so it no longer blocks.
  const sourceBlocker = preview?.source.blocker;
  const working = !!thread && thread.presentationMode === "gui" && !canTransferThread(thread);
  const blocker = sourceBlocker === "busy" ? undefined : sourceBlocker;
  const needsAgent = !!preview && !preview.sourceAgentReady;
  const agentsReady = (preview?.agents.length ?? 0) > 0;
  // The source agent is missing and the target has no ready chat agent at all.
  const noneReady = !!preview && needsAgent && !agentsReady;
  const sourceAgentLabel =
    [...sourcePools.windows, ...sourcePools.wsl].find((status) => status.kind === thread?.agentKind)
      ?.label ??
    thread?.agentKind ??
    "";
  const selectedAgentLabel =
    preview?.agents.find((agent) => agent.kind === agentSelection?.kind)?.label ?? sourceAgentLabel;
  const targetProject = preview?.project;
  const projectUnavailable = !!preview && !targetProject;
  const projectNotGit = !!preview?.source.git && !!targetProject && !targetProject.git;
  const canMove =
    !pending &&
    targetOnline &&
    !!targetProject &&
    !projectNotGit &&
    !blocker &&
    !noneReady &&
    (!agentsReady || !!agentSelection);

  const projectName =
    members.find((member) => member.id === thread?.projectId)?.name ?? members[0]?.name ?? "";

  function progressText(current: ThreadTransferProgress): string {
    switch (current.phase) {
      case "stopping":
        return t`Stopping the agent here…`;
      case "packaging":
        return t`Packaging the thread…`;
      case "transferring": {
        const sent = formatBytes(current.transferred);
        const total = formatBytes(current.total);
        return t`Sending ${sent} of ${total}…`;
      }
      case "restoring":
        return t`Restoring it on ${targetLabel}…`;
      case "finishing":
        return t`Finishing…`;
    }
  }

  async function move() {
    const current = getThreadMap(useAppStore.getState().threads).get(sourceThreadId);
    if (!canMove || !current || !target || !hostProjectId) return;
    setError(undefined);
    setProgress({ phase: "packaging" });
    try {
      const outcome = await moveThreadToHost({
        thread: current,
        target,
        projectId: hostProjectId,
        ...(prompt.trim() ? { continuePrompt: prompt } : {}),
        ...(agentsReady && agentSelection ? { agent: agentSelection } : {}),
        ...(working ? { stopFirst: true } : {}),
        onProgress: setProgress,
      });
      const label = outcome.targetLabel;
      toast.success(t`Moved to ${label}.`);
      if (outcome.branchRenamed && outcome.branch) {
        const branch = outcome.branch;
        toast.success(t`The branch name was taken there, so the work continues on ${branch}.`);
      }
      if (outcome.continueFailed) {
        toast.danger(
          t`The thread moved, but your message was not sent. Send it from the moved thread.`,
        );
      }
      close();
    } catch (cause) {
      setError(friendlyError(cause));
      setProgress(null);
    }
  }

  if (!thread) return null;

  return (
    <Modal.Backdrop isOpen onOpenChange={(open) => !open && !pending && close()}>
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-[760px]">
          <Modal.CloseTrigger isDisabled={pending} />
          <Modal.Header>
            <div className="flex items-center gap-1">
              <Modal.Heading>
                <Trans>Move to another machine</Trans>
              </Modal.Heading>
              {/* What moves stays one press away instead of taking space above every move. */}
              <Tooltip
                delay={300}
                isOpen={infoOpen}
                onOpenChange={setInfoOpen}
                shouldCloseOnPress={false}
              >
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={t`How moving works`}
                  aria-expanded={infoOpen}
                  className="size-7 min-h-7 min-w-7 text-muted"
                  onPress={() => setInfoOpen(!infoOpen)}
                >
                  <Info className="size-3.5" aria-hidden />
                </Button>
                <Tooltip.Content placement="bottom" className="max-w-72 text-xs">
                  <Trans>
                    The conversation and its code — commits and uncommitted changes — move to the
                    other machine and continue there. Files ignored by Git, such as .env, stay here.
                  </Trans>
                </Tooltip.Content>
              </Tooltip>
            </div>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-3 pt-1 pb-2">
            {candidates.length === 0 ? (
              <p className="text-sm text-muted">
                <Trans>
                  {projectName} isn't set up on another machine yet. Add it there to move this
                  thread.
                </Trans>
              </p>
            ) : (
              <>
                {preview ? (
                  blocker ? (
                    <p className="text-sm text-warning">{blockerText[blocker]}</p>
                  ) : preview.source.git ? null : (
                    <p className="text-sm text-muted">
                      <Trans>
                        Only the conversation moves: this folder isn't a Git repository.
                      </Trans>
                    </p>
                  )
                ) : null}
                {working ? (
                  <p className="text-sm text-warning">
                    <Trans>
                      The agent is working. Moving stops it here and resumes the work on{" "}
                      {targetLabel}.
                    </Trans>
                  </p>
                ) : null}
                {target && !targetOnline ? (
                  <p className="text-sm text-warning">
                    <Trans>{targetLabel} is offline. Connect to it first.</Trans>
                  </p>
                ) : null}
                {target?.viaThisComputer ? (
                  <p className="text-sm text-warning">
                    <Trans>
                      {targetLabel} is reached through this computer, so you can't open it while
                      this computer is off.
                    </Trans>
                  </p>
                ) : null}
                {loaded?.error ? (
                  <div className="flex items-center gap-2">
                    <p role="alert" className="text-sm text-danger">
                      {loaded.error}
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() => setPreviewAttempt((attempt) => attempt + 1)}
                    >
                      <Trans>Retry</Trans>
                    </Button>
                  </div>
                ) : null}
                {projectUnavailable ? (
                  <p className="text-sm text-warning">
                    <Trans>That project is no longer on {targetLabel}.</Trans>
                  </p>
                ) : null}
                {projectNotGit ? (
                  <p className="text-sm text-warning">
                    <Trans>
                      {projectName} on {targetLabel} isn't a Git repository, so its code can't move
                      there.
                    </Trans>
                  </p>
                ) : null}
                {needsAgent && agentsReady ? (
                  <p className="text-sm text-warning">
                    <Trans>
                      {sourceAgentLabel} isn't set up on {targetLabel}. Pick the agent that
                      continues there.
                    </Trans>
                  </p>
                ) : null}
                {noneReady ? (
                  <p className="text-sm text-warning">
                    <Trans>
                      {sourceAgentLabel} isn't set up on {targetLabel}, and no other chat agent is
                      ready there. Set one up there first.
                    </Trans>
                  </p>
                ) : null}
                {targetOnline && !loaded ? (
                  <div className="flex items-center gap-2 text-sm text-muted">
                    <PixelLoader size="sm" />
                    <Trans>Checking {targetLabel}…</Trans>
                  </div>
                ) : null}
                {targetMember && target ? (
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="inline-flex min-w-0 items-center gap-1 px-1 py-0.5 text-sm leading-tight text-muted/60">
                        <ProjectSelectorIcon
                          project={targetMember}
                          remote={remoteServerFor(targetMember)}
                          className="size-3.5"
                          showEnvironment={false}
                        />
                        <span className="min-w-0 truncate">{targetMember.name}</span>
                      </span>
                      {resolvedCandidates.length === 1 ? (
                        // One destination reads as a plain label, like the
                        // environment menu's single-machine row — never dimmed.
                        <span
                          className="inline-flex min-w-0 shrink items-center gap-1 px-1 py-0.5 text-sm leading-tight text-muted/60"
                          data-project-environment=""
                        >
                          {targetEnvironment?.machine ? (
                            <MachineIcon machine={targetEnvironment.machine} className="size-3.5" />
                          ) : null}
                          <span className="min-w-0 truncate">
                            {targetEnvironment?.machine.label ?? target.label}
                          </span>
                        </span>
                      ) : (
                        <ProjectEnvironmentMenu
                          currentProjectId={targetMember.id}
                          onSelect={(id) => {
                            setPickedMemberId(id);
                            setError(undefined);
                          }}
                          filterProject={(id) => candidateIds.has(id)}
                        />
                      )}
                    </div>
                    {agentsReady && agentSelection && preview ? (
                      <MoveThreadAgentComposer
                        key={memberId}
                        agents={preview.agents}
                        value={agentSelection}
                        onChange={setAgentSelection}
                        prompt={prompt}
                        onPromptChange={setPrompt}
                        placeholder={
                          working
                            ? t`Continue where you left off`
                            : t`Tell ${selectedAgentLabel} what to do next (optional)`
                        }
                        isDisabled={pending}
                      />
                    ) : null}
                    {preview?.source.git && !blocker ? (
                      // The draft composer's worktree row, read-only: a move always lands in a new
                      // worktree on the source branch, so neither control can change here.
                      <div
                        data-move-worktree-row=""
                        className="poracode-composer-shell--preserve-disabled-controls mt-1.5 flex flex-wrap items-center gap-1 px-1"
                      >
                        <Button
                          isDisabled
                          size="sm"
                          variant="ghost"
                          aria-label={t`Worktree mode`}
                          className="poracode-composer-menu poracode-composer-menu--compact min-w-0 max-w-56 px-2"
                        >
                          <GitFork className="size-3 text-muted" />
                          <span className="truncate">
                            {preview.source.git.changedFiles > 0
                              ? t`Worktree + changes`
                              : t`Worktree`}
                          </span>
                        </Button>
                        <Button
                          isDisabled
                          size="sm"
                          variant="ghost"
                          aria-label={t`Branch`}
                          className="poracode-composer-menu poracode-composer-menu--compact min-w-0 max-w-48 px-2"
                        >
                          <span className="truncate">
                            {preview.source.git.branch ?? t`Detached commit`}
                          </span>
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
            {progress ? (
              <p role="status" className="text-sm text-muted">
                {progressText(progress)}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
          </Modal.Body>
          <Modal.Footer>
            <Button slot="close" variant="ghost" className="text-muted" isDisabled={pending}>
              <Trans>Cancel</Trans>
            </Button>
            <Button
              variant="tertiary"
              isPending={pending}
              isDisabled={!canMove}
              onPress={() => void move()}
            >
              {working ? <Trans>Stop and move</Trans> : <Trans>Move</Trans>}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
