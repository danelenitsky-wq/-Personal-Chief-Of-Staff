import { requireUser } from "@/lib/auth/session";
import { getServices } from "@/lib/container";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectCard } from "@/components/projects/project-card";
import { NewProjectForm } from "@/components/projects/new-project-form";

export default async function ProjectsPage() {
  const user = await requireUser();
  const services = await getServices();
  const [{ today, profile }, projects] = await Promise.all([
    services.profiles.getToday(user.id),
    services.projects.listProjects(user.id),
  ]);
  const active = projects.filter((p) => p.project.status === "active");
  const other = projects.filter((p) => p.project.status !== "active");
  const attention = active.filter((p) => p.needsAttention).length;

  return (
    <>
      <PageHeader
        title="Projects"
        description={
          attention > 0
            ? `${active.length} active · ${attention} need${attention === 1 ? "s" : ""} a next action`
            : `${active.length} active · every project has a next action`
        }
        actions={<NewProjectForm lifeAreas={profile.lifeAreas} />}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {active.map((p) => <ProjectCard key={p.project.id} summary={p} today={today} />)}
      </div>
      {other.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">Paused & completed</h2>
          <div className="grid gap-4 opacity-80 sm:grid-cols-2 xl:grid-cols-3">
            {other.map((p) => <ProjectCard key={p.project.id} summary={p} today={today} />)}
          </div>
        </section>
      )}
    </>
  );
}
