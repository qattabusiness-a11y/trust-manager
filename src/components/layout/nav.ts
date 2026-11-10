import {
  ArrowLeftRight,
  BarChart3,
  Bot,
  CalendarClock,
  Lightbulb,
  LayoutDashboard,
  PiggyBank,
  Settings,
  ShoppingBasket,
  Store,
  Users,
  WalletCards,
} from "lucide-react";
import type { Permission } from "@/types";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  permission?: Permission;
  mobile?: boolean;
}

export const NAV: NavItem[] = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard, mobile: true },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight, permission: "view_transactions", mobile: true },
  { href: "/budget", label: "My Budget", icon: WalletCards, permission: "view_budget", mobile: true },
  { href: "/shopping", label: "Shopping Lists", icon: ShoppingBasket, permission: "view_shopping", mobile: true },
  { href: "/market", label: "Market Intelligence", icon: Store },
  { href: "/savings", label: "Savings & Wealth", icon: PiggyBank, permission: "view_balances" },
  { href: "/bills", label: "Bills & Subscriptions", icon: CalendarClock, permission: "view_budget" },
  { href: "/analytics", label: "Analytics", icon: BarChart3, permission: "view_transactions" },
  { href: "/vision", label: "Vision Ledger", icon: Lightbulb, permission: "view_budget" },
  { href: "/household", label: "Household Members", icon: Users },
  { href: "/advisor", label: "AI Financial Advisor", icon: Bot, permission: "view_advisor" },
  { href: "/settings", label: "Settings", icon: Settings },
];
