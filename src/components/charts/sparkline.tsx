"use client";

/**
 * Inline SVG sparkline — intentionally tiny and dependency-free so it
 * can be dropped into scorecard rows without dragging Recharts into
 * every render path. Points are normalized to the local max; a flat
 * value shows as a centered line.
 */

export function Sparkline({
  points,
  width = 96,
  height = 24,
  color = "var(--fg-muted)",
}: {
  points: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (points.length === 0) {
    return (
      <svg width={width} height={height} aria-hidden>
        <line
          x1={0}
          x2={width}
          y1={height / 2}
          y2={height / 2}
          stroke={color}
          strokeWidth={1}
          strokeDasharray="2 3"
          opacity={0.4}
        />
      </svg>
    );
  }

  const max = Math.max(...points, 0.0001);
  const min = Math.min(...points, 0);
  const range = Math.max(max - min, 0.0001);

  const step = points.length > 1 ? width / (points.length - 1) : 0;
  const d = points
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.25} />
    </svg>
  );
}
