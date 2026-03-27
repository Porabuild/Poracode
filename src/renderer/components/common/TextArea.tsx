import {
  TextArea as HeroTextArea,
  type TextAreaProps as HeroTextAreaProps,
} from "@heroui/react";
import { forwardRef } from "react";

export interface TextAreaProps extends HeroTextAreaProps {
  /** Grow/shrink to fit content (CSS field-sizing: content). */
  autoSize?: boolean;
  /** Max visible rows before scrolling. Only applies when autoSize is true. */
  maxRows?: number;
}

const sizingStyle = (maxRows: number | undefined): Record<string, string> => {
  const s: Record<string, string> = {
    "field-sizing": "content",
    resize: "none",
    "overflow-y": maxRows != null ? "auto" : "hidden",
  };
  if (maxRows != null) s["max-height"] = `${maxRows}lh`;
  return s;
};

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ autoSize, maxRows, style, ...props }, ref) => {
    if (!autoSize) {
      // Avoid passing style={undefined} with exactOptionalPropertyTypes
      if (style == null) return <HeroTextArea ref={ref} {...props} />;
      return <HeroTextArea ref={ref} style={style} {...props} />;
    }

    const sizing = sizingStyle(maxRows);

    // style can be a CSSProperties object or a render function
    const merged: NonNullable<HeroTextAreaProps["style"]> =
      typeof style === "function"
        ? (renderProps) => ({
            ...sizing,
            ...style(renderProps),
          })
        : { ...sizing, ...style };

    return <HeroTextArea ref={ref} style={merged} {...props} />;
  },
);

TextArea.displayName = "TextArea";
