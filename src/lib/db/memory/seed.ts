/**
 * Realistic mock data for demo mode. Dates are generated relative to "today"
 * in the demo user's timezone so the dashboard always looks alive.
 */
import type { Project, Task, UserProfile, WaitingFor } from "@/types/domain";
import { DEFAULT_LIFE_AREAS } from "@/types/domain";
import { addDays, todayIn } from "@/lib/dates";
import type { MemoryStore } from "./store";

export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";
export const DEMO_TIMEZONE = "Asia/Jerusalem";
export const DEMO_PHONE = "+15550100001";

type TaskSeed = Partial<Task> & { title: string };

export function buildDemoStore(now: Date = new Date()): MemoryStore {
  const today = todayIn(DEMO_TIMEZONE, now);
  const day = (offset: number) => addDays(today, offset);
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  const userId = DEMO_USER_ID;

  const profile: UserProfile = {
    id: userId,
    name: "Dany",
    // Fictional number so the webhook can be exercised locally in demo mode.
    phoneNumber: DEMO_PHONE,
    timezone: DEMO_TIMEZONE,
    weekStartsOn: 0,
    morningBriefTime: "07:30",
    eveningReviewEnabled: true,
    weeklyReviewDay: 5,
    workingHoursStart: "09:00",
    workingHoursEnd: "18:00",
    preferredDeepWorkStart: "09:30",
    preferredDeepWorkEnd: "11:30",
    preferredWorkoutStart: "18:30",
    preferredWorkoutEnd: "19:30",
    lifeAreas: [...DEFAULT_LIFE_AREAS],
    createdAt: ago(30),
  };

  const project = (id: string, p: Partial<Project> & { name: string }): Project => ({
    id,
    userId,
    goal: null,
    status: "active",
    lifeArea: null,
    deadline: null,
    nextActionTaskId: null,
    notes: null,
    createdAt: ago(20),
    updatedAt: ago(2),
    ...p,
  });

  const projects: Project[] = [
    project("p-finances", {
      name: "Organize finances",
      goal: "Know where every shekel goes and set up automatic savings",
      lifeArea: "Finance",
      deadline: day(35),
      nextActionTaskId: "t-bank-export",
    }),
    project("p-app", {
      name: "Personal Task Agent",
      goal: "Ship an MVP of my AI chief of staff",
      lifeArea: "Work",
      deadline: day(60),
      nextActionTaskId: null,
      notes: "WhatsApp first, dashboard second.",
    }),
    project("p-apartment", {
      name: "Apartment refresh",
      goal: "Make the living room a place I want to spend evenings in",
      lifeArea: "Home",
      nextActionTaskId: "t-lamp",
    }),
    project("p-half", {
      name: "Half marathon prep",
      goal: "Run the Tel Aviv half under 2 hours",
      lifeArea: "Fitness",
      deadline: day(90),
      nextActionTaskId: "t-long-run",
    }),
    project("p-contract", {
      name: "Ozi contract",
      goal: "Signed consulting contract with Ozi",
      lifeArea: "Work",
      status: "completed",
    }),
  ];

  const task = (id: string, t: TaskSeed): Task => ({
    id,
    userId,
    description: null,
    status: "open",
    priority: "normal",
    lifeArea: null,
    projectId: null,
    dueDate: null,
    dueTime: null,
    plannedDate: null,
    estimatedMinutes: null,
    energyLevel: null,
    context: null,
    postponeCount: 0,
    source: "whatsapp",
    createdAt: ago(5),
    updatedAt: ago(1),
    completedAt: null,
    ...t,
  });

  const tasks: Task[] = [
    task("t-doctor", {
      title: "Book doctor appointment",
      lifeArea: "Health",
      dueDate: day(0),
      estimatedMinutes: 10,
      context: "phone",
      priority: "high",
      energyLevel: "low",
      postponeCount: 2,
      createdAt: ago(9),
    }),
    task("t-wizz", {
      title: "Finish Wizz Air compensation appeal",
      description: "Flight W6 2311 was delayed 4h. Attach boarding passes and the delay confirmation.",
      lifeArea: "Admin",
      dueDate: day(1),
      estimatedMinutes: 30,
      context: "computer",
      priority: "high",
      energyLevel: "medium",
      createdAt: ago(6),
    }),
    task("t-deep", {
      title: "Sketch data model for the task agent",
      lifeArea: "Work",
      projectId: "p-app",
      plannedDate: day(0),
      estimatedMinutes: 60,
      context: "computer",
      energyLevel: "high",
      source: "dashboard",
    }),
    task("t-insurance", {
      title: "Call car insurance about renewal quote",
      lifeArea: "Finance",
      dueDate: day(-2),
      estimatedMinutes: 15,
      context: "phone",
      postponeCount: 3,
      createdAt: ago(14),
    }),
    task("t-bank-export", {
      title: "Export last 3 months of bank transactions",
      lifeArea: "Finance",
      projectId: "p-finances",
      dueDate: day(2),
      estimatedMinutes: 20,
      context: "computer",
    }),
    task("t-budget", {
      title: "Draft monthly budget categories",
      lifeArea: "Finance",
      projectId: "p-finances",
      estimatedMinutes: 45,
      context: "computer",
      source: "dashboard",
    }),
    task("t-ozi", {
      title: "Send Ozi the signed document",
      lifeArea: "Work",
      dueDate: day(0),
      dueTime: "11:00",
      estimatedMinutes: 10,
      context: "computer",
      priority: "high",
    }),
    task("t-mom", {
      title: "Call mom about Friday dinner",
      lifeArea: "Family",
      dueDate: day(0),
      estimatedMinutes: 15,
      context: "phone",
    }),
    task("t-lamp", {
      title: "Buy a floor lamp for the living room",
      lifeArea: "Home",
      projectId: "p-apartment",
      plannedDate: day(3),
      estimatedMinutes: 40,
      context: "outside",
      postponeCount: 4,
      createdAt: ago(21),
      priority: "low",
    }),
    task("t-paint", {
      title: "Pick paint samples",
      lifeArea: "Home",
      projectId: "p-apartment",
      estimatedMinutes: 30,
      context: "outside",
      priority: "low",
    }),
    task("t-long-run", {
      title: "Long run: 14 km easy pace",
      lifeArea: "Fitness",
      projectId: "p-half",
      plannedDate: day(1),
      dueTime: "07:00",
      estimatedMinutes: 85,
      context: "outside",
      energyLevel: "high",
    }),
    task("t-shoes", {
      title: "Replace running shoes",
      lifeArea: "Fitness",
      projectId: "p-half",
      dueDate: day(6),
      estimatedMinutes: 45,
      context: "outside",
    }),
    task("t-scan", {
      title: "Book knee scan",
      lifeArea: "Health",
      dueDate: day(-5),
      estimatedMinutes: 10,
      context: "phone",
      postponeCount: 3,
      createdAt: ago(18),
    }),
    task("t-gift", {
      title: "Order birthday gift for Noa",
      lifeArea: "Relationship",
      dueDate: day(4),
      estimatedMinutes: 20,
      context: "computer",
      priority: "high",
    }),
    task("t-course", {
      title: "Watch module 3 of the Postgres course",
      lifeArea: "Learning",
      estimatedMinutes: 50,
      context: "computer",
      source: "dashboard",
    }),
    task("t-friends", {
      title: "Plan board game night",
      lifeArea: "Friends",
      estimatedMinutes: 15,
      context: "phone",
      priority: "low",
    }),
    task("t-arnona", {
      title: "Pay arnona bill",
      lifeArea: "Admin",
      dueDate: day(5),
      estimatedMinutes: 5,
      context: "computer",
    }),
    task("t-spanish", {
      title: "Learn Spanish basics",
      lifeArea: "Learning",
      status: "someday",
      source: "whatsapp",
    }),
    task("t-japan", {
      title: "Plan Japan trip",
      lifeArea: "Personal",
      status: "someday",
    }),
    task("t-passport", {
      title: "Renew passport",
      lifeArea: "Admin",
      status: "completed",
      completedAt: ago(1),
      estimatedMinutes: 40,
    }),
    task("t-dentist", {
      title: "Dentist cleaning",
      lifeArea: "Health",
      status: "completed",
      completedAt: ago(2),
      estimatedMinutes: 60,
    }),
    task("t-contract", {
      title: "Review contract draft from Ozi",
      lifeArea: "Work",
      projectId: "p-contract",
      status: "completed",
      completedAt: ago(3),
      estimatedMinutes: 30,
    }),
    task("t-savings", {
      title: "Open a high-yield savings account",
      lifeArea: "Finance",
      projectId: "p-finances",
      status: "completed",
      completedAt: ago(4),
      estimatedMinutes: 25,
    }),
    task("t-gym", {
      title: "Cancel old gym membership",
      lifeArea: "Fitness",
      status: "completed",
      completedAt: ago(0.2),
      estimatedMinutes: 10,
    }),
  ];

  const waiting = (id: string, w: Partial<WaitingFor> & { person: string; topic: string }): WaitingFor => ({
    id,
    userId,
    description: null,
    expectedBy: null,
    projectId: null,
    status: "waiting",
    createdAt: ago(5),
    completedAt: null,
    ...w,
  });

  const waitingItems: WaitingFor[] = [
    waiting("w-danny", {
      person: "Danny",
      topic: "Contract feedback",
      description: "Sent the revised contract; need his comments before signing.",
      expectedBy: day(-2),
      createdAt: ago(8),
    }),
    waiting("w-landlord", {
      person: "Landlord",
      topic: "Approval to repaint the living room",
      projectId: "p-apartment",
      expectedBy: day(3),
      createdAt: ago(4),
    }),
    waiting("w-accountant", {
      person: "Accountant (Yael)",
      topic: "2025 tax return summary",
      projectId: "p-finances",
      expectedBy: day(-1),
      createdAt: ago(12),
    }),
    waiting("w-wizz", {
      person: "Wizz Air",
      topic: "Reply to baggage claim",
      createdAt: ago(20),
    }),
    waiting("w-maya", {
      person: "Maya",
      topic: "Photos from the wedding",
      status: "completed",
      completedAt: ago(1),
      createdAt: ago(10),
    }),
  ];

  return {
    tasks,
    activity: tasks.map((t) => ({
      id: `a-${t.id}`,
      userId,
      taskId: t.id,
      kind: "created" as const,
      detail: null,
      source: t.source,
      createdAt: t.createdAt,
    })),
    projects,
    waiting: waitingItems,
    reminders: [],
    profiles: [profile],
    conversations: [],
  };
}
