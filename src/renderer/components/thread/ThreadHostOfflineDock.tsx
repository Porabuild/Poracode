import { AlertTriangle } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { ThreadDockHeader, ThreadDockSection } from "./ThreadDockUI";

/**
 * Composer notice for a thread whose host lost its connection, whichever host
 * that is: the conversation may lag the host until it reconnects.
 */
export function ThreadHostOfflineDock() {
  const { t } = useLingui();
  const message = t`Server offline — this conversation may be out of date.`;
  return (
    <ThreadDockSection placement="composer" collapsed>
      <ThreadDockHeader icon={AlertTriangle} iconClassName="text-warning" title={t`Warning`}>
        <span
          role="status"
          title={message}
          className="min-w-0 flex-1 truncate leading-5 text-[color:var(--muted)]"
        >
          {message}
        </span>
      </ThreadDockHeader>
    </ThreadDockSection>
  );
}
