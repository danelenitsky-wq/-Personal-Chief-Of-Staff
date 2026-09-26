import Link from "next/link";
import { AlertCircle, ArrowRight, CalendarClock, MessageCircle } from "lucide-react";
import type { ProjectSummary } from "@/services/project-service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatDayLabel } from "@/lib/dates";
import { askAgentLink } from "@/lib/whatsapp/deep-link";
import { cn } from "@/lib/utils";

const STATUS_VARIANT = { active: "accent", paused: "low", completed: "success", cancelled: "outline" } as const;

export function ProjectCard({ summary, today, compact = false }: { summary: ProjectSummary; today: string; compact?: boolean }) {
  const { project, nextAction, needsAttention, progress, openCount, completedCount } = summary;
  return (
    <Card className={cn("flex flex-col gap-4 p-5 transition-shadow hover:shadow-md", needsAttention && "border-warning/50")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/projects/${project.id}`} className="font-medium hover:underline">
            {project.name}
          </Link>
          {!compact && project.goal && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{project.goal}</p>}
        </div>
        {needsAttention ? (
          <Badge variant="warning" className="shrink-0">
            <AlertCircle /> Needs attention
          </Badge>
        ) : (
          <Badge variant={STATUS_VARIANT[project.status]} className="shrink-0 capitalize">
            {project.status}
          </Badge>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
          <span>{completedCount} of {completedCount + openCount} done</span>
          <span>{progress}%</span>
        </div>
        <Progress value={progress} />
      </div>

      <div className="rounded-lg bg-muted/60 px-3 py-2.5">
        <p className="mb-0.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Next action</p>
        {nextAction ? (
          <p className="flex items-center gap-1.5 text-sm">
            <ArrowRight className="size-3.5 shrink-0 text-primary" />
            <span className="truncate">{nextAction.title}</span>
          </p>
        ) : project.status === "active" ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">No next action yet</p>
            <a
              href={askAgentLink(`Help me decide the next action for the ${project.name} project.`)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md bg-card px-2 py-1 text-xs font-medium shadow-xs ring-1 ring-border hover:bg-accent"
            >
              <MessageCircle className="size-3.5 text-success" /> Ask Agent
            </a>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </div>

      {!compact && (
        <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
          <span>{project.lifeArea ?? "No area"}</span>
          {project.deadline && (
            <span className={cn("inline-flex items-center gap-1", project.deadline < today && project.status === "active" && "text-destructive")}>
              <CalendarClock className="size-3" /> {formatDayLabel(project.deadline, today)}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
