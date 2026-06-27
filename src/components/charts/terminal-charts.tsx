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
            <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.36} />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis dataKey="issue" tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} domain={[0, 100]} />
        <Tooltip
          contentStyle={{ background: "#090d16", border: "1px solid rgba(255,255,255,.12)", borderRadius: 8, color: "#e2e8f0" }}
          labelStyle={{ color: "#93c5fd" }}
        />
        <Area type="monotone" dataKey="successRate" stroke="#22d3ee" fill="url(#successGradient)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function RuleRankChart({ data }: { data: RankPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 12, top: 12, bottom: 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
        <XAxis type="number" hide domain={[0, 100]} />
        <YAxis type="category" dataKey="name" width={88} tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ background: "#090d16", border: "1px solid rgba(255,255,255,.12)", borderRadius: 8, color: "#e2e8f0" }}
          formatter={(value) => [`${value}%`, "成功率"]}
        />
        <Bar dataKey="successRate" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
