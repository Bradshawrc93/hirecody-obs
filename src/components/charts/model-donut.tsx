"use client";

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { providerColor } from "@/lib/utils";

export function ModelDonut({
  data,
}: {
  data: { model: string; value: number; provider: string }[];
}) {
  return (
    <div style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer>
        <PieChart>
          <Tooltip
            contentStyle={{
              background: "#F1F6F2",
              border: "1px solid #C8DCD0",
              borderRadius: 8,
              fontSize: 12,
              color: "#15302A",
            }}
          />
          <Pie
            data={data}
            dataKey="value"
            nameKey="model"
            innerRadius={55}
            outerRadius={90}
            paddingAngle={2}
            stroke="#F1F6F2"
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
