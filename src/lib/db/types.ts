/**
 * Repository contracts. Domain services depend only on these interfaces, so
 * the same business logic runs on Supabase in production and on the
 * in-memory implementation in tests and demo mode.
 *
 * Every method takes userId and must only ever touch that user's rows.
 */
import type {
  ConversationMessage,
  Project,
  ProjectStatus,
  Reminder,
  ReminderStatus,
  Task,
  TaskActivity,
  UserProfile,
  WaitingFor,
  WaitingStatus,
} from "@/types/domain";
import type { TaskFilter } from "@/lib/validation/schemas";

export type NewTask = Omit<Task, "id" | "userId" | "createdAt" | "updatedAt">;
export type TaskPatch = Partial<Omit<Task, "id" | "userId" | "createdAt" | "updatedAt">>;

export interface TaskRepository {
  list(userId: string, filter?: TaskFilter): Promise<Task[]>;
  get(userId: string, id: string): Promise<Task | null>;
  insert(userId: string, data: NewTask): Promise<Task>;
  update(userId: string, id: string, patch: TaskPatch): Promise<Task | null>;
  delete(userId: string, id: string): Promise<boolean>;
}

export type NewActivity = Omit<TaskActivity, "id" | "userId" | "createdAt">;

export interface TaskActivityRepository {
  add(userId: string, entry: NewActivity): Promise<TaskActivity>;
  listForTask(userId: string, taskId: string): Promise<TaskActivity[]>;
}

export type NewProject = Omit<Project, "id" | "userId" | "createdAt" | "updatedAt">;
export type ProjectPatch = Partial<NewProject>;

export interface ProjectRepository {
  list(userId: string, filter?: { status?: ProjectStatus[] }): Promise<Project[]>;
  get(userId: string, id: string): Promise<Project | null>;
  insert(userId: string, data: NewProject): Promise<Project>;
  update(userId: string, id: string, patch: ProjectPatch): Promise<Project | null>;
}

export type NewWaitingFor = Omit<WaitingFor, "id" | "userId" | "createdAt">;
export type WaitingForPatch = Partial<NewWaitingFor>;

export interface WaitingForRepository {
  list(userId: string, filter?: { status?: WaitingStatus[]; projectId?: string }): Promise<WaitingFor[]>;
  get(userId: string, id: string): Promise<WaitingFor | null>;
  insert(userId: string, data: NewWaitingFor): Promise<WaitingFor>;
  update(userId: string, id: string, patch: WaitingForPatch): Promise<WaitingFor | null>;
}

export type NewReminder = Omit<Reminder, "id" | "userId" | "createdAt">;

export interface ReminderRepository {
  list(userId: string, filter?: { status?: ReminderStatus[] }): Promise<Reminder[]>;
  insert(userId: string, data: NewReminder): Promise<Reminder>;
}

export type ProfilePatch = Partial<Omit<UserProfile, "id" | "createdAt">>;

export interface ProfileRepository {
  get(userId: string): Promise<UserProfile | null>;
  /** Exact match on E.164 phone number ("+972..."). */
  findByPhone(phoneNumber: string): Promise<UserProfile | null>;
  update(userId: string, patch: ProfilePatch): Promise<UserProfile>;
}

export type NewConversationMessage = Omit<ConversationMessage, "id" | "userId" | "createdAt">;

export interface ConversationRepository {
  insert(userId: string, data: NewConversationMessage): Promise<ConversationMessage>;
  update(
    userId: string,
    id: string,
    patch: Partial<Pick<ConversationMessage, "processingStatus" | "error" | "intent" | "externalId">>,
  ): Promise<void>;
  findByExternalId(externalId: string): Promise<ConversationMessage | null>;
  listRecent(userId: string, limit: number): Promise<ConversationMessage[]>;
}

export type Repositories = {
  tasks: TaskRepository;
  activity: TaskActivityRepository;
  projects: ProjectRepository;
  waiting: WaitingForRepository;
  reminders: ReminderRepository;
  profiles: ProfileRepository;
  conversations: ConversationRepository;
};
