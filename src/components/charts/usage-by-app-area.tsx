"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

const PALETTE = [
  "#2E7D5B",
  "#5B9378",
  "#6E7FA3",
  "#B04A3B",
  "#8A7F6E",
  "#D9A05B",
  "#5F8CA6",
  "#7A5A8E",
];

export type UsageByAppPoint = Record<string, number | string> & {
  date: string;
};

/**
 * Stacked area chart: per-day usage counts, one stacked series per app.
 * `keys` is the ordered list of app display names that exist as columns
 * on each `data` row.
 */
export function UsageByAppArea({
  data,
  keys,
}: {
  data: UsageByAppPoint[];
  keys: string[];
}) {
  if (keys.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs"
        style={{ color: "var(--fg-dim)", height: 240 }}
      >
        No usage in this range.
      </div>
    );
  }
  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <AreaChart
          data={data}
          margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
        >
          <CartesianGrid stroke="#C8DCD0" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "#4F6B5F", fontSize: 11 }}
            tickFormatter={(v) => String(v).slice(5)}
            axisLine={{ stroke: "#C8DCD0" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#4F6B5F", fontSize: 11 }}
            axisLine={{ stroke: "#C8DCD0" }}
            tickLine={false}
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: "#F6F7F5",
              border: "1px solid #C8DCD0",
              borderRadius: 8,
              fontSize: 12,
              color: "#15302A",
            }}
          />
          {keys.map((k, i) => (
            <Area
              key={k}
              type="monotone"
              dataKey={k}
              stackId="1"
              stroke={PALETTE[i % PALETTE.length]}
              fill={PALETTE[i % PALETTE.length]}
              fillOpacity={0.6}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
