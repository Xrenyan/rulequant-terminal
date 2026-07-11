"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart } from "recharts";

type TrendPoint = {
  issue: string;
  successRate: number;
};

type RankPoint = {
  name: string;
  successRate: number;
};

export function SuccessTrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ left: -16, right: 8, top: 12, bottom: 0 }}>
        <defs>
          <linearGradient id="successGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--rq-accent)" stopOpacity={0.34} />
            <stop offset="100%" stopColor="var(--rq-accent)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--rq-border)" vertical={false} />
        <XAxis dataKey="issue" tick={{ fill: "var(--rq-muted)", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tick={{ fill: "var(--rq-muted)", fontSize: 11 }} tickLine={false} axisLine={false} domain={[0, 100]} />
        <Tooltip
          contentStyle={{ background: "var(--rq-panel-strong)", border: "1px solid var(--rq-border)", borderRadius: 12, color: "var(--rq-text)", backdropFilter: "blur(20px)" }}
          labelStyle={{ color: "var(--rq-accent-strong)" }}
        />
        <Area type="monotone" dataKey="successRate" stroke="var(--rq-accent)" fill="url(#successGradient)" strokeWidth={2.25} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function RuleRankChart({ data }: { data: RankPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 12, top: 12, bottom: 0 }}>
        <CartesianGrid stroke="var(--rq-border)" horizontal={false} />
        <XAxis type="number" hide domain={[0, 100]} />
        <YAxis type="category" dataKey="name" width={88} tick={{ fill: "var(--rq-muted)", fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ background: "var(--rq-panel-strong)", border: "1px solid var(--rq-border)", borderRadius: 12, color: "var(--rq-text)", backdropFilter: "blur(20px)" }}
          formatter={(value) => [`${value}%`, "成功率"]}
        />
        <Bar dataKey="successRate" fill="var(--rq-accent)" radius={[0, 7, 7, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
