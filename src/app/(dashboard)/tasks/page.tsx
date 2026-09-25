import { requireUser } from "@/lib/auth/session";
import { getServices } from "@/lib/container";
import { PageHeader } from "@/components/layout/page-header";
import { TasksView } from "@/components/tasks/tasks-view";
import { TASK_VIEWS, type TaskView } from "@/services/task-service";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view: requested } = await searchParams;
  const view: TaskView = TASK_VIEWS.includes(requested as TaskView) ? (requested as TaskView) : "today";
  const user = await requireUser();
  const services = await getServices();
  const [{ today, profile }, tasks, counts, projects] = await Promise.all([
    services.profiles.getToday(user.id),
    services.tasks.getTaskView(user.id, view),
    services.tasks.countByView(user.id),
    services.projects.listProjects(user.id, ["active", "paused"]),
  ]);

  return (
    <>
      <PageHeader title="Tasks" description="Everything you've captured, from WhatsApp or here." />
      <TasksView
        view={view}
        counts={counts}
        tasks={tasks}
        projects={projects.map((p) => ({ id: p.project.id, name: p.project.name }))}
        lifeAreas={profile.lifeAreas}
        today={today}
      />
    </>
  );
}
