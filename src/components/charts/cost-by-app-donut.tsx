"use client";

import { useRouter } from "next/navigation";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { appColor, formatUsd } from "@/lib/utils";
import type { AppCostPoint } from "@/lib/aggregates";

/** Donut: cost share by app. Click a slice → navigate to app detail. */
export function CostByAppDonut({ data }: { data: AppCostPoint[] }) {
  const router = useRouter();
  return (
    <div style={{ width: "100%", height: 260 }}>
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
            formatter={(v, name) => [formatUsd(Number(v)), String(name)]}
          />
          <Pie
            data={data}
            dataKey="cost"
            nameKey="display_name"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            stroke="#F1F6F2"
            strokeWidth={2}
            onClick={(d) => {
              const slug = (d as unknown as { slug?: string })?.slug;
              if (slug) router.push(`/apps/${slug}`);
            }}
            style={{ cursor: "pointer" }}
          >
            {data.map((d) => (
              <Cell key={d.slug} fill={appColor(d.slug)} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
