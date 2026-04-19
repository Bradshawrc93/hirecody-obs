"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { formatUsd } from "@/lib/utils";

export type ValueByAppPoint = {
  app: string;
  value_usd: number;
  spend_usd: number;
};

/** Horizontal bar chart: estimated $ value delivered per app, sorted desc. */
export function ValueByAppBar({ data }: { data: ValueByAppPoint[] }) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs"
        style={{ color: "var(--fg-dim)", height: 220 }}
      >
        No app has a $/thumbs-up value configured yet.
      </div>
    );
  }
  const sorted = [...data].sort((a, b) => b.value_usd - a.value_usd);
  return (
    <div style={{ width: "100%", height: Math.max(160, sorted.length * 36) }}>
      <ResponsiveContainer>
        <BarChart
          data={sorted}
          layout="vertical"
          margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
        >
          <CartesianGrid stroke="#C8DCD0" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: "#4F6B5F", fontSize: 11 }}
            tickFormatter={(v) => formatUsd(Number(v))}
            axisLine={{ stroke: "#C8DCD0" }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="app"
            tick={{ fill: "#15302A", fontSize: 11 }}
            axisLine={{ stroke: "#C8DCD0" }}
            tickLine={false}
            width={140}
          />
          <Tooltip
            cursor={{ fill: "rgba(229, 221, 208, 0.5)" }}
            contentStyle={{
              background: "#F1F6F2",
              border: "1px solid #C8DCD0",
              borderRadius: 8,
              fontSize: 12,
              color: "#15302A",
            }}
            formatter={(v, name) => [
              formatUsd(Number(v)),
              name === "value_usd" ? "Value" : "Spend",
            ]}
          />
          <Bar dataKey="value_usd" fill="#5B9378" radius={[0, 4, 4, 0]} />
          <Bar dataKey="spend_usd" fill="#2E7D5B" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
