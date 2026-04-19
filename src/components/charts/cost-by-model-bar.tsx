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
            dataKey="model"
            tick={{ fill: "#15302A", fontSize: 11 }}
            axisLine={{ stroke: "#C8DCD0" }}
            tickLine={false}
            width={130}
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
