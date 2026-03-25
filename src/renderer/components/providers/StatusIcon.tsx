import { useId } from "react";
import type { StatusTone } from "./statusTone";

export function StatusIcon(props: {
  tone: StatusTone;
  path: string;
  viewBox: string;
  fillRule?: "evenodd" | "nonzero";
  cssPrefix: string;
  className?: string | undefined;
  title?: string | undefined;
}) {
  const { tone, path, viewBox, fillRule, cssPrefix, className, title } = props;
  const baseId = useId().replaceAll(":", "");
  const clipId = `${baseId}-clip`;
  const gradientId = `${baseId}-gradient`;

  const [, , vbW, vbH] = viewBox.split(" ").map(Number);
  const scanWidth = (vbW ?? 16) * 2;
  const scanHeight = (vbH ?? 16) + 4;

  const pathProps = fillRule ? { clipRule: fillRule, fillRule } as const : {};

  return (
    <span
      className={`${cssPrefix} ${cssPrefix}--${tone}${className ? ` ${className}` : ""}`}
    >
      <svg
        aria-hidden={title ? undefined : true}
        className={`${cssPrefix}__svg`}
        role={title ? "img" : undefined}
        viewBox={viewBox}
      >
        {title ? <title>{title}</title> : null}
        {tone === "working" ? (
          <defs>
            <clipPath id={clipId}>
              <path d={path} {...pathProps} />
            </clipPath>
            <linearGradient id={gradientId} x1="0%" x2="100%" y1="0%" y2="0%">
              <stop offset="0%" stopColor="white" stopOpacity="0" />
              <stop offset="40%" stopColor="white" stopOpacity="0" />
              <stop offset="52%" stopColor="white" stopOpacity="0.98" />
              <stop offset="64%" stopColor="white" stopOpacity="0" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </linearGradient>
          </defs>
        ) : null}
        {tone === "working" ? (
          <path className={`${cssPrefix}__shell`} d={path} {...pathProps} />
        ) : null}
        <path className={`${cssPrefix}__fill`} d={path} {...pathProps} />
        {tone === "working" ? (
          <rect
            className={`${cssPrefix}__scan`}
            clipPath={`url(#${clipId})`}
            fill={`url(#${gradientId})`}
            height={scanHeight}
            width={scanWidth}
            x={-scanWidth}
            y={-2}
          >
            <animate
              attributeName="x"
              dur="1.45s"
              from={-scanWidth}
              repeatCount="indefinite"
              to={vbW}
            />
          </rect>
        ) : null}
      </svg>
    </span>
  );
}
