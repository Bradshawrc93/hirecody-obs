"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { formatUsd } from "@/lib/utils";

export type YFormat = "number" | "usd" | "percent";

function formatY(v: number, format: YFormat): string {
  if (format === "usd") return formatUsd(v);
  if (format === "percent") return (v * 100).toFixed(1) + "%";
  return String(v);
}

/** Generic single-series line chart with dark-theme styling. */
export function SimpleLine({
  data,
  xKey,
  yKey,
  yFormat = "number",
  color = "#C56A2D",
  height = 200,
}: {
  data: Array<Record<string, number | string>>;
  xKey: string;
  yKey: string;
  yFormat?: YFormat;
  color?: string;
  height?: number;
}) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#E5DDD0" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fill: "#6B6B6B", fontSize: 11 }}
            tickFormatter={(v) => String(v).slice(5)}
            axisLine={{ stroke: "#E5DDD0" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#6B6B6B", fontSize: 11 }}
            tickFormatter={(v) => formatY(Number(v), yFormat)}
            axisLine={{ stroke: "#E5DDD0" }}
            tickLine={false}
            width={60}
          />
          <Tooltip
            contentStyle={{
              background: "#FAF7F2",
              border: "1px solid #E5DDD0",
              borderRadius: 8,
              fontSize: 12,
              color: "#2B2B2B",
            }}
            formatter={(v) => formatY(Number(v), yFormat)}
          />
          <Line
            type="monotone"
            dataKey={yKey}
            stroke={color}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
