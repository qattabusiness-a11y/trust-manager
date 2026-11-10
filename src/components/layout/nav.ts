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
import type { MessageKey } from "@/i18n";
import type { Permission } from "@/types";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  permission?: Permission;
  mobile?: boolean;
  /** Short label for the phone bottom bar. */
  short?: string;
  /** Translation keys. */
  t: MessageKey;
  tShort?: MessageKey;
}

export const NAV: NavItem[] = [
  { href: "/overview", label: "Overview", short: "Home", icon: LayoutDashboard, mobile: true, t: "nav.overview", tShort: "nav.short.overview" },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight, permission: "view_transactions", mobile: true, t: "nav.transactions", tShort: "nav.short.transactions" },
  { href: "/budget", label: "My Budget", short: "Budget", icon: WalletCards, permission: "view_budget", mobile: true, t: "nav.budget", tShort: "nav.short.budget" },
  { href: "/shopping", label: "Shopping Lists", short: "Shopping", icon: ShoppingBasket, permission: "view_shopping", mobile: true, t: "nav.shopping", tShort: "nav.short.shopping" },
  { href: "/market", label: "Market Intelligence", icon: Store, t: "nav.market" },
  { href: "/savings", label: "Savings & Wealth", icon: PiggyBank, permission: "view_balances", t: "nav.savings" },
  { href: "/bills", label: "Bills & Subscriptions", icon: CalendarClock, permission: "view_budget", t: "nav.bills" },
  { href: "/analytics", label: "Analytics", icon: BarChart3, permission: "view_transactions", t: "nav.analytics" },
  { href: "/vision", label: "Vision Ledger", icon: Lightbulb, permission: "view_budget", t: "nav.vision" },
  { href: "/household", label: "Household Members", icon: Users, t: "nav.household" },
  { href: "/advisor", label: "AI Financial Advisor", icon: Bot, permission: "view_advisor", t: "nav.advisor" },
  { href: "/settings", label: "Settings", icon: Settings, t: "nav.settings" },
];
