import { useEffect, useState, useSyncExternalStore } from "react";
import { Globe, Monitor, PictureInPicture2 } from "lucide-react";
import { Modal, toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { AgentVision } from "@/shared/agentVision";
import { useThread } from "@/renderer/state/useThread";
import { readManagedLoopbackActivation } from "@/renderer/hostTransport/loopbackHttpWsTransport";
import { boundedClientInvoker } from "@/renderer/state/remoteServers/catalog/boundedHistoryRegistry";
import { currentRemoteServerGeneration } from "@/renderer/state/remoteServers/eventSocketRegistry";
import {
  ThreadDockCollapseButton,
  ThreadDockHeader,
  ThreadDockSection,
  ThreadDockIconButton,
} from "./ThreadDockUI";
import { Button } from "@/renderer/components/common/Button";
import {
  hasAgentVisionStream,
  subscribeAgentVisionStream,
} from "@/renderer/browser/agentVisionStream";
import {
  isAgentVisionPictureInPicture,
  subscribeAgentVisionPictureInPicture,
  toggleAgentVisionPictureInPicture,
} from "@/renderer/browser/agentVisionPictureInPicture";

export function useThreadAgentVision(threadId: string, visible: boolean, preview: boolean) {
  const thread = useThread(threadId);
  const remoteServerId = thread?.remoteServerId;
  const remoteId = thread?.remoteId;
  const [snapshot, setSnapshot] = useState<{ threadId: string; vision: AgentVision | null }>({
    threadId,
    vision: null,
  });
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    const ownerId = remoteServerId;
    let stopStream: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        if (stopStream && hasAgentVisionStream(ownerId)) return;
        const activation = readManagedLoopbackActivation();
        const generation = remoteServerId
          ? currentRemoteServerGeneration(remoteServerId)
          : undefined;
        let vision: AgentVision | null;
        if (remoteServerId && remoteId) {
          const invoke = boundedClientInvoker();
          if (!invoke) return;
          vision = await invoke(remoteServerId, (client) =>
            client.agentVision(remoteId, preview, controller.signal),
          );
          if (currentRemoteServerGeneration(remoteServerId) !== generation) return;
        } else {
          if (!activation) return;
          vision = await activation.client.agentVision(threadId, preview, controller.signal);
          if (readManagedLoopbackActivation() !== activation) return;
        }
        if (controller.signal.aborted) return;
        if (!stopStream || !hasAgentVisionStream(ownerId)) setSnapshot({ threadId, vision });
        if (preview && vision?.streamVersion === 1 && !stopStream)
          stopStream = subscribeAgentVisionStream(ownerId, remoteId ?? threadId, (frame) => {
            if (!controller.signal.aborted) setSnapshot({ threadId, vision: frame });
          });
      } catch {
        if (!controller.signal.aborted && !(stopStream && hasAgentVisionStream(ownerId)))
          setSnapshot({ threadId, vision: null });
      } finally {
        if (!controller.signal.aborted)
          timer = setTimeout(() => {
            void poll();
          }, 1000);
      }
    }
    void poll();
    return () => {
      controller.abort();
      stopStream?.();
      clearTimeout(timer);
    };
  }, [threadId, remoteServerId, remoteId, visible, preview]);
  return snapshot.threadId === threadId ? snapshot.vision : null;
}

export function ThreadAgentVisionDock({
  threadId,
  vision,
  collapsed,
  onCollapsedChange,
}: {
  threadId: string;
  vision: AgentVision;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  const { t } = useLingui();
  const thread = useThread(threadId);
  const ownerId = thread?.remoteServerId;
  const targetId = thread?.remoteId ?? threadId;
  const poppedOut = useSyncExternalStore(
    subscribeAgentVisionPictureInPicture,
    () => isAgentVisionPictureInPicture(ownerId, targetId),
    () => false,
  );
  const [openingWindow, setOpeningWindow] = useState(false);
  const pictureInPicture =
    document.pictureInPictureEnabled && vision.streamVersion === 1 ? (
      <ThreadDockIconButton
        label={poppedOut ? t`Close picture-in-picture` : t`Open picture-in-picture`}
        isDisabled={!vision.image && !poppedOut}
        isPending={openingWindow}
        onPress={() => {
          setOpeningWindow(true);
          void toggleAgentVisionPictureInPicture(ownerId, targetId, vision)
            .catch(() => toast.danger(t`Unable to open picture-in-picture`))
            .finally(() => setOpeningWindow(false));
        }}
      >
        <PictureInPicture2 className="size-3.5" />
      </ThreadDockIconButton>
    ) : null;
  const source = vision.source === "computer" ? t`Computer use` : t`Browser`;
  const SourceIcon = vision.source === "computer" ? Monitor : Globe;
  const action =
    vision.toolName === "perform"
      ? t`Perform actions`
      : /launch/u.test(vision.toolName)
        ? t`Open app`
        : /drag/u.test(vision.toolName)
          ? t`Drag`
          : vision.toolName === "press" || /press.*key/u.test(vision.toolName)
            ? t`Press key`
            : /click|press|invoke/u.test(vision.toolName)
              ? t`Click`
              : /type|fill|set.*value/u.test(vision.toolName)
                ? t`Type text`
                : /scroll/u.test(vision.toolName)
                  ? t`Scroll`
                  : /navigate|open|new_tab|reload|back|forward/u.test(vision.toolName)
                    ? t`Navigate`
                    : /screenshot/u.test(vision.toolName)
                      ? t`Screenshot`
                      : t`Observe`;
  return (
    <ThreadDockSection
      placement="right"
      collapsed={collapsed}
      ariaLabel={t`Agent vision`}
      className="min-w-0 [&[data-placement='right']]:h-auto"
    >
      <ThreadDockHeader
        icon={
          <span role="img" aria-label={source} title={source}>
            <SourceIcon className="size-3.5 shrink-0 text-foreground-muted" />
          </span>
        }
        title={t`Agent vision`}
        collapse={{ collapsed, onToggle: () => onCollapsedChange(!collapsed) }}
        actions={
          <>
            <span
              role="status"
              className="flex shrink-0 items-center gap-1.5 text-[0.85em] text-muted"
            >
              <span className="sr-only">{source}: </span>
              {vision.status === "running" ? (
                <span className="size-1.5 animate-pulse rounded-full bg-accent" />
              ) : null}
              {vision.status === "error" ? t`Failed` : action}
            </span>
            {pictureInPicture}
            <ThreadDockCollapseButton
              collapsed={collapsed}
              label={collapsed ? t`Expand agent vision` : t`Collapse agent vision`}
              onPress={() => onCollapsedChange(!collapsed)}
            />
          </>
        }
      />
      {!collapsed ? (
        <div className="space-y-2 px-3 pb-3">
          <div className="flex aspect-video items-center justify-center overflow-hidden rounded-md border border-default bg-background">
            <Modal>
              <Button
                variant="ghost"
                aria-label={t`Open preview`}
                isDisabled={!vision.image}
                className="size-full min-w-0 cursor-zoom-in rounded-none p-0"
              >
                {vision.image ? (
                  <img
                    src={vision.image}
                    alt={t`Agent's view`}
                    className="size-full object-contain"
                  />
                ) : (
                  <span className="px-3 text-center text-xs text-muted">{t`Waiting for a preview`}</span>
                )}
              </Button>
              <Modal.Backdrop>
                <Modal.Container placement="center" size="cover">
                  <Modal.Dialog>
                    <Modal.CloseTrigger aria-label={t`Close preview`} />
                    <Modal.Header className="flex-row items-center justify-between pr-12">
                      <Modal.Heading>{source}</Modal.Heading>
                      <div>{pictureInPicture}</div>
                    </Modal.Header>
                    <Modal.Body className="flex min-h-0 items-center justify-center p-3">
                      {vision.image ? (
                        <img
                          src={vision.image}
                          alt={t`Agent's view`}
                          className="max-h-[75dvh] max-w-full object-contain"
                        />
                      ) : (
                        <span className="text-xs text-muted">{t`Waiting for a preview`}</span>
                      )}
                    </Modal.Body>
                  </Modal.Dialog>
                </Modal.Container>
              </Modal.Backdrop>
            </Modal>
          </div>
        </div>
      ) : null}
    </ThreadDockSection>
  );
}
