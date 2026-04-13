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
          <CartesianGrid stroke="#1A1A20" vertical={false} />
          <XAxis
            dataKey="bucket"
            tick={{ fill: "#6E6E78", fontSize: 10 }}
            axisLine={{ stroke: "#222228" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#6E6E78", fontSize: 11 }}
            axisLine={{ stroke: "#222228" }}
            tickLine={false}
            width={40}
          />
          <Tooltip
            cursor={{ fill: "#1A1A20" }}
            contentStyle={{
              background: "#111114",
              border: "1px solid #1F1F24",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Bar dataKey="count" fill="#60A5FA" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
