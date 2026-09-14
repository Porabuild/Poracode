import type { Ref } from "react";

interface StartTruncatedTextProps {
  children: string;
  className?: string;
  ref?: Ref<HTMLSpanElement>;
}

/** CSS head truncation with LTR text order, including leading path punctuation.
 *  For path-like LTR content only: the inner LTR embedding would flip the run
 *  order of RTL-script prose, so don't reuse it for arbitrary text. */
export function StartTruncatedText({ children, className, ref }: StartTruncatedTextProps) {
  return (
    <span ref={ref} className={`lc-truncate-start ${className ?? ""}`}>
      <bdi dir="ltr">{children}</bdi>
    </span>
  );
}
