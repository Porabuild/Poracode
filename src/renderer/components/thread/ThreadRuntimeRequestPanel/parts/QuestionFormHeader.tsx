import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** The source line sits above a hairline; the active question heads the answer zone below it. */
export function QuestionFormHeader(props: {
  icon: LucideIcon;
  /** Who is asking and why, when that matters for trust (e.g. an MCP server's message). */
  eyebrow?: string | undefined;
  title: string;
  required?: boolean;
  description?: string | undefined;
  hint?: string | undefined;
  /** Step navigation for multi-question forms. */
  steps?: ReactNode;
}) {
  const { icon: Icon, eyebrow, title, description, hint, steps } = props;
  const icon = (
    <Icon
      className={`${steps && !eyebrow ? "mt-[5px]" : "mt-0.5"} size-3.5 shrink-0 text-foreground-muted`}
      aria-hidden
    />
  );
  const required = props.required ? (
    <span aria-hidden className="text-warning">
      {" *"}
    </span>
  ) : null;
  const question = steps ? (description ?? title) : description;
  return (
    <>
      {eyebrow ? (
        <div className="flex items-start gap-2 border-b border-[color:var(--border)] p-2 leading-snug">
          {icon}
          <p className="min-w-0 flex-1 break-words text-[11px] text-[color:var(--muted)]">
            {eyebrow}
          </p>
        </div>
      ) : null}
      <div className="flex items-start gap-2 px-2 pt-2 leading-snug">
        {eyebrow ? <span aria-hidden className="size-3.5 shrink-0" /> : icon}
        <div className="min-w-0 flex-1 space-y-0.5 break-words">
          {steps ? (
            <div className="pb-1">{steps}</div>
          ) : (
            <p className="text-xs font-semibold text-foreground">
              {title}
              {required}
            </p>
          )}
          {question ? (
            <p className="text-xs text-foreground/75">
              {question}
              {steps ? required : null}
            </p>
          ) : null}
          {hint ? <p className="text-[11px] text-[color:var(--muted)]">{hint}</p> : null}
        </div>
      </div>
    </>
  );
}
