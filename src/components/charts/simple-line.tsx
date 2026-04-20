"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { formatUsd } from "@/lib/utils";

export type YFormat = "number" | "usd" | "percent";

function formatY(v: number, format: YFormat): string {
  if (format === "usd") return formatUsd(v);
  if (format === "percent") return (v * 100).toFixed(1) + "%";
  return String(v);
}

/** Generic line chart with dark-theme styling. Pass `series` for multi-line. */
export function SimpleLine({
  data,
  xKey,
  yKey,
  yFormat = "number",
  color = "#2E7D5B",
  height = 200,
  baseline,
  baselineLabel,
  series,
  domain,
}: {
  data: Array<Record<string, number | string>>;
  xKey: string;
  yKey?: string;
  yFormat?: YFormat;
  color?: string;
  height?: number;
  baseline?: number;
  baselineLabel?: string;
  series?: { key: string; label: string; color: string }[];
  domain?: [number | "auto", number | "auto"];
}) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#C8DCD0" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fill: "#4F6B5F", fontSize: 11 }}
            tickFormatter={(v) => String(v).slice(5)}
            axisLine={{ stroke: "#C8DCD0" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#4F6B5F", fontSize: 11 }}
            tickFormatter={(v) => formatY(Number(v), yFormat)}
            axisLine={{ stroke: "#C8DCD0" }}
            tickLine={false}
            width={60}
            domain={domain}
          />
          <Tooltip
            contentStyle={{
              background: "#F6F7F5",
              border: "1px solid #C8DCD0",
              borderRadius: 8,
              fontSize: 12,
              color: "#15302A",
            }}
            formatter={(v) => formatY(Number(v), yFormat)}
          />
          {baseline != null && baseline > 0 ? (
            <ReferenceLine
              y={baseline}
              stroke="#8A7F6E"
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
              label={{
                value: baselineLabel ?? `baseline ${formatY(baseline, yFormat)}`,
                position: "insideTopRight",
                fill: "#4F6B5F",
                fontSize: 10,
              }}
            />
          ) : null}
          {series && series.length > 0 ? (
            series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
              />
            ))
          ) : (
            <Line
              type="monotone"
              dataKey={yKey as string}
              stroke={color}
              strokeWidth={2}
              dot={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
