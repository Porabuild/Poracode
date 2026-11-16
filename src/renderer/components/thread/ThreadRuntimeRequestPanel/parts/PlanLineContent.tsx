import { tokenizePlanInline, type PlanLineView } from "../planLineDisplay";

/** One plan source line with the light Markdown styling from `describePlanLines`. */
export function PlanLineContent(props: { view: PlanLineView }) {
  const { view } = props;
  switch (view.kind) {
    case "blank":
      return <div className="h-5" />;
    case "rule":
      return <div className="my-2.5 border-t border-[var(--hairline)]" />;
    case "heading":
      return (
        <div
          className={`font-semibold text-foreground ${
            view.level === 1 ? "text-base" : view.level === 2 ? "text-[15px]" : "text-[13px]"
          }`}
        >
          <PlanInline text={view.text} />
        </div>
      );
    case "list":
      return (
        <div
          className="flex gap-2 text-[13px] leading-5"
          style={{ paddingLeft: `${view.indent * 1.25}rem` }}
        >
          <span className="shrink-0 text-muted tabular-nums">{view.marker}</span>
          <span className="min-w-0 [overflow-wrap:anywhere]">
            <PlanInline text={view.text} />
          </span>
        </div>
      );
    case "quote":
      return (
        <div className="border-l-2 border-[var(--hairline-strong)] pl-3 text-[13px] leading-5 text-muted">
          <PlanInline text={view.text} />
        </div>
      );
    case "fence":
      return <div className="font-mono text-[11px] leading-5 text-muted/70">{view.text}</div>;
    case "code":
      return (
        <div className="font-mono text-xs leading-5 whitespace-pre-wrap [overflow-wrap:anywhere]">
          {view.text || " "}
        </div>
      );
    case "text":
      return (
        <div className="text-[13px] leading-5 [overflow-wrap:anywhere]">
          <PlanInline text={view.text} />
        </div>
      );
  }
}

function PlanInline(props: { text: string }) {
  return tokenizePlanInline(props.text).map((token, index) =>
    token.kind === "code" ? (
      <code
        key={index}
        className="rounded-md bg-foreground/[0.07] px-1 py-px font-mono text-[12px]"
      >
        {token.text}
      </code>
    ) : token.kind === "strong" ? (
      <strong key={index} className="font-semibold">
        {token.text}
      </strong>
    ) : (
      <span key={index}>{token.text}</span>
    ),
  );
}
