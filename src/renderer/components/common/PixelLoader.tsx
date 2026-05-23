import { useEffect, useRef } from "react";

// 3×3 pixel grid:
// 0 1 2
// 3 4 5
// 6 7 8

type Frames = readonly (readonly number[])[];

const PATTERNS = {
  waveLR: [
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
  ],
  waveRL: [
    [2, 5, 8],
    [1, 4, 7],
    [0, 3, 6],
  ],
  waveTB: [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
  ],
  waveBT: [
    [6, 7, 8],
    [3, 4, 5],
    [0, 1, 2],
  ],
  diagTL: [[0], [1, 3], [2, 4, 6], [5, 7], [8]],
  diagBR: [[8], [5, 7], [2, 4, 6], [1, 3], [0]],
  diagTR: [[2], [1, 5], [0, 4, 8], [3, 7], [6]],
  diagBL: [[6], [3, 7], [0, 4, 8], [1, 5], [2]],
  orbit: [[0], [1], [2], [5], [8], [7], [6], [3]],
  snake: [[0], [1], [2], [5], [4], [3], [6], [7], [8]],
  spiral: [[0], [1], [2], [5], [8], [7], [6], [3], [4]],
  checker: [
    [0, 2, 4, 6, 8],
    [1, 3, 5, 7],
  ],
  breathe: [[4], [1, 3, 5, 7], [0, 2, 6, 8], [1, 3, 5, 7]],
  corners: [[0], [2], [8], [6]],
  lRotate: [
    [0, 3, 6, 7],
    [0, 1, 2, 5],
    [1, 2, 5, 8],
    [3, 6, 7, 8],
  ],
  pulse: [[4], [1, 3, 4, 5, 7], [0, 1, 2, 3, 4, 5, 6, 7, 8], [1, 3, 4, 5, 7]],
  scatter: [[0, 5], [2, 7], [1, 6], [4, 8], [3]],
} as const satisfies Record<string, Frames>;

type PatternKey = keyof typeof PATTERNS;
const KEYS = Object.keys(PATTERNS) as PatternKey[];
const SESSION_PATTERN = KEYS[Math.floor(Math.random() * KEYS.length)] ?? "waveLR";

const FLASHY_PATTERNS = new Set<PatternKey>(["checker", "pulse", "scatter"]);
const PATTERN_SPEED_MULTIPLIERS = Object.fromEntries(
  KEYS.map((key) => [key, FLASHY_PATTERNS.has(key) ? 1.35 : 1]),
) as Record<PatternKey, number>;

/** Same Tailwind `size-*` utilities used with Lucide (`<Icon className="size-4" />`). */
const ICON_SIZE_CLASS = {
  xxs: "size-3",
  xs: "size-3.5",
  sm: "size-4",
  md: "size-6",
  lg: "size-8",
} as const;

export interface PixelLoaderProps {
  size?: keyof typeof ICON_SIZE_CLASS;
  color?: string;
  pattern?: PatternKey;
  speed?: number;
  isAnimated?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const MIN_FRAME_MS = 80;
const PIXEL_LOADER_STYLE_VERSION = "pure-css-v3";

function buildPatternStyles(name: PatternKey, frames: Frames): string {
  const rules: string[] = [];
  const F = frames.length;

  for (let rect = 0; rect < 9; rect++) {
    const activeFrames = frames.map((frame) => frame.includes(rect));
    const activeCount = activeFrames.filter(Boolean).length;

    if (activeCount === 0) {
      rules.push(
        `.lightcode-pixel-loader[data-pattern="${name}"] .lightcode-pixel-loader__cell--${rect} { opacity: 0; }`,
      );
    } else if (activeCount === F) {
      rules.push(
        `.lightcode-pixel-loader[data-pattern="${name}"] .lightcode-pixel-loader__cell--${rect} { opacity: 1; }`,
      );
    } else {
      const animName = `lightcode-pixel-anim-${name}-${rect}`;

      rules.push(`@keyframes ${animName} {`);
      for (let f = 0; f < F; f++) {
        let distance = 0;
        while (distance < F && !activeFrames[(f - distance + F) % F]) {
          distance++;
        }

        let opacityValue = 0;
        if (distance === 0) {
          opacityValue = 1.0;
        } else if (distance === 1) {
          opacityValue = 0.45;
        } else if (distance === 2) {
          opacityValue = 0.08;
        } else {
          opacityValue = 0.0;
        }

        const percent = ((f / F) * 100).toFixed(2);
        rules.push(`  ${percent}% { opacity: ${opacityValue}; }`);
      }

      let distanceAtEnd = 0;
      while (distanceAtEnd < F && !activeFrames[(0 - distanceAtEnd + F) % F]) {
        distanceAtEnd++;
      }
      let initialOpacity = 0.0;
      if (distanceAtEnd === 0) {
        initialOpacity = 1.0;
      } else if (distanceAtEnd === 1) {
        initialOpacity = 0.45;
      } else if (distanceAtEnd === 2) {
        initialOpacity = 0.08;
      }

      rules.push(`  100% { opacity: ${initialOpacity}; }`);
      rules.push(`}`);

      rules.push(
        `.lightcode-pixel-loader[data-pattern="${name}"].lightcode-pixel-loader--animated .lightcode-pixel-loader__cell--${rect} {` +
          `  animation-name: ${animName};` +
          `  animation-duration: var(--pixel-loader-duration, 1000ms);` +
          `  animation-delay: var(--pixel-loader-delay, 0s);` +
          `  animation-iteration-count: infinite;` +
          `  animation-timing-function: linear;` +
          `}`,
      );

      rules.push(
        `.lightcode-pixel-loader[data-pattern="${name}"]:not(.lightcode-pixel-loader--animated) .lightcode-pixel-loader__cell--${rect} {` +
          `  opacity: ${activeFrames[0] ? 1 : 0};` +
          `}`,
      );
    }
  }

  return rules.join("\n");
}

function injectPatternStyles(): void {
  if (typeof document === "undefined") return;
  const id = "lightcode-pixel-loader-styles";
  const existing = document.getElementById(id);
  if (
    existing instanceof HTMLStyleElement &&
    existing.dataset.version === PIXEL_LOADER_STYLE_VERSION
  ) {
    return;
  }

  const style = existing instanceof HTMLStyleElement ? existing : document.createElement("style");
  style.id = id;
  style.dataset.version = PIXEL_LOADER_STYLE_VERSION;
  style.textContent = KEYS.map((key) => buildPatternStyles(key, PATTERNS[key])).join("\n");
  if (!style.isConnected) {
    document.head.appendChild(style);
  }
}

let filterIdCounter = 0;

export function PixelLoader({
  size = "sm",
  color,
  pattern,
  speed = 160,
  isAnimated = true,
  className,
  style,
}: PixelLoaderProps) {
  const chosen = useRef(pattern ?? SESSION_PATTERN);
  const filterId = useRef(`px-glow-${filterIdCounter++}`);
  const speedMultiplier = PATTERN_SPEED_MULTIPLIERS[chosen.current] ?? 1;
  const frameMs = Math.max(MIN_FRAME_MS, Math.round(speed * speedMultiplier));
  const offsetMs = useRef(Math.floor(Math.random() * 10_000));

  const fill = color ?? "currentColor";
  const sizeClass = ICON_SIZE_CLASS[size];

  const mergedClass = [
    "lightcode-pixel-loader",
    sizeClass,
    isAnimated && "lightcode-pixel-loader--animated",
    "shrink-0",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    injectPatternStyles();
  }, []);

  const totalDuration = frameMs * PATTERNS[chosen.current].length;
  const customStyle = {
    ...style,
    "--pixel-loader-duration": `${totalDuration}ms`,
    "--pixel-loader-delay": `-${offsetMs.current}ms`,
    "--pixel-loader-color": fill,
  } as React.CSSProperties;

  const s = 100;
  const gap = 10;
  const cell = 26.666;
  const rx = cell * 0.12; // 12% rounded corners

  return (
    <svg
      viewBox={`0 0 ${s} ${s}`}
      overflow="visible"
      className={mergedClass}
      style={customStyle}
      data-pattern={chosen.current}
      aria-label="Loading"
      role="img"
    >
      <defs>
        <filter id={filterId.current} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={13.333} result="innerBlur" />
          <feGaussianBlur in="SourceGraphic" stdDeviation={32} result="outerBlur" />
          <feMerge>
            <feMergeNode in="outerBlur" />
            <feMergeNode in="innerBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter={`url(#${filterId.current})`}>
        {Array.from({ length: 9 }, (_, i) => {
          const col = i % 3;
          const row = Math.floor(i / 3);
          return (
            <rect
              key={i}
              x={col * (cell + gap)}
              y={row * (cell + gap)}
              width={cell}
              height={cell}
              rx={rx}
              ry={rx}
              className={`lightcode-pixel-loader__cell lightcode-pixel-loader__cell--${i}`}
            />
          );
        })}
      </g>
    </svg>
  );
}
