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
            tickFormatter={(v) => formatMs(Number(v))}
            axisLine={{ stroke: "#C8DCD0" }}
            tickLine={false}
            width={60}
          />
          <Tooltip
            contentStyle={{
              background: "#F6F7F5",
              border: "1px solid #C8DCD0",
              borderRadius: 8,
              fontSize: 12,
              color: "#15302A",
            }}
            formatter={(v, name) => [formatMs(Number(v)), String(name)]}
          />
          <Line
            type="monotone"
            dataKey="p50"
            stroke="#15302A"
            strokeWidth={2}
            dot={false}
            name="p50"
          />
          <Line
            type="monotone"
            dataKey="p95"
            stroke="#2E7D5B"
            strokeWidth={1.5}
            dot={false}
            name="p95"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
