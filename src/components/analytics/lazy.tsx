"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/misc";

/**
 * Charts are loaded on demand: the charting library is the largest piece of
 * JavaScript in the app, so pages paint their numbers first and the charts
 * follow a moment later.
 */
const placeholder = (height: number) => {
  const Loading = () => <Skeleton className="w-full" style={{ height }} />;
  return Loading;
};
const load = () => import("./charts");

export const IncomeExpenseChart = dynamic(() => load().then((m) => m.IncomeExpenseChart), { ssr: false, loading: placeholder(220) });
export const DailyTrendChart = dynamic(() => load().then((m) => m.DailyTrendChart), { ssr: false, loading: placeholder(240) });
export const CategoryDonut = dynamic(() => load().then((m) => m.CategoryDonut), { ssr: false, loading: placeholder(200) });
export const SavingsGrowthChart = dynamic(() => load().then((m) => m.SavingsGrowthChart), { ssr: false, loading: placeholder(220) });
export const WeeklyUtilizationChart = dynamic(() => load().then((m) => m.WeeklyUtilizationChart), { ssr: false, loading: placeholder(220) });
export const PriceHistoryChart = dynamic(() => load().then((m) => m.PriceHistoryChart), { ssr: false, loading: placeholder(220) });
export const ForecastChart = dynamic(() => load().then((m) => m.ForecastChart), { ssr: false, loading: placeholder(240) });
