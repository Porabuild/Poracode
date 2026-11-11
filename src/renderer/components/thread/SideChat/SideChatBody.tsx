import { usePanelStore } from "@/renderer/state/panelStore";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button, toast, Tooltip } from "@heroui/react";
import { PictureInPicture2, PanelRightOpen, Trash2, X } from "lucide-react";
import {
  AgentPanelTitleRow,
  agentPanelTitleTextClass,
} from "@/renderer/components/layout/AgentPanelTitleRow";
import { SideChatModelText } from "./SideChatModelText";
import { hasMacWindowChrome } from "@/renderer/components/layout/windowChrome";
import { readBridge } from "@/renderer/bridge";
import { friendlyError } from "@/shared/messages";
import type { SideChatBootstrap } from "@/shared/ipc/sideChat";
import { ThreadComposer } from "../ThreadComposer";
import { ComposerAddMenu } from "@/renderer/components/composer/ComposerAddMenu";
import { isPlanModeControl } from "@/renderer/components/providers/composerControlBuilders";
import {
  panelHeaderRowClass,
  panelHeaderIconButtonClass,
  overlayHeaderStyle,
  macosTrafficLightGutterClass,
} from "@/renderer/components/layout/sidebarChrome";
import { AttachmentBar } from "@/renderer/components/composer/AttachmentBar";
import { SelectionPreview } from "@/renderer/components/composer/MentionInput";
import { fileNameFromPath, isImagePath } from "@/shared/promptContent";
import { SideChatThreadView } from "./SideChatThreadView";
import { useSideChatDraftControls } from "./useSideChatDraftControls";
import { useSideChatSession } from "./useSideChatSession";

export function SideChatBody({
  entry,
  surface = "window",
}: {
  entry: SideChatBootstrap;
  surface?: "panel" | "window";
}) {
  const { t } = useLingui();
  const {
    prompt,
    setPrompt,
    draftSegments,
    setDraftSegments,
    selection,
    setSelection,
    project,
    threadId,
    busy,
    launchError,
    uncertain,
    hasProject,
    start,
  } = useSideChatSession(entry, surface);
  const controls = useSideChatDraftControls(
    entry.source,
    project,
    selection,
    setSelection,
    busy || uncertain,
  );
  const transferLabel = surface === "panel" ? t`Detach side chat` : t`Attach side chat`;
  const selections = draftSegments.flatMap((segment, index) =>
    segment.kind === "text" && segment.selection ? [{ segment, index }] : [],
  );
  const question = [...selections.map(({ segment }) => segment.content), prompt]
    .filter(Boolean)
    .join("\n\n");
  const submit = () => {
    const segments = [
      ...draftSegments.filter((segment) => segment.kind !== "text"),
      ...selections.flatMap(({ segment }, index) => [
        ...(index > 0 ? [{ kind: "text" as const, content: "\n\n" }] : []),
        segment,
      ]),
      ...(prompt
        ? [{ kind: "text" as const, content: `${selections.length > 0 ? "\n\n" : ""}${prompt}` }]
        : []),
    ];
    void start(question, segments);
  };
  return (
    <div
      className={`${surface === "window" ? "h-screen" : "h-full"} flex min-h-0 flex-col bg-[var(--content-background)] text-foreground`}
      data-side-chat-surface={surface}
    >
      {surface === "window" ? (
        <div
          className={`poracode-overlay-header ${panelHeaderRowClass}`}
          style={overlayHeaderStyle()}
        >
          {hasMacWindowChrome() ? <span className={macosTrafficLightGutterClass} /> : null}
          <SideChatModelText entry={{ ...entry, selection }} {...(threadId ? { threadId } : {})} />
        </div>
      ) : null}
      <AgentPanelTitleRow
        className="poracode-side-chat-title"
        title={<h2 className={agentPanelTitleTextClass}>{entry.title}</h2>}
        actions={
          <>
            <Tooltip>
              <Tooltip.Trigger>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  className={`poracode-overlay-header__controls ${panelHeaderIconButtonClass} h-auto w-auto min-h-0 min-w-0`}
                  isDisabled={busy}
                  aria-label={transferLabel}
                  onPress={() => {
                    const action =
                      surface === "panel"
                        ? readBridge().openSideChatWindow?.({
                            ...entry,
                            prompt: question,
                            segments: draftSegments,
                            selection,
                            autoStart: false,
                            ...(threadId ? { existingThreadId: threadId } : {}),
                          })
                        : readBridge().attachSideChatWindow?.({
                            prompt: question,
                            segments: draftSegments,
                            selection,
                          });
                    void action?.catch((error: unknown) => toast.danger(friendlyError(error)));
                  }}
                >
                  {surface === "panel" ? (
                    <PictureInPicture2 className="size-3.5" />
                  ) : (
                    <PanelRightOpen className="size-3.5" />
                  )}
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Content>{transferLabel}</Tooltip.Content>
            </Tooltip>
            <Tooltip>
              <Tooltip.Trigger>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  className={`poracode-overlay-header__controls ${panelHeaderIconButtonClass} h-auto w-auto min-h-0 min-w-0`}
                  aria-label={t`Delete side chat`}
                  onPress={() => {
                    if (surface === "window") window.close();
                    else
                      void readBridge()
                        .closeSideChatPanel?.()
                        .catch((error: unknown) => toast.danger(friendlyError(error)));
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Content>{t`Delete side chat`}</Tooltip.Content>
            </Tooltip>
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              className={`poracode-overlay-header__controls ${panelHeaderIconButtonClass} h-auto w-auto min-h-0 min-w-0`}
              aria-label={surface === "panel" ? t`Hide side chat` : t`Close side chat`}
              onPress={() => {
                if (surface === "window") window.close();
                else usePanelStore.setState({ sideChatPanelOpen: false });
              }}
            >
              <X className="size-3.5" />
            </Button>
          </>
        }
      />
      {threadId ? (
        <SideChatThreadView threadId={threadId} source={entry.source} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col justify-end px-3 pb-2">
          {launchError ? (
            <div className="mb-2">
              <p role="alert" className="text-sm text-danger">
                {launchError}
              </p>
              {uncertain ? (
                <Button
                  variant="secondary"
                  size="sm"
                  isDisabled={busy}
                  onPress={() => {
                    submit();
                  }}
                >
                  <Trans>Retry</Trans>
                </Button>
              ) : null}
            </div>
          ) : null}
          <ThreadComposer
            autoFocus // eslint-disable-line jsx-a11y/no-autofocus -- explicitly opened desktop side composer is the expected focus target
            variant="active"
            prompt={prompt}
            placeholder={t`Ask a side question`}
            promptDisabled={busy || uncertain}
            attachmentBar={
              <AttachmentBar
                leading={
                  selections.length > 0
                    ? selections.map(({ segment, index }) => (
                        <span key={index} className="poracode-slash-chip poracode-selection-chip">
                          <SelectionPreview text={segment.content} />
                          <button
                            type="button"
                            className="poracode-diff-comment-chip__delete"
                            aria-label={t`Remove`}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={(event) => {
                              if (
                                event.detail === 0 &&
                                document.activeElement === event.currentTarget
                              ) {
                                event.currentTarget
                                  .closest("[data-poracode-composer]")
                                  ?.querySelector<HTMLTextAreaElement>("textarea")
                                  ?.focus();
                              }
                              setDraftSegments(draftSegments.filter((_, i) => i !== index));
                            }}
                          >
                            <X aria-hidden="true" />
                          </button>
                        </span>
                      ))
                    : null
                }
                attachments={draftSegments.flatMap((segment, index) =>
                  segment.kind === "attachment"
                    ? [
                        {
                          id: String(index),
                          path: segment.path,
                          name: fileNameFromPath(segment.path),
                          isImage: isImagePath(segment.path),
                          ...(segment.mimeType ? { mimeType: segment.mimeType } : {}),
                        },
                      ]
                    : [],
                )}
              />
            }
            submitLabel={launchError ? t`Retry` : t`Send`}
            submitDisabled={busy || !hasProject || !question.trim()}
            submitPending={busy}
            onPromptChange={setPrompt}
            onSubmit={submit}
            controls={controls}
            afterControls={
              <ComposerAddMenu
                mcpServers={[]}
                showFileOption={false}
                onPickFiles={() => {}}
                planControl={controls.find(isPlanModeControl)}
              />
            }
          />
        </div>
      )}
    </div>
  );
}
