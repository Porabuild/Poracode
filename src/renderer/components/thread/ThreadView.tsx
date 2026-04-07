import { useEffect, useRef, useState } from "react";
import { ChevronDown, GitBranch, GitFork, Paperclip, X } from "lucide-react";
import type {
  AgentStatus,
  ProjectLocation,
  PromptSegment,
  TerminalSize,
  Thread,
  ThreadConfig,
  ThreadServerRequestId,
} from "../../../shared/contracts";

import { ProviderIcon, getComposerControls, getStatusTone } from "../providers";
import type { PendingThreadServerRequest } from "../../state/appStore";
import { useGitStore } from "../../state/gitStore";
import { Button, TuxIcon } from "../common";
import { useSharedSettings } from "../../state/sharedSettingsStore";
import { readBridge } from "../../bridge";
import {
  MentionInput,
  type MentionInputHandle,
  AttachmentBar,
  ImageLightbox,
  useAttachments,
} from "../composer";
import { flattenSegments } from "../composer/serializeMentions";
import { TerminalPane } from "./TerminalPane";
import { ThreadComposer } from "./ThreadComposer";
import { ThreadServerRequestPanel } from "./ThreadServerRequestPanel";

const DEFAULT_HIDDEN_TERMINAL_SIZE: TerminalSize = { cols: 120, rows: 30 };

function buildControls(
  thread: Thread,
  agentStatus: AgentStatus | undefined,
  onConfigChange: (config: ThreadConfig) => void,
) {
  const statusTone = getStatusTone(thread);
  const factory = getComposerControls(thread.agentKind);

  return [
    {
      kind: "static" as const,
      value: agentStatus?.label ?? thread.agentKind,
      iconOnly: true,
      icon: <ProviderIcon kind={thread.agentKind} tone={statusTone} className="size-4 shrink-0" />,
    },
    ...(factory && agentStatus
      ? factory({
          capabilities: agentStatus.capabilities,
          config: thread.config,
          isDisabled: !thread.canResumeWithConfig,
          onConfigChange: (patch) => onConfigChange({ ...thread.config, ...patch }),
        })
      : []),
  ];
}

export function ThreadView(props: {
  thread: Thread;
  agentStatus: AgentStatus | undefined;
  projectLocation: ProjectLocation;
  pendingLaunchPrompt?: string;
  pendingLaunchSegments?: PromptSegment[];
  isWsl?: boolean;
  pendingServerRequests: PendingThreadServerRequest[];
  showCloseButton?: boolean;
  paneAlign?: "left" | "center" | "right";
  isDragging?: boolean;
  dropIndicator?: false | "replace" | "insert-left" | "insert-right";
  paneIndex?: number;
  paneCount?: number;
  dragHandleRef?: (element: Element | null) => void;
  droppableRef?: React.RefObject<HTMLDivElement | null>;
  onClose?: (() => void) | undefined;
  onConfigChange: (config: ThreadConfig) => void;
  onLaunchConsumed?: (() => void) | undefined;
  onLaunchFailed?: (() => void) | undefined;
  onResolveServerRequest: (input: {
    requestId: ThreadServerRequestId;
    method: string;
    response: unknown;
  }) => Promise<void>;
  onSubmitInput: (prompt: string, segments?: PromptSegment[]) => Promise<void>;
}) {
  const {
    thread,
    agentStatus,
    projectLocation,
    pendingLaunchPrompt,
    pendingLaunchSegments,
    isWsl,
    pendingServerRequests,
    showCloseButton,
    paneAlign = "center",
    isDragging,
    dropIndicator,
    paneIndex,
    paneCount = 1,
    dragHandleRef,
    droppableRef,
    onClose,
    onConfigChange,
    onLaunchConsumed,
    onLaunchFailed,
    onResolveServerRequest,
    onSubmitInput,
  } = props;
  const [prompt, setPrompt] = useState("");
  const [hasContent, setHasContent] = useState(false);
  const mentionRef = useRef<MentionInputHandle>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [terminalSize, setTerminalSize] = useState<TerminalSize | null>(null);
  const attachments = useAttachments();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const imageAttachments = attachments.attachments.filter((a) => a.isImage);
  const launchRequestRef = useRef<string | null>(null);
  const isServerControlled = agentStatus?.capabilities.liveInputMode === "server";
  const isTerminalInput = agentStatus?.capabilities.liveInputMode === "terminal";
  const usesTerminalPresentation =
    (agentStatus?.capabilities.presentationMode ?? "terminal") === "terminal";
  const activeServerRequest = pendingServerRequests[0];
  const canSubmitServerInput =
    isServerControlled &&
    thread.sessionRef !== undefined &&
    (thread.status === "idle" || thread.status === "needs_reply");
  const canSubmitTerminalInput =
    usesTerminalPresentation &&
    isTerminalInput &&
    thread.status !== "inactive" &&
    thread.status !== "launching";
  const showServerComposer =
    isServerControlled && thread.status !== "inactive" && thread.status !== "launching";
  const showTerminalComposer =
    usesTerminalPresentation &&
    isTerminalInput &&
    thread.status !== "inactive" &&
    thread.status !== "launching";
  const launchTerminalSize = usesTerminalPresentation ? terminalSize : DEFAULT_HIDDEN_TERMINAL_SIZE;

  const collapseTerminalComposerSetting = useSharedSettings(
    (s) => s.collapseTerminalComposer,
  );
  const [composerCollapsed, setComposerCollapsed] = useState(collapseTerminalComposerSetting);
  const canCollapseComposer = showTerminalComposer;
  const isComposerCollapsed = canCollapseComposer && composerCollapsed;

  const branchName = useGitStore(
    (s) =>
      thread.worktreeBranch ??
      (thread.worktreePath
        ? s.worktreeStatuses[thread.worktreePath]?.branch
        : s.statuses[thread.projectId]?.branch),
  );

  const controls = buildControls(thread, agentStatus, onConfigChange);

  const canSubmit = (canSubmitServerInput || canSubmitTerminalInput) && !isSubmitting;

  function submitPrompt(segments: PromptSegment[]) {
    // Merge attachment segments with the editor segments
    const attachmentSegments = attachments.toSegments();
    const allSegments = [...attachmentSegments, ...segments];
    const flat = flattenSegments(allSegments);
    if (flat.length === 0 || !canSubmit) return;
    setIsSubmitting(true);
    void onSubmitInput(flat, allSegments.length > 0 ? allSegments : undefined)
      .then(() => {
        mentionRef.current?.clear();
        mentionRef.current?.focus();
        setPrompt("");
        setHasContent(false);
        attachments.clearAll();
      })
      .catch(() => {
        // Leave the prompt intact so the user can retry.
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  }

  useEffect(() => {
    setPrompt("");
    setComposerCollapsed(collapseTerminalComposerSetting);
  }, [thread.id, collapseTerminalComposerSetting]);

  // Listen for "Paste in input" from terminal context menu
  useEffect(() => {
    function handlePasteToComposer(e: Event) {
      const text = (e as CustomEvent<string>).detail;
      if (text) setPrompt((prev) => prev + text);
    }
    window.addEventListener("lightcode:paste-to-composer", handlePasteToComposer);
    return () => window.removeEventListener("lightcode:paste-to-composer", handlePasteToComposer);
  }, []);

  useEffect(() => {
    if (pendingLaunchPrompt === undefined) {
      launchRequestRef.current = null;
    }
  }, [pendingLaunchPrompt, thread.id]);

  useEffect(() => {
    if (pendingLaunchPrompt === undefined || launchTerminalSize === null) {
      return;
    }

    const launchKey = [
      thread.id,
      thread.sessionRef?.providerSessionId ?? "new",
      pendingLaunchPrompt,
      launchTerminalSize.cols,
      launchTerminalSize.rows,
    ].join(":");
    if (launchRequestRef.current === launchKey) {
      return;
    }

    launchRequestRef.current = launchKey;
    onLaunchConsumed?.();

    void readBridge()
      .startThread({
        threadId: thread.id,
        projectLocation,
        agentKind: thread.agentKind,
        config: thread.config,
        prompt: pendingLaunchPrompt,
        ...(pendingLaunchSegments ? { segments: pendingLaunchSegments } : {}),
        initialSize: launchTerminalSize,
        ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
      })
      .catch(() => {
        launchRequestRef.current = null;
        onLaunchFailed?.();
      });
  }, [
    onLaunchConsumed,
    onLaunchFailed,
    pendingLaunchPrompt,
    pendingLaunchSegments,
    projectLocation,
    launchTerminalSize,
    thread.agentKind,
    thread.config,
    thread.id,
    thread.sessionRef,
  ]);

  const alignClass =
    paneAlign === "right" ? "ml-auto" : paneAlign === "left" ? "mr-auto" : "mx-auto";
  const paddingClass = "px-2";

  return (
    <div
      className={`relative flex h-full min-h-0 flex-col ${paddingClass} pt-1 pb-4 ${isDragging ? "opacity-50" : ""}`}
    >
      <div
        ref={droppableRef}
        className={`${alignClass} relative flex h-full w-full max-w-[1040px] flex-col px-4`}
      >
        {dropIndicator === "replace" && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-20 rounded-2xl bg-accent/10 ring-1 ring-inset ring-accent/30"
          />
        )}
        {dropIndicator === "insert-left" && paneIndex === 0 && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 bottom-0 -left-1 z-20 w-0.5 rounded-full bg-accent"
          />
        )}
        {dropIndicator === "insert-right" &&
          (paneIndex === undefined || paneIndex === paneCount - 1) && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 bottom-0 -right-1 z-20 w-0.5 rounded-full bg-accent"
            />
          )}
        <div
          className={`${alignClass} flex w-full max-w-[920px] items-start justify-between gap-4`}
        >
          <div
            ref={dragHandleRef}
            className={`flex min-w-0 flex-1 items-center gap-2 ${dragHandleRef ? "cursor-grab active:cursor-grabbing" : ""}`}
          >
            <ProviderIcon
              kind={thread.agentKind}
              tone={getStatusTone(thread)}
              className="size-4 shrink-0"
            />
            <h1 className="truncate text-sm font-semibold tracking-tight text-foreground">
              {thread.title}
            </h1>
            {isWsl ? <TuxIcon className="h-3 w-auto shrink-0 text-muted/60" /> : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {showCloseButton ? (
              <Button
                isIconOnly
                aria-label="Close pane"
                className="rounded-3xl text-muted hover:bg-white/[0.05] hover:text-foreground"
                onPress={() => onClose?.()}
                size="sm"
                variant="ghost"
              >
                <X className="size-4" />
              </Button>
            ) : null}
          </div>
        </div>

        <div
          className={`${alignClass} flex min-h-0 w-full max-w-[920px] flex-1 flex-col gap-2 pt-3`}
        >
          <div className="min-h-0 flex-1 overflow-hidden">
            {usesTerminalPresentation ? (
              <TerminalPane
                key={thread.id}
                onTerminalResize={setTerminalSize}
                status={thread.status}
                threadId={thread.id}
              />
            ) : null}
          </div>

          {activeServerRequest ? (
            <ThreadServerRequestPanel
              agentLabel={agentStatus?.label}
              request={activeServerRequest}
              onResolve={onResolveServerRequest}
            />
          ) : null}

          <div>
            <div
              className={`grid transition-[grid-template-rows] ease-[cubic-bezier(0.16,1,0.3,1)] ${isComposerCollapsed ? "duration-300" : "duration-200"}`}
              style={{ gridTemplateRows: isComposerCollapsed ? "0fr" : "1fr" }}
            >
              <div className="overflow-hidden">
                <div
                  className={`relative ${isComposerCollapsed ? "pointer-events-none" : ""}`}
                  style={{
                    opacity: isComposerCollapsed ? 0 : 1,
                    transition: isComposerCollapsed
                      ? "opacity 150ms ease 50ms"
                      : "opacity 200ms ease 100ms",
                  }}
                >
                  {thread.status === "launching" ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-3xl bg-background/80">
                      <span className="text-sm text-muted">Starting thread...</span>
                    </div>
                  ) : null}
                  <ThreadComposer
                    autoFocus // eslint-disable-line jsx-a11y/no-autofocus -- desktop app, expected UX
                    compact
                    attachmentBar={
                      <AttachmentBar
                        attachments={attachments.attachments}
                        onRemove={attachments.removeAttachment}
                        onPreviewImage={(att) => {
                          const idx = imageAttachments.findIndex((a) => a.id === att.id);
                          if (idx >= 0) setLightboxIndex(idx);
                        }}
                      />
                    }
                    inputContent={
                      <MentionInput
                        ref={mentionRef}
                        autoFocus // eslint-disable-line jsx-a11y/no-autofocus -- desktop app, expected UX
                        compact
                        disabled={
                          !(showServerComposer || showTerminalComposer) ||
                          thread.status === "launching"
                        }
                        placeholder={
                          isServerControlled
                            ? `Ask ${agentStatus?.label ?? "the agent"} anything about this workspace`
                            : "Send a message..."
                        }
                        projectLocation={projectLocation}
                        onTextChange={setHasContent}
                        onSubmit={submitPrompt}
                        onPasteImage={(file) => {
                          void attachments.addClipboardImage(file, thread.id);
                        }}
                      />
                    }
                    controls={controls}
                    placeholder="Send a message..."
                    prompt={prompt}
                    promptDisabled={
                      !(showServerComposer || showTerminalComposer) ||
                      thread.status === "launching"
                    }
                    submitDisabled={
                      !(hasContent || attachments.attachments.length > 0) || !canSubmit
                    }
                    submitLabel="Send message"
                    afterControls={
                      <>
                        <Button
                          isIconOnly
                          aria-label="Attach files"
                          className="lightcode-composer-menu min-w-9 px-2"
                          size="sm"
                          variant="ghost"
                          onPress={() => {
                            void readBridge()
                              .pickFiles()
                              .then((paths) => {
                                if (paths) attachments.addFiles(paths);
                              });
                          }}
                        >
                          <Paperclip className="size-4" />
                        </Button>
                        {branchName ? (
                          <div className="lightcode-composer-static min-w-0 px-2.5">
                            {thread.worktreePath ? (
                              <GitFork className="size-3.5 text-muted" />
                            ) : (
                              <GitBranch className="size-3.5 text-muted" />
                            )}
                            <span className="truncate">{branchName}</span>
                            {thread.prNumber ? (
                              <span className="text-muted/60">PR #{thread.prNumber}</span>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    }
                    onPromptChange={setPrompt}
                    onSubmit={() => {
                      const segments = mentionRef.current?.serializeSegments();
                      submitPrompt(
                        segments && segments.length > 0
                          ? segments
                          : [{ kind: "text", content: prompt.trim() }],
                      );
                    }}
                  />
                </div>
              </div>
            </div>
            {canCollapseComposer ? (
              <div
                className={`relative z-10 flex justify-center transition-[margin] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] ${isComposerCollapsed ? "mt-0" : "-mt-3"}`}
              >
                <button
                  type="button"
                  aria-label={isComposerCollapsed ? "Show composer" : "Collapse composer"}
                  className="cursor-pointer rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-0.5 text-muted transition-colors hover:text-foreground"
                  onClick={() => setComposerCollapsed(!composerCollapsed)}
                >
                  <ChevronDown
                    className={`size-4 transition-transform duration-150 ${isComposerCollapsed ? "rotate-180" : ""}`}
                  />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {lightboxIndex !== null && imageAttachments.length > 0 ? (
        <ImageLightbox
          images={imageAttachments}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </div>
  );
}
