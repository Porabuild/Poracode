import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** The active question is the form's heading; the answer zone sits below a hairline. */
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
  return (
    <div className="flex items-start gap-2 border-b border-[color:var(--border)] p-2 leading-snug">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-foreground-muted" aria-hidden />
      <div className="min-w-0 flex-1 space-y-0.5 break-words">
        {eyebrow ? <p className="text-[11px] text-[color:var(--muted)]">{eyebrow}</p> : null}
        <p className="text-xs font-semibold text-foreground">
          {title}
          {props.required ? (
            <span aria-hidden className="text-warning">
              {" *"}
            </span>
          ) : null}
        </p>
        {description ? <p className="text-xs text-foreground/75">{description}</p> : null}
        {hint ? <p className="text-[11px] text-[color:var(--muted)]">{hint}</p> : null}
        {steps ? <div className="min-w-0 pt-1.5 empty:hidden">{steps}</div> : null}
      </div>
    </div>
  );
}
