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
          <CartesianGrid stroke="#C8DCD0" vertical={false} />
          <XAxis
            dataKey="bucket"
            tick={{ fill: "#4F6B5F", fontSize: 10 }}
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
            cursor={{ fill: "rgba(229, 221, 208, 0.5)" }}
            contentStyle={{
              background: "#F6F7F5",
              border: "1px solid #C8DCD0",
              borderRadius: 8,
              fontSize: 12,
              color: "#15302A",
            }}
          />
          <Bar dataKey="count" fill="#2E7D5B" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
