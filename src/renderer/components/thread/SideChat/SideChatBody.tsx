import { Trans, useLingui } from "@lingui/react/macro";
import { Button, toast, Tooltip } from "@heroui/react";
import { PictureInPicture2, PanelRightOpen, X } from "lucide-react";
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
import { useSideChatSession } from "./useSideChatSession";

export function SideChatBody({
  entry,
  surface = "window",
}: {
  entry: SideChatBootstrap;
  surface?: "panel" | "window";
}) {
  const { t } = useLingui();
  const { prompt, setPrompt, threadId, busy, launchError, uncertain, hasProject, start } =
    useSideChatSession(entry, surface);
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
          <SideChatModelText entry={entry} {...(threadId ? { threadId } : {})} />
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
                            autoStart: false,
                            ...(threadId ? { existingThreadId: threadId } : {}),
                          })
                        : readBridge().attachSideChatWindow?.({ prompt });
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
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              className={`poracode-overlay-header__controls ${panelHeaderIconButtonClass} h-auto w-auto min-h-0 min-w-0`}
              aria-label={t`Close side chat`}
              onPress={() => {
                if (surface === "window") window.close();
                else void readBridge().closeSideChatPanel?.();
              }}
            >
              <X className="size-3.5" />
            </Button>
          </>
        }
      />
      {threadId ? (
        <SideChatThreadView threadId={threadId} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col justify-end p-4">
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
            variant="draft"
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
            controls={[]}
          />
        </div>
      )}
    </div>
  );
}
