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
import { formatMs } from "@/lib/utils";
import type { LatencyPoint } from "@/lib/aggregates";

/** Latency overview: p50 bold, p95 light. */
export function LatencyLine({ data }: { data: LatencyPoint[] }) {
  return (
    <div style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#1A1A20" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "#6E6E78", fontSize: 11 }}
            tickFormatter={(v) => String(v).slice(5)}
            axisLine={{ stroke: "#222228" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#6E6E78", fontSize: 11 }}
            tickFormatter={(v) => formatMs(Number(v))}
            axisLine={{ stroke: "#222228" }}
            tickLine={false}
            width={60}
          />
          <Tooltip
            contentStyle={{
              background: "#111114",
              border: "1px solid #1F1F24",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(v, name) => [formatMs(Number(v)), String(name)]}
          />
          <Line
            type="monotone"
            dataKey="p50"
            stroke="#ECECEE"
            strokeWidth={2}
            dot={false}
            name="p50"
          />
          <Line
            type="monotone"
            dataKey="p95"
            stroke="#6E6E78"
            strokeWidth={1.5}
            dot={false}
            name="p95"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
