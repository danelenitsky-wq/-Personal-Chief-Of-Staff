import {
  CalendarDays,
  CheckSquare,
  FolderKanban,
  Hourglass,
  LineChart,
  Settings,
  Sun,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Today", icon: Sun },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/planner", label: "Weekly Planner", icon: CalendarDays },
  { href: "/waiting", label: "Waiting", icon: Hourglass },
  { href: "/insights", label: "Insights", icon: LineChart },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isActivePath(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
