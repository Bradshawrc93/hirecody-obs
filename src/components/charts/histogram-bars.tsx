"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

/** Latency histogram — generic bucketed bar chart. */
export function HistogramBars({
  data,
}: {
  data: { bucket: string; count: number }[];
}) {
  return (
    <div style={{ width: "100%", height: 200 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#E5DDD0" vertical={false} />
          <XAxis
            dataKey="bucket"
            tick={{ fill: "#6B6B6B", fontSize: 10 }}
            axisLine={{ stroke: "#E5DDD0" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#6B6B6B", fontSize: 11 }}
            axisLine={{ stroke: "#E5DDD0" }}
            tickLine={false}
            width={40}
          />
          <Tooltip
            cursor={{ fill: "rgba(229, 221, 208, 0.5)" }}
            contentStyle={{
              background: "#FAF7F2",
              border: "1px solid #E5DDD0",
              borderRadius: 8,
              fontSize: 12,
              color: "#2B2B2B",
            }}
          />
          <Bar dataKey="count" fill="#C56A2D" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
