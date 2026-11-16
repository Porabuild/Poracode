import { useEffect, useMemo, type MutableRefObject } from "react";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useLingui } from "@lingui/react/macro";
import { Button, toast, Tooltip } from "@heroui/react";
import { PictureInPicture2, PanelRightOpen, Trash2, X } from "lucide-react";
import {
  AgentPanelTitleRow,
  agentPanelTitleTextClass,
} from "@/renderer/components/layout/AgentPanelTitleRow";
import { PanelActivity } from "@/renderer/components/layout/panelMotion";
import { SideChatModelText } from "./SideChatModelText";
import { hasMacWindowChrome } from "@/renderer/components/layout/windowChrome";
import { readBridge } from "@/renderer/bridge";
import { friendlyError } from "@/shared/messages";
import type { SideChatBootstrap } from "@/shared/ipc/sideChat";
import { resolveProjectLocation } from "@/shared/worktree";
import { CompactDndProvider } from "@/renderer/dnd";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { useDraftEnvironment } from "@/renderer/hooks/uiSelectors";
import {
  panelHeaderRowClass,
  panelHeaderIconButtonClass,
  overlayHeaderStyle,
  macosTrafficLightGutterClass,
} from "@/renderer/components/layout/sidebarChrome";
import { ThreadDraftView } from "../ThreadDraftView";
import { SideChatThreadView } from "./SideChatThreadView";
import { sideChatBootstrapFromDraft, useSideChatSession } from "./useSideChatSession";

function DraftMountBridge({ mountedRef }: { mountedRef: MutableRefObject<boolean> }) {
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, [mountedRef]);
  return null;
}

export function SideChatBody({
  entry,
  surface = "window",
  visible = true,
}: {
  entry: SideChatBootstrap;
  surface?: "panel" | "window";
  visible?: boolean;
}) {
  const { t } = useLingui();
  const {
    composerId,
    draftContent,
    setDraftContent,
    draftEditorMountedRef,
    selection,
    setSelection,
    project,
    threadId,
    busy,
    start,
  } = useSideChatSession(entry, surface);
  const worktreePath = entry.source.worktreePath;
  const scopedProject = useMemo(
    () =>
      project && worktreePath
        ? { ...project, location: resolveProjectLocation(project.location, worktreePath) }
        : project,
    [project, worktreePath],
  );
  const environment = useDraftEnvironment(scopedProject);
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
                    const serialized = sideChatBootstrapFromDraft(draftContent);
                    const action =
                      surface === "panel"
                        ? readBridge().openSideChatWindow?.({
                            ...entry,
                            prompt: serialized.prompt,
                            segments: serialized.segments,
                            selection,
                            autoStart: false,
                            ...(threadId ? { existingThreadId: threadId } : {}),
                          })
                        : readBridge().attachSideChatWindow?.({
                            prompt: serialized.prompt,
                            segments: serialized.segments,
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
        <SideChatThreadView threadId={threadId} source={entry.source} visible={visible} />
      ) : scopedProject ? (
        <PanelActivity visible={visible}>
          <DraftMountBridge mountedRef={draftEditorMountedRef} />
          <CompactDndProvider>
            <ThreadDraftView
              project={scopedProject}
              agentStatuses={environment.agentStatuses}
              isDetectingAgents={environment.isDetectingAgents}
              compact
              chatOnly
              hideHero
              submitOnEnter
              autoFocusComposer
              composerVariant="active"
              composerPlaceholder={t`Ask a side question`}
              submitLabel={t`Send`}
              draftSelection={{
                initial: selection,
                onChange: setSelection,
              }}
              isolatedDraft={{
                composerId,
                initialContent: draftContent,
                onChange: setDraftContent,
              }}
              {...(environment.pickFiles ? { pickFiles: environment.pickFiles } : {})}
              {...(environment.importFiles ? { importFiles: environment.importFiles } : {})}
              onStart={async (input) => {
                await start(input.prompt, input.segments, {
                  agentKind: input.agentKind,
                  ...(input.agentKind === selection.agentKind && selection.agentInstanceId
                    ? { agentInstanceId: selection.agentInstanceId }
                    : {}),
                  config: input.config,
                });
                return "accepted" as const;
              }}
            />
          </CompactDndProvider>
        </PanelActivity>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <PixelLoader size="sm" />
        </div>
      )}
    </div>
  );
}
