"use client";

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthlyFinance } from "@/server/dashboard/finance";

function formatShortVnd(value: number): string {
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return String(value);
}

// Aggregation/data-shaping đã làm hết ở server (src/server/dashboard/finance.ts) — component này
// chỉ nhận mảng phẳng và vẽ, không tự fetch.
export function RevenueCostChart({ series }: { series: MonthlyFinance[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="month" fontSize={12} />
          <YAxis fontSize={12} tickFormatter={formatShortVnd} width={48} />
          <Tooltip formatter={(value) => formatShortVnd(Number(value)) + " đ"} />
          <Legend />
          <Bar dataKey="revenue" name="Doanh thu" fill="#16a34a" radius={[4, 4, 0, 0]} />
          <Bar dataKey="cost" name="Chi phí" fill="#dc2626" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProfitTrendChart({ series }: { series: MonthlyFinance[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="month" fontSize={12} />
          <YAxis fontSize={12} tickFormatter={formatShortVnd} width={48} />
          <Tooltip formatter={(value) => formatShortVnd(Number(value)) + " đ"} />
          <Line type="monotone" dataKey="profit" name="Lợi nhuận" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
