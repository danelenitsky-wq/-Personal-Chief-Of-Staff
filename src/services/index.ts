/**
 * Composition root for the domain layer. The dashboard (server actions and
 * API routes) and, from Phase 2, the WhatsApp agent both get their services
 * from here, so business logic exists exactly once.
 */
import type { Repositories } from "@/lib/db/types";
import { systemClock, type Clock } from "./clock";
import { createCalendarService, mockCalendarProvider, type CalendarProvider } from "./calendar-service";
import { createInsightsService } from "./insights-service";
import { createPlannerService } from "./planner-service";
import { createPlanningService } from "./planning-service";
import { createProfileService } from "./profile-service";
import { createProjectService } from "./project-service";
import { createTaskService } from "./task-service";
import { createWaitingService } from "./waiting-service";

export function createServices(
  repos: Repositories,
  options: { clock?: Clock; calendarProvider?: CalendarProvider } = {},
) {
  const clock = options.clock ?? systemClock;
  const profiles = createProfileService(repos, clock);
  const tasks = createTaskService(repos, profiles, clock);
  const projects = createProjectService(repos);
  const waiting = createWaitingService(repos, profiles, tasks, clock);
  const calendar = createCalendarService(options.calendarProvider ?? mockCalendarProvider);
  const planning = createPlanningService({ repos, profiles, projects, waiting, calendar, clock });
  const planner = createPlannerService({ repos, profiles, tasks, calendar });
  const insights = createInsightsService({ repos, profiles, projects, waiting });
  return { profiles, tasks, projects, waiting, calendar, planning, planner, insights };
}

export type Services = ReturnType<typeof createServices>;
