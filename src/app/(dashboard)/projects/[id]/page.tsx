import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getServices } from "@/lib/container";
import { NotFoundError } from "@/services/errors";
import { PageHeader } from "@/components/layout/page-header";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ProjectDetailView } from "@/components/projects/project-detail";
import { formatDayLabel } from "@/lib/dates";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const services = await getServices();
  const detail = await services.projects.getProjectDetail(user.id, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [{ today, profile }, projects] = await Promise.all([
    services.profiles.getToday(user.id),
    services.projects.listProjects(user.id, ["active", "paused"]),
  ]);
  const { project } = detail;

  return (
    <>
      <Link href="/projects" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Projects
      </Link>
      <PageHeader
        title={project.name}
        description={project.goal ?? undefined}
        actions={
          <div className="flex items-center gap-3">
            {project.lifeArea && <Badge variant="outline">{project.lifeArea}</Badge>}
            {project.deadline && <Badge variant="outline">Due {formatDayLabel(project.deadline, today)}</Badge>}
            <Badge variant={project.status === "active" ? "accent" : "low"} className="capitalize">{project.status}</Badge>
          </div>
        }
      />
      <div className="mb-8 flex items-center gap-4">
        <Progress value={detail.progress} className="h-2 max-w-md" />
        <span className="text-sm text-muted-foreground tabular-nums">{detail.progress}% · {detail.completedCount} of {detail.completedCount + detail.openCount}</span>
      </div>
      <ProjectDetailView
        detail={detail}
        today={today}
        projects={projects.map((p) => ({ id: p.project.id, name: p.project.name }))}
        lifeAreas={profile.lifeAreas}
      />
    </>
  );
}
