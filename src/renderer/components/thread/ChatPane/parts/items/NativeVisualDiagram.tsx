import { useId } from "react";
import { ScrollShadow } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type {
  NativeVisualDiagram as DiagramSpec,
  NativeVisualTone,
} from "@/shared/nativeVisualsV2";

const TONES: Record<NativeVisualTone, string> = {
  neutral: "var(--border)",
  accent: "var(--native-visual-accent,var(--accent))",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
};
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function lines(text: string, limit: number): string[] {
  const result: string[] = [];
  let line = "";
  let width = 0;
  for (const word of text.trim().split(/\s+/)) {
    const glyphs = [...segmenter.segment(word)].map((item) => item.segment);
    const wordWidth = glyphs.reduce((sum, glyph) => sum + (glyph.length > 1 ? 2 : 1), 0);
    if (line && width + wordWidth + 1 > limit) {
      result.push(line);
      line = "";
      width = 0;
    }
    if (line) {
      line += " ";
      width++;
    }
    for (const glyph of glyphs) {
      const nextWidth = glyph.length > 1 ? 2 : 1;
      if (width + nextWidth > limit) {
        result.push(line);
        line = "";
        width = 0;
      }
      line += glyph;
      width += nextWidth;
    }
  }
  if (line) result.push(line);
  return result;
}

export function NativeVisualDiagram({ block }: { block: DiagramSpec }) {
  const { t } = useLingui();
  const titleId = useId();
  const descriptionId = useId();
  const markerId = useId();
  const horizontal = block.direction === "horizontal";
  const incoming = new Map(block.nodes.map((node) => [node.id, 0]));
  const depths = new Map(block.nodes.map((node) => [node.id, 0]));
  for (const edge of block.edges) incoming.set(edge.to, incoming.get(edge.to)! + 1);
  const ready = block.nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id);
  for (let index = 0; index < ready.length; index++) {
    const id = ready[index]!;
    for (const edge of block.edges.filter((candidate) => candidate.from === id)) {
      depths.set(edge.to, Math.max(depths.get(edge.to)!, depths.get(id)! + 1));
      incoming.set(edge.to, incoming.get(edge.to)! - 1);
      if (incoming.get(edge.to) === 0) ready.push(edge.to);
    }
  }
  const prepared = block.nodes.map((node) => ({
    ...node,
    labelLines: lines(node.label, 17),
    detailLines: node.detail ? lines(node.detail, 18) : [],
  }));
  const cardWidth = 240;
  const cardHeight = Math.max(
    ...prepared.map(
      (node) =>
        32 +
        node.labelLines.length * 17 +
        node.detailLines.length * 15 +
        (node.detailLines.length ? 8 : 0),
    ),
  );
  const levelCount = Math.max(...depths.values()) + 1;
  const levels = Array.from({ length: levelCount }, (_, depth) =>
    prepared.filter((node) => depths.get(node.id) === depth),
  );
  const crossCount = Math.max(...levels.map((level) => level.length));
  const width =
    32 + (horizontal ? levelCount * (cardWidth + 80) - 80 : crossCount * (cardWidth + 24) - 24);
  const height =
    32 + (horizontal ? crossCount * (cardHeight + 24) - 24 : levelCount * (cardHeight + 80) - 80);
  const positioned = levels.flatMap((level, depth) =>
    level.map((node, index) => ({
      ...node,
      x:
        16 +
        (horizontal
          ? depth * (cardWidth + 80)
          : (index + (crossCount - level.length) / 2) * (cardWidth + 24)),
      y:
        16 +
        (horizontal
          ? (index + (crossCount - level.length) / 2) * (cardHeight + 24)
          : depth * (cardHeight + 80)),
    })),
  );
  const byId = new Map(positioned.map((node) => [node.id, node]));
  const description = [
    ...block.nodes.map((node) => (node.detail ? `${node.label}: ${node.detail}` : node.label)),
    ...block.edges.map((edge) => {
      const from = byId.get(edge.from)!.label;
      const to = byId.get(edge.to)!.label;
      return `${t`From ${from} to ${to}`}${edge.label ? `: ${edge.label}` : ""}`;
    }),
  ].join(". ");
  return (
    <ScrollShadow
      tabIndex={0}
      role="region"
      orientation="horizontal"
      aria-label={block.title || t`Relationship diagram`}
      className="max-h-[28rem] overflow-auto rounded-lg border border-border bg-foreground/[0.025] p-2 focus-visible:outline-2 focus-visible:outline-accent"
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block text-muted"
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <title id={titleId}>{block.title || t`Relationship diagram`}</title>
        <desc id={descriptionId}>{description}</desc>
        <defs>
          <marker id={markerId} markerWidth={8} markerHeight={8} refX={7} refY={4} orient="auto">
            <path d="M 0 0 L 8 4 L 0 8 Z" fill="currentColor" />
          </marker>
        </defs>
        {block.edges.map((edge, index) => {
          const from = byId.get(edge.from)!;
          const to = byId.get(edge.to)!;
          const x1 = from.x + (horizontal ? cardWidth : cardWidth / 2);
          const y1 = from.y + (horizontal ? cardHeight / 2 : cardHeight);
          const x2 = to.x + (horizontal ? 0 : cardWidth / 2);
          const y2 = to.y + (horizontal ? cardHeight / 2 : 0);
          const midpoint = horizontal ? (x1 + x2) / 2 : (y1 + y2) / 2;
          const path = horizontal
            ? `M ${x1} ${y1} C ${midpoint} ${y1}, ${midpoint} ${y2}, ${x2 - 2} ${y2}`
            : `M ${x1} ${y1} C ${x1} ${midpoint}, ${x2} ${midpoint}, ${x2} ${y2 - 2}`;
          const labelLines = edge.label ? lines(edge.label, horizontal ? 7 : 11) : [];
          return (
            <g key={index} data-native-edge={`${edge.from}:${edge.to}`}>
              <path
                d={path}
                fill="none"
                stroke="currentColor"
                strokeOpacity={0.55}
                strokeWidth={1.5}
                markerEnd={`url(#${markerId})`}
              />
              {edge.label ? (
                <text
                  x={(x1 + x2) / 2 + (horizontal ? 0 : 6)}
                  y={(y1 + y2) / 2 - 6}
                  textAnchor={horizontal ? "middle" : "start"}
                  fontSize={10}
                  fill="currentColor"
                >
                  <title>{edge.label}</title>
                  {labelLines[0]}
                  {labelLines.length > 1 ? "…" : ""}
                </text>
              ) : null}
            </g>
          );
        })}
        {positioned.map((node) => (
          <g key={node.id} data-native-node={node.id} transform={`translate(${node.x} ${node.y})`}>
            <title>{node.detail ? `${node.label}: ${node.detail}` : node.label}</title>
            <rect
              width={cardWidth}
              height={cardHeight}
              rx={10}
              fill="var(--background)"
              stroke={TONES[node.tone ?? "neutral"]}
            />
            <circle cx={14} cy={16} r={3} fill={TONES[node.tone ?? "accent"]} />
            <text x={12} y={36} fontSize={12} fontWeight={500} fill="var(--foreground)">
              {node.labelLines.map((line, index) => (
                <tspan key={index} x={12} dy={index ? 17 : 0}>
                  {line}
                </tspan>
              ))}
            </text>
            {node.detailLines.length ? (
              <text
                x={12}
                y={36 + node.labelLines.length * 17 + 4}
                fontSize={11}
                fill="currentColor"
              >
                {node.detailLines.map((line, index) => (
                  <tspan key={index} x={12} dy={index ? 15 : 0}>
                    {line}
                  </tspan>
                ))}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </ScrollShadow>
  );
}
