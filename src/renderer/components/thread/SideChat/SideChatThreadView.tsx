import { CompactDndProvider } from "@/renderer/dnd";
import { ThreadPane } from "@/renderer/views/MainView/parts/AppContent/parts/ThreadPane";
import type { Thread } from "@/shared/contracts";
import { TurnClientContextSource } from "@/renderer/components/composer/turnClientContext";
import { captureSideChatTurnContext } from "./sideChatTurnContext";
import { useSideChatThreadRestore } from "./useSideChatThreadRestore";
import { Button } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";

export function SideChatThreadView({ threadId, source }: { threadId: string; source: Thread }) {
  const restore = useSideChatThreadRestore(threadId, source);
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
  );
}
