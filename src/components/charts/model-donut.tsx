"use client";

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { providerColor } from "@/lib/utils";

export function ModelDonut({
  data,
}: {
  data: { model: string; calls: number; provider: string }[];
}) {
  return (
    <div style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer>
        <PieChart>
          <Tooltip
            contentStyle={{
              background: "#111114",
              border: "1px solid #1F1F24",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Pie
            data={data}
            dataKey="calls"
            nameKey="model"
            innerRadius={55}
            outerRadius={90}
            paddingAngle={2}
            stroke="#0A0A0B"
            strokeWidth={2}
          >
            {data.map((d) => (
              <Cell key={d.model} fill={providerColor(d.provider)} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
