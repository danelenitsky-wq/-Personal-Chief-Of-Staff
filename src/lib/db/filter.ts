import type { Task } from "@/types/domain";
import type { TaskFilter } from "@/lib/validation/schemas";

/** In-process equivalent of the SQL filter, used by the memory repository. */
export function matchesTaskFilter(task: Task, filter: TaskFilter = {}): boolean {
  if (filter.status && !filter.status.includes(task.status)) return false;
  if (filter.projectId && task.projectId !== filter.projectId) return false;
  if (filter.lifeArea && task.lifeArea !== filter.lifeArea) return false;
  if (filter.priority && task.priority !== filter.priority) return false;
  if (filter.context && task.context !== filter.context) return false;
  if (filter.dueBefore && !(task.dueDate && task.dueDate < filter.dueBefore)) return false;
  if (filter.dueOnOrAfter && !(task.dueDate && task.dueDate >= filter.dueOnOrAfter)) return false;
  if (filter.query && !task.title.toLowerCase().includes(filter.query.toLowerCase())) return false;
  return true;
}
