import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { IProgramStatusRecord } from "@xterm/addon-program-status";
import { X } from "lucide-react";

function displayText(text: string | undefined): string {
  return (text ?? "").replace(/[\p{Bidi_Control}\u200B\u2060\uFEFF]/gu, "");
}

export function TerminalProgramStatus({
  records,
  onDismiss,
}: {
  records: ReadonlyArray<IProgramStatusRecord>;
  onDismiss: (id: string) => void;
}) {
  const { t } = useLingui();
  if (records.length === 0) return null;

  return (
    <div
      role="region"
      aria-label={t`Terminal program status`}
      className="max-h-24 shrink-0 overflow-y-auto border-t border-[var(--hairline)] text-xs"
    >
      {records.map((record) => {
        const app = displayText(record.effectiveApp ?? record.app) || t`Terminal`;
        const id = displayText(record.id);
        const title = displayText(record.title);
        const message = displayText(record.message);
        const state =
          record.state === "working"
            ? t`Working`
            : record.state === "done"
              ? t`Done`
              : record.state === "error"
                ? t`Error`
                : record.state === "blocked"
                  ? record.kind === "permission"
                    ? t`Waiting for approval`
                    : record.kind === "auth"
                      ? t`Authentication`
                      : t`Waiting`
                  : t`Idle`;
        return (
          <div key={record.id} className="flex items-center gap-2 px-2 py-1">
            <span
              className={`shrink-0 ${
                record.state === "error"
                  ? "text-danger"
                  : record.state === "blocked"
                    ? "text-warning"
                    : "text-foreground-muted"
              }`}
            >
              {state}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate" title={[app, id, title].filter(Boolean).join(" · ")}>
                <bdi>{app}</bdi>
                {id ? <bdi className="ml-1 text-foreground-muted">{id}</bdi> : null}
                {title ? <bdi className="ml-2">{title}</bdi> : null}
              </div>
              {message ? (
                <div className="truncate text-foreground-muted" title={message}>
                  <bdi>{message}</bdi>
                </div>
              ) : null}
            </div>
            {record.progress !== undefined ? (
              <span
                role="progressbar"
                aria-label={app}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={record.progress}
                className="shrink-0 tabular-nums text-foreground-muted"
              >
                {record.progress}%
              </span>
            ) : null}
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              className="size-6 min-w-0 shrink-0 text-foreground-muted"
              aria-label={t`Dismiss`}
              onPress={() => onDismiss(record.id)}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
