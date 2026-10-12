import { CompactDndProvider } from "@/renderer/dnd";
import { ThreadPane } from "@/renderer/views/MainView/parts/AppContent/parts/ThreadPane";

export function SideChatThreadView({ threadId }: { threadId: string }) {
  return (
    <CompactDndProvider>
      <ThreadPane
        threadId={threadId}
        paneCount={1}
        paneAlign="center"
        chatOnly
        onClose={() => {}}
      />
    </CompactDndProvider>
  );
}
