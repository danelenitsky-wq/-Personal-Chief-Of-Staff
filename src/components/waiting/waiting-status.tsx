import type { WaitingView } from "@/services/waiting-service";
import { Badge } from "@/components/ui/badge";
import { formatDayLabel } from "@/lib/dates";

export function WaitingStatus({ item, today }: { item: WaitingView; today: string }) {
  if (item.status === "completed") return <Badge variant="success">Replied</Badge>;
  if (item.overdue) return <Badge variant="high">{item.daysOverdue}d overdue</Badge>;
  if (item.expectedBy) return <Badge variant="outline">Expected {formatDayLabel(item.expectedBy, today)}</Badge>;
  return <Badge variant="low">No date</Badge>;
}
