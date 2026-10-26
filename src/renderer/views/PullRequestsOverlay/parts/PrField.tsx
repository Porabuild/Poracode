import type { CSSProperties, KeyboardEvent, ReactNode } from "react";

/**
 * One rounded field container with a growing multi-line text area (the text and the
 * placeholder sit vertically centred while it is one line) and an optional trailing
 * control inside it, bottom-aligned as the field grows. The comment composer and the
 * compact title / description editors share it.
 */
export function PrField(props: {
  ariaLabel: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  disabled?: boolean;
  /** A touch-sized field (44px) instead of the desktop one (36px). */
  large?: boolean;
  maxRows: number;
  /** A small control placed inside the container at the trailing edge. */
  trailing?: ReactNode;
  /** Focus the field when it appears (an editor the user just opened). */
  focusOnMount?: boolean;
}) {
  const { large = false } = props;
  return (
    <div
      className={`flex w-full items-end gap-1 rounded-2xl border border-[color:var(--border)] bg-foreground/[0.05] pl-3 pr-1 focus-within:border-accent/60 ${
        large ? "min-h-11" : "min-h-9"
      } ${props.disabled ? "opacity-60" : ""}`}
    >
      <textarea
        aria-label={props.ariaLabel}
        {...(props.placeholder !== undefined ? { placeholder: props.placeholder } : {})}
        value={props.value}
        rows={1}
        disabled={props.disabled === true}
        autoFocus={props.focusOnMount === true} // eslint-disable-line jsx-a11y/no-autofocus -- an editor the user just opened expects focus
        onChange={(event) => props.onChange(event.target.value)}
        {...(props.onKeyDown ? { onKeyDown: props.onKeyDown } : {})}
        className={`min-w-0 flex-1 resize-none bg-transparent text-sm leading-5 text-foreground outline-none placeholder:text-muted/70 ${
          large ? "py-3" : "py-2"
        }`}
        style={
          {
            fieldSizing: "content",
            overflowY: "auto",
            maxHeight: `${props.maxRows * 1.25}rem`,
          } as CSSProperties
        }
      />
      {props.trailing ? (
        <div className="flex shrink-0 items-center pb-1">{props.trailing}</div>
      ) : null}
    </div>
  );
}
