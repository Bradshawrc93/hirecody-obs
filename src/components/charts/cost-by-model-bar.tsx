"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { formatUsd, providerColor } from "@/lib/utils";
import type { ModelPoint } from "@/lib/aggregates";

/** Horizontal bar chart: cost per model, colored by provider. */
export function CostByModelBar({ data }: { data: ModelPoint[] }) {
  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 16, left: 16, bottom: 0 }}
        >
          <CartesianGrid stroke="#1A1A20" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: "#6E6E78", fontSize: 11 }}
            tickFormatter={(v) => formatUsd(Number(v))}
            axisLine={{ stroke: "#222228" }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="model"
            tick={{ fill: "#C4C4CC", fontSize: 11 }}
            axisLine={{ stroke: "#222228" }}
            tickLine={false}
            width={130}
          />
          <Tooltip
            cursor={{ fill: "#1A1A20" }}
            contentStyle={{
              background: "#111114",
              border: "1px solid #1F1F24",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(v) => formatUsd(Number(v))}
          />
          <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
            {data.map((d) => (
              <Cell key={d.model} fill={providerColor(d.provider)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
