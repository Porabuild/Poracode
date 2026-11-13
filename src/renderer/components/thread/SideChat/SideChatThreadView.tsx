import { CompactDndProvider } from "@/renderer/dnd";
import { useEffect } from "react";
import { PanelActivity } from "@/renderer/components/layout/panelMotion";
import { retainRuntimeThreadReader } from "@/renderer/state/runtimeInterestHydration";
import { ThreadPane } from "@/renderer/views/MainView/parts/AppContent/parts/ThreadPane";
import type { Thread } from "@/shared/contracts";
import { TurnClientContextSource } from "@/renderer/components/composer/turnClientContext";
import { captureSideChatTurnContext } from "./sideChatTurnContext";
import { useSideChatThreadRestore } from "./useSideChatThreadRestore";
import { Button } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";

export function SideChatThreadView({
  threadId,
  source,
  visible = true,
}: {
  threadId: string;
  source: Thread;
  visible?: boolean;
}) {
  const restore = useSideChatThreadRestore(threadId, source);
  // Keep event/history ownership alive while the retained view pauses its effects.
  useEffect(() => {
    if (!restore.present) return;
    const reader = retainRuntimeThreadReader(threadId);
    return () => reader.release();
  }, [threadId, restore.present]);
  if (!restore.present)
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {restore.error ? (
          <div>
            <p role="alert" className="text-sm text-danger">
              {restore.error}
            </p>
            <Button size="sm" variant="secondary" onPress={restore.retry}>
              <Trans>Retry</Trans>
            </Button>
          </div>
        ) : (
          <PixelLoader size="sm" />
        )}
      </div>
    );
  return (
    <PanelActivity visible={visible}>
      <TurnClientContextSource value={() => captureSideChatTurnContext(source)}>
        <CompactDndProvider>
          <ThreadPane
            threadId={threadId}
            paneCount={1}
            paneAlign="center"
            chatOnly
            onClose={() => {}}
          />
        </CompactDndProvider>
      </TurnClientContextSource>
    </PanelActivity>
  );
}
