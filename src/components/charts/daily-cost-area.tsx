"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { appColor, formatUsd } from "@/lib/utils";
import type { DailyPoint } from "@/lib/aggregates";

/**
 * Stacked area chart: daily cost by app, last N days.
 * One series per app slug. Colors are hashed from slug so they remain
 * stable when new apps appear.
 */
export function DailyCostArea({
  data,
  apps,
}: {
  data: DailyPoint[];
  apps: { slug: string; display_name: string }[];
}) {
  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
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
            tickFormatter={(v) => formatUsd(Number(v))}
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
            formatter={(v, name) => [formatUsd(Number(v)), String(name)]}
          />
          {apps.map((a) => (
            <Area
              key={a.slug}
              type="monotone"
              dataKey={a.slug}
              stackId="cost"
              name={a.display_name}
              stroke={appColor(a.slug)}
              fill={appColor(a.slug)}
              fillOpacity={0.4}
              strokeWidth={1.5}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
