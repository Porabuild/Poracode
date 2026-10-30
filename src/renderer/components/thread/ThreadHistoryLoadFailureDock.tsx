import { AlertTriangle } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/renderer/components/common/Button";
import { useAppStore } from "@/renderer/state/appStore";
import { retryThreadRuntimeItems } from "@/renderer/state/runtimeInterestHydration";
import { ThreadDockHeader, ThreadDockSection } from "./ThreadDockUI";

export function ThreadHistoryLoadFailureDock({ threadId }: { threadId: string }) {
  const { t } = useLingui();
  const failed = useAppStore((state) => state.runtimeHydrationStatus[threadId] === "failed");
  if (!failed) return null;

  return (
    <ThreadDockSection placement="composer" collapsed>
      <ThreadDockHeader
        icon={AlertTriangle}
        iconClassName="text-warning"
        title={t`Warning`}
        actions={
          <Button
            size="sm"
            variant="ghost"
            className="h-6 min-w-0 px-2 text-xs text-foreground"
            onPress={() => void retryThreadRuntimeItems(threadId)}
          >
            <Trans>Retry</Trans>
          </Button>
        }
      >
        <span
          role="status"
          title={t`Messages could not be loaded.`}
          className="min-w-0 flex-1 truncate leading-5 text-[color:var(--muted)]"
        >
          <Trans>Messages could not be loaded.</Trans>
        </span>
      </ThreadDockHeader>
    </ThreadDockSection>
  );
}
