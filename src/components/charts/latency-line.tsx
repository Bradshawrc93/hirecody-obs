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
          <CartesianGrid stroke="#E5DDD0" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "#6B6B6B", fontSize: 11 }}
            tickFormatter={(v) => String(v).slice(5)}
            axisLine={{ stroke: "#E5DDD0" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#6B6B6B", fontSize: 11 }}
            tickFormatter={(v) => formatMs(Number(v))}
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
            formatter={(v, name) => [formatMs(Number(v)), String(name)]}
          />
          <Line
            type="monotone"
            dataKey="p50"
            stroke="#2B2B2B"
            strokeWidth={2}
            dot={false}
            name="p50"
          />
          <Line
            type="monotone"
            dataKey="p95"
            stroke="#C56A2D"
            strokeWidth={1.5}
            dot={false}
            name="p95"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
