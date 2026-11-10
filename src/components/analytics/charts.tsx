"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/money";

export const CHART = {
  green: "#16A34A",
  greenLight: "#86EFAC",
  yellow: "#EAB308",
  red: "#DC2626",
  navy: "#172554",
  slate: "#94A3B8",
  grid: "#E2E8F0",
};
const CATEGORY_COLORS = ["#172554", "#16A34A", "#2563EB", "#EAB308", "#0EA5E9", "#9333EA", "#F97316", "#64748B", "#DC2626", "#14B8A6"];

const axis = { fontSize: 11, fill: "#64748B" };
const compact = (cur: string) => (v: number) => formatMoney(v, cur, { compact: true }).replace(`${cur} `, "");

function TooltipBox({ active, payload, label, currency }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; currency: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-lg">
      {label && <p className="mb-1 font-medium text-navy">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-muted">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="money font-medium text-navy">{formatMoney(p.value, currency)}</span>
        </p>
      ))}
    </div>
  );
}

export function IncomeExpenseChart({ data, currency, height = 240 }: { data: { label: string; income: number; expenses: number }[]; currency: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }} barGap={4}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
        <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={compact(currency)} />
        <Tooltip content={<TooltipBox currency={currency} />} cursor={{ fill: "#F1F5F9" }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="income" name="Income" fill={CHART.green} radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="expenses" name="Expenses" fill={CHART.navy} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DailyTrendChart({ data, currency, height = 240 }: { data: { label: string; spent: number; limit: number }[]; currency: string; height?: number }) {
  const limit = data[0]?.limit ?? 0;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="spentFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART.navy} stopOpacity={0.25} />
            <stop offset="100%" stopColor={CHART.navy} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} interval={4} />
        <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={compact(currency)} />
        <Tooltip content={<TooltipBox currency={currency} />} />
        {limit > 0 && <ReferenceLine y={limit} stroke={CHART.yellow} strokeDasharray="4 4" label={{ value: "Daily limit", position: "insideTopRight", fontSize: 10, fill: "#A16207" }} />}
        <Area type="monotone" dataKey="spent" name="Spent" stroke={CHART.navy} strokeWidth={2} fill="url(#spentFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CategoryDonut({ data, currency, height = 240 }: { data: { name: string; amount: number }[]; currency: string; height?: number }) {
  const total = data.reduce((s, d) => s + d.amount, 0);
  const top = data.slice(0, 7);
  const rest = data.slice(7).reduce((s, d) => s + d.amount, 0);
  const rows = rest ? [...top, { name: "Other", amount: rest }] : top;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="amount" nameKey="name" innerRadius="62%" outerRadius="95%" paddingAngle={2} stroke="none">
              {rows.map((_, i) => (
                <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<TooltipBox currency={currency} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] text-muted">This month</span>
          <span className="money text-sm font-semibold">{formatMoney(total, currency, { compact: true })}</span>
        </div>
      </div>
      <ul className="w-full flex-1 space-y-1.5 text-xs">
        {rows.map((r, i) => (
          <li key={r.name} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
            <span className="flex-1 truncate text-navy">{r.name}</span>
            <span className="money text-muted">{total ? Math.round((r.amount / total) * 100) : 0}%</span>
            <span className="money w-24 text-right font-medium">{formatMoney(r.amount, currency)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SavingsGrowthChart({ data, currency, height = 240 }: { data: { label: string; savings: number }[]; currency: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
        <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={compact(currency)} domain={["auto", "auto"]} />
        <Tooltip content={<TooltipBox currency={currency} />} />
        <Line type="monotone" dataKey="savings" name="Savings" stroke={CHART.green} strokeWidth={2.5} dot={{ r: 3, fill: CHART.green }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function WeeklyUtilizationChart({ data, currency, height = 240 }: { data: { label: string; spent: number; limit: number; pct: number }[]; currency: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
        <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={compact(currency)} />
        <Tooltip content={<TooltipBox currency={currency} />} cursor={{ fill: "#F1F5F9" }} />
        {data[0]?.limit ? <ReferenceLine y={data[0].limit} stroke={CHART.navy} strokeDasharray="4 4" label={{ value: "Weekly limit", position: "insideTopRight", fontSize: 10, fill: CHART.navy }} /> : null}
        <Bar dataKey="spent" name="Spent" radius={[4, 4, 0, 0]} maxBarSize={36}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.pct >= 100 ? CHART.red : d.pct >= 70 ? CHART.yellow : CHART.green} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PriceHistoryChart({ data, currency, height = 220 }: { data: { date: string; price: number }[]; currency: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data.map((d) => ({ ...d, label: d.date.slice(5) }))} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
        <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={compact(currency)} domain={["auto", "auto"]} />
        <Tooltip content={<TooltipBox currency={currency} />} />
        <Line type="monotone" dataKey="price" name="Average price" stroke={CHART.navy} strokeWidth={2.5} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ForecastChart({ data, currency, height = 240 }: { data: { label: string; balance: number }[]; currency: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="fcFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART.green} stopOpacity={0.25} />
            <stop offset="100%" stopColor={CHART.green} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} interval={6} />
        <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={compact(currency)} />
        <Tooltip content={<TooltipBox currency={currency} />} />
        <ReferenceLine y={0} stroke={CHART.red} />
        <Area type="monotone" dataKey="balance" name="Projected balance (estimate)" stroke={CHART.green} strokeWidth={2} fill="url(#fcFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
