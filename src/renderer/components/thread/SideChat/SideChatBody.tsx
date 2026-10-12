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
import {
  panelHeaderRowClass,
  panelHeaderIconButtonClass,
  overlayHeaderStyle,
  macosTrafficLightGutterClass,
} from "@/renderer/components/layout/sidebarChrome";
import { AttachmentBar } from "@/renderer/components/composer/AttachmentBar";
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
                            prompt,
                            selection,
                            autoStart: false,
                            ...(threadId ? { existingThreadId: threadId } : {}),
                          })
                        : readBridge().attachSideChatWindow?.({ prompt, selection });
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
                    void start(prompt);
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
                attachments={(entry.segments ?? []).flatMap((segment, index) =>
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
            submitDisabled={busy || !hasProject || !prompt.trim()}
            submitPending={busy}
            onPromptChange={setPrompt}
            onSubmit={() => {
              void start(prompt);
            }}
            controls={controls}
          />
        </div>
      )}
    </div>
  );
}
