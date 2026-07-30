import NumberFlow, {
  NumberFlowGroup,
  useIsSupported,
  type Format,
  type Trend,
} from "@number-flow/react";

/**
 * Digit-rolling number for values that mutate *in place* — diff stats, staged
 * file counts, progress pairs, live percentages.
 *
 * Only reach for this when the number changes while its container stays
 * mounted. A value that appears once together with its row (a per-file diff
 * stat in a 200-file list, say) gains nothing from the animation and costs a
 * custom element per row, so those keep rendering plain text.
 *
 * Grouping is off by default so the output is byte-identical to the plain
 * `{n}` interpolation these call sites replaced; pass `format` to opt into
 * grouping or compact notation.
 *
 * Where the platform lacks the CSS/Web Animations support number-flow needs
 * (jsdom under test, older WebKit) this degrades to a plain span with the same
 * formatted text. Reduced-motion is *not* handled here: the `<number-flow>`
 * element applies `respectMotionPreference` itself, and the package's
 * `useCanAnimate` dereferences a null MediaQueryList outside its browser build
 * condition, which crashes in vitest.
 */
export function AnimatedNumber({
  value,
  prefix,
  suffix,
  className,
  format,
  trend,
  willChange,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  /** number-flow's narrowed subset of `Intl.NumberFormatOptions`. */
  format?: Format;
  /** `undefined` lets number-flow infer direction from the value change. */
  trend?: Trend;
  /** Set on numbers that animate many times per second (streaming counters). */
  willChange?: boolean;
}) {
  const resolvedFormat: Format = { useGrouping: false, ...format };
  const isSupported = useIsSupported();

  if (!isSupported) {
    const text = new Intl.NumberFormat(undefined, resolvedFormat).format(value);
    return (
      <span className={className}>
        {prefix}
        {text}
        {suffix}
      </span>
    );
  }

  return (
    <NumberFlow
      value={value}
      className={className}
      format={resolvedFormat}
      {...(prefix !== undefined ? { prefix } : {})}
      {...(suffix !== undefined ? { suffix } : {})}
      {...(trend !== undefined ? { trend } : {})}
      {...(willChange !== undefined ? { willChange } : {})}
    />
  );
}

/**
 * Wrap sibling `AnimatedNumber`s so they roll on one shared timing instead of
 * each running its own — use it for pairs like `+12 / -3` or `4/9`.
 */
export const AnimatedNumberGroup = NumberFlowGroup;

/**
 * `done/total` progress pair for the thread docks — todo steps completed,
 * subagents finished, workflow agents done. Both sides roll together, and the
 * separator stays readable so assistive tech still hears "4 / 9".
 */
export function AnimatedFraction({
  value,
  total,
  className = "flex items-center tabular-nums",
}: {
  value: number;
  total: number;
  className?: string;
}) {
  return (
    <AnimatedNumberGroup>
      <span className={className}>
        <AnimatedNumber value={value} />/<AnimatedNumber value={total} />
      </span>
    </AnimatedNumberGroup>
  );
}
