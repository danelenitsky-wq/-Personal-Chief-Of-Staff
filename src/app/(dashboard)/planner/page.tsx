import Link from "next/link";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getServices } from "@/lib/container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { PlannerBoard } from "@/components/planner/planner-board";
import { formatShortDate } from "@/lib/dates";

export default async function PlannerPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week: weekParam } = await searchParams;
  const offset = Number.isFinite(Number(weekParam)) ? Math.trunc(Number(weekParam)) : 0;
  const user = await requireUser();
  const week = await (await getServices()).planner.getWeek(user.id, offset);
  const first = week.days[0].date;
  const last = week.days[6].date;

  return (
    <>
      <PageHeader
        title="Weekly planner"
        description="Drag tasks onto the day you'll do them. Planning a day never creates a calendar event or changes a deadline."
        actions={
          <>
            <div className="flex items-center rounded-md border bg-card">
              <Button variant="ghost" size="icon-sm" asChild>
                <Link href={`/planner?week=${offset - 1}`} aria-label="Previous week"><ChevronLeft /></Link>
              </Button>
              <Link href="/planner" className="px-2 text-sm tabular-nums">
                {formatShortDate(first)} – {formatShortDate(last)}
              </Link>
              <Button variant="ghost" size="icon-sm" asChild>
                <Link href={`/planner?week=${offset + 1}`} aria-label="Next week"><ChevronRight /></Link>
              </Button>
            </div>
            <Button variant="outline" disabled title="The planning agent arrives in Phase 7">
              <Sparkles /> Auto plan my week
            </Button>
          </>
        }
      />
      <PlannerBoard week={week} />
    </>
  );
}
