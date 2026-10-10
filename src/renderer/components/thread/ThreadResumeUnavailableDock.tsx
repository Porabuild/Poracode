import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { ThreadDockCollapseButton, ThreadDockHeader, ThreadDockSection } from "./ThreadDockUI";

export function ThreadResumeUnavailableDock(props: { noticeId: string; message: string }) {
  const { t } = useLingui();
  const [collapsed, setCollapsed] = useState(true);
  const notice = (
    <span
      id={props.noticeId}
      role="status"
      title={props.message}
      className={
        collapsed
          ? "min-w-0 flex-1 truncate leading-5 text-[color:var(--muted)]"
          : "whitespace-pre-wrap break-words px-2 pb-1.5 leading-5 text-[color:var(--muted)]"
      }
    >
      {props.message}
    </span>
  );

  return (
    <ThreadDockSection placement="composer" collapsed={collapsed}>
      <ThreadDockHeader
        icon={AlertTriangle}
        iconClassName="text-warning"
        title={t`Warning`}
        actions={
          <ThreadDockCollapseButton
            collapsed={collapsed}
            label={collapsed ? t`Expand warning` : t`Collapse warning`}
            controlsId={props.noticeId}
            onPress={() => setCollapsed(!collapsed)}
          />
        }
      >
        {collapsed ? notice : null}
      </ThreadDockHeader>
      {collapsed ? null : notice}
    </ThreadDockSection>
  );
}
