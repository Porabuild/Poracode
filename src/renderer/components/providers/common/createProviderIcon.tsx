import type { StatusTone } from "../statusTone";
import { StatusIcon } from "../StatusIcon";

interface CreateProviderIconOptions {
  cssPrefix: string;
  path: string;
  viewBox: string;
  fillRule?: "evenodd" | "nonzero";
  secondaryPath?: string;
  defaultTone?: StatusTone;
}

interface ProviderIconProps {
  tone?: StatusTone;
  className?: string;
  title?: string;
}

/**
 * Pre-bake a `mask-image` data URL of the brand path. The shine overlay on
 * the working state uses this to clip a CSS-animated band to the brand
 * outline, so the animation runs entirely on the compositor without per-frame
 * SVG paint. Called once per provider at registration time.
 */
function buildMaskUrl(path: string, viewBox: string, fillRule?: "evenodd" | "nonzero"): string {
  const ruleAttr = fillRule ? ` fill-rule='${fillRule}' clip-rule='${fillRule}'` : "";
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${viewBox}'><path d='${path}' fill='black'${ruleAttr}/></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

export function createProviderIcon(opts: CreateProviderIconOptions) {
  const defaultTone = opts.defaultTone ?? "inactive";
  const maskUrl = buildMaskUrl(opts.path, opts.viewBox, opts.fillRule);
  return function ProviderIcon(props: ProviderIconProps) {
    return (
      <StatusIcon
        cssPrefix={opts.cssPrefix}
        path={opts.path}
        tone={props.tone ?? defaultTone}
        viewBox={opts.viewBox}
        className={props.className}
        maskUrl={maskUrl}
        {...(opts.fillRule ? { fillRule: opts.fillRule } : {})}
        {...(opts.secondaryPath ? { secondaryPath: opts.secondaryPath } : {})}
        {...(props.title ? { title: props.title } : {})}
      />
    );
  };
}
