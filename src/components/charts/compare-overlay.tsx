"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { providerColor, formatUsd } from "@/lib/utils";

/**
 * Overlaid line chart: cost-per-call over time, one line per model.
 * Data is passed pre-merged on a continuous day axis.
 */
export function CompareOverlay({
  days,
  models,
}: {
  days: string[];
  models: {
    model: string;
    provider: string;
    cost_per_call_over_time: { date: string; value: number }[];
  }[];
}) {
  // Merge into a { date, model1: value, model2: value, ... } shape.
  const merged = days.map((d) => {
    const row: Record<string, string | number> = { date: d };
    for (const m of models) {
      const point = m.cost_per_call_over_time.find((p) => p.date === d);
      row[m.model] = point?.value ?? 0;
    }
    return row;
  });

  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <LineChart data={merged} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
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
            tickFormatter={(v) => formatUsd(Number(v))}
            axisLine={{ stroke: "#C8DCD0" }}
            tickLine={false}
            width={70}
          />
          <Tooltip
            contentStyle={{
              background: "#F6F7F5",
              border: "1px solid #C8DCD0",
              borderRadius: 8,
              fontSize: 12,
              color: "#15302A",
            }}
            formatter={(v, name) => [formatUsd(Number(v)), String(name)]}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "#4F6B5F" }} />
          {models.map((m) => (
            <Line
              key={m.model}
              type="monotone"
              dataKey={m.model}
              stroke={providerColor(m.provider)}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
