import type { StatusTone } from "./statusTone";
import { syncMaskScanPhase } from "./syncMaskScanPhase";

export function StatusIcon(props: {
  tone: StatusTone;
  path: string;
  viewBox: string;
  fillRule?: "evenodd" | "nonzero";
  cssPrefix: string;
  className?: string | undefined;
  title?: string | undefined;
  /**
   * Optional second path rendered behind `path` at reduced opacity. Useful
   * for two-region brand marks (e.g. OpenCode's frame + inner panel) where
   * a single fill would lose the brand's tonal contrast.
   */
  secondaryPath?: string | undefined;
  /**
   * Inline `mask-image` data URL of the primary brand path, baked by
   * `createProviderIcon` once per provider. Used to clip the working-state
   * shine overlay to the brand outline. Optional so direct callers without a
   * factory still render (they just won't show a shine in `working`).
   */
  maskUrl?: string | undefined;
}) {
  const { tone, path, viewBox, fillRule, cssPrefix, className, title, secondaryPath, maskUrl } =
    props;

  const [, , vbW, vbH] = viewBox.split(" ").map(Number);
  const viewBoxWidth = vbW ?? 16;
  const viewBoxHeight = vbH ?? 16;

  const pathProps = fillRule ? ({ clipRule: fillRule, fillRule } as const) : {};

  return (
    <span
      className={`poracode-provider-icon poracode-provider-icon--${tone} ${cssPrefix} ${cssPrefix}--${tone}${className ? ` ${className}` : ""}`}
    >
      <svg
        aria-hidden={title ? undefined : true}
        className="poracode-provider-icon__svg"
        role={title ? "img" : undefined}
        viewBox={viewBox}
      >
        {title ? <title>{title}</title> : null}
        {tone === "working" ? (
          <path className="poracode-provider-icon__shell" d={path} {...pathProps} />
        ) : null}
        {secondaryPath ? (
          <path className="poracode-provider-icon__shell" d={secondaryPath} {...pathProps} />
        ) : null}
        <path
          className={`poracode-provider-icon__fill${tone === "done" ? " opacity-40" : ""}`}
          d={path}
          {...pathProps}
        />
        {tone === "done" ? (
          <svg
            viewBox="0 0 24 24"
            x={viewBoxWidth * 0.15}
            y={viewBoxHeight * 0.15}
            width={viewBoxWidth * 0.7}
            height={viewBoxHeight * 0.7}
            className="text-success"
          >
            <path
              d="M5 13l4 4L19 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </svg>
      {tone === "working" && maskUrl ? (
        <span
          ref={syncMaskScanPhase}
          className="poracode-provider-icon__mask-scan"
          aria-hidden="true"
          style={{ WebkitMaskImage: maskUrl, maskImage: maskUrl }}
        />
      ) : null}
    </span>
  );
}
