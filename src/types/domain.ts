/**
 * Shared domain types. These mirror the database schema (snake_case in SQL,
 * camelCase here) and are the only shapes the UI, API routes and (later) the
 * AI tool layer should use.
 */

export const TASK_STATUSES = [
  "open",
  "scheduled",
  "waiting",
  "completed",
  "cancelled",
  "someday",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PRIORITIES = ["high", "normal", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const ENERGY_LEVELS = ["low", "medium", "high"] as const;
export type EnergyLevel = (typeof ENERGY_LEVELS)[number];

export const TASK_CONTEXTS = [
  "phone",
  "computer",
  "home",
  "outside",
  "anywhere",
] as const;
export type TaskContext = (typeof TASK_CONTEXTS)[number];

export const SOURCES = ["whatsapp", "dashboard", "agent"] as const;
export type Source = (typeof SOURCES)[number];

export const DEFAULT_LIFE_AREAS = [
  "Work",
  "Health",
  "Family",
  "Relationship",
  "Fitness",
  "Finance",
  "Home",
  "Personal",
  "Learning",
  "Friends",
  "Admin",
] as const;

export type Task = {
  id: string;
  userId: string;

  title: string;
  description?: string | null;

  status: TaskStatus;
  priority: Priority;
  /** Internal only. Never shown to the user. */
  priorityScore?: number;

  lifeArea?: string | null;
  projectId?: string | null;

  /** Deadline, YYYY-MM-DD in the user's timezone. */
  dueDate?: string | null;
  /** HH:mm in the user's timezone. */
  dueTime?: string | null;
  /**
   * The day the user intends to work on the task (Weekly Planner).
   * Separate from dueDate so planning never silently changes a deadline.
   */
  plannedDate?: string | null;

  estimatedMinutes?: number | null;
  energyLevel?: EnergyLevel | null;
  context?: TaskContext | null;

  /** How many times the due/planned date was pushed later. */
  postponeCount: number;

  source: Source;

  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
};

export const PROJECT_STATUSES = [
  "active",
  "completed",
  "paused",
  "cancelled",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type Project = {
  id: string;
  userId: string;

  name: string;
  goal?: string | null;
  status: ProjectStatus;
  lifeArea?: string | null;
  deadline?: string | null;
  nextActionTaskId?: string | null;
  notes?: string | null;

  createdAt: string;
  updatedAt: string;
};

export const WAITING_STATUSES = ["waiting", "completed", "cancelled"] as const;
export type WaitingStatus = (typeof WAITING_STATUSES)[number];

export type WaitingFor = {
  id: string;
  userId: string;

  person: string;
  topic: string;
  description?: string | null;
  expectedBy?: string | null;
  projectId?: string | null;

  status: WaitingStatus;

  createdAt: string;
  completedAt?: string | null;
};

export const REMINDER_STATUSES = ["pending", "sent", "cancelled"] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export type Reminder = {
  id: string;
  userId: string;
  taskId?: string | null;
  waitingForId?: string | null;
  /** ISO timestamp (UTC). */
  remindAt: string;
  status: ReminderStatus;
  createdAt: string;
};

export type UserProfile = {
  id: string;

  name?: string;
  phoneNumber?: string;

  timezone: string;
  /** 0 = Sunday, 1 = Monday. */
  weekStartsOn: 0 | 1;

  morningBriefTime?: string;
  eveningReviewEnabled: boolean;
  /** 0 = Sunday ... 6 = Saturday */
  weeklyReviewDay: number;

  workingHoursStart?: string;
  workingHoursEnd?: string;

  preferredDeepWorkStart?: string | null;
  preferredDeepWorkEnd?: string | null;

  preferredWorkoutStart?: string | null;
  preferredWorkoutEnd?: string | null;

  lifeAreas: string[];

  createdAt: string;
};

/** Calendar events are read from Google Calendar (Phase 5); mocked for now. */
export type CalendarEvent = {
  id: string;
  title: string;
  /** ISO timestamps */
  start: string;
  end: string;
  allDay?: boolean;
  location?: string | null;
};

export type TaskActivity = {
  id: string;
  taskId: string;
  userId: string;
  kind: "created" | "updated" | "completed" | "reopened" | "postponed" | "deleted";
  detail?: string | null;
  source: Source;
  createdAt: string;
};

export type Memory = {
  id: string;
  userId: string;
  content: string;
  category?: string | null;
  createdAt: string;
};

export type ConversationMessage = {
  id: string;
  userId: string;
  direction: "inbound" | "outbound";
  channel: "whatsapp";
  messageType: "text" | "audio" | "interactive" | "other";
  body?: string | null;
  transcription?: string | null;
  /** WhatsApp message id (wamid); unique, used to ignore redelivered webhooks. */
  externalId?: string | null;
  intent?: string | null;
  processingStatus: "received" | "processed" | "failed";
  error?: string | null;
  metadata?: ConversationMetadata;
  createdAt: string;
};

export type ConversationMetadata = {
  /** Tasks the message referred to (most relevant first). */
  taskIds?: string[];
  /** Options offered in a "Which one?" question, in the order shown. */
  choiceTaskIds?: string[];
  /** What to do with the user's answer to that question. */
  pending?: PendingAction;
};

export type PendingAction =
  | { action: "complete" }
  | { action: "move"; date: string }
  | { action: "create"; title: string; dueDate?: string | null };
