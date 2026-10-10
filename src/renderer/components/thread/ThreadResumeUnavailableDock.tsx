import { AlertTriangle } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { ThreadDockHeader, ThreadDockSection } from "./ThreadDockUI";

export function ThreadResumeUnavailableDock(props: { noticeId: string; message: string }) {
  const { t } = useLingui();
  return (
    <ThreadDockSection placement="composer">
      <ThreadDockHeader icon={AlertTriangle} iconClassName="text-warning" title={t`Warning`} />
      <div
        id={props.noticeId}
        role="status"
        className="whitespace-pre-wrap break-words px-2 pb-1.5 leading-5 text-[color:var(--muted)]"
      >
        {props.message}
      </div>
    </ThreadDockSection>
  );
}
