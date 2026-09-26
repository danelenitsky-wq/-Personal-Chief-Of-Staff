/**
 * Supabase-backed repositories. With a user-session client, row-level
 * security already restricts every query to the signed-in user; the explicit
 * user_id filters below keep service-role callers (WhatsApp webhook, cron)
 * equally safe.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Repositories } from "../types";
import {
  profileToColumns,
  toActivity,
  toConversationMessage,
  toColumns,
  toProfile,
  toProject,
  toReminder,
  toTask,
  toWaitingFor,
} from "./mappers";

type Row = Record<string, unknown>;
type Response = { data: unknown; error: { message: string } | null };

function check(result: Response, what: string): unknown {
  if (result.error) throw new Error(`Database error while ${what}: ${result.error.message}`);
  return result.data;
}

const unwrapRows = (r: Response, what: string) => (check(r, what) ?? []) as Row[];
const unwrapMaybe = (r: Response, what: string) => (check(r, what) ?? null) as Row | null;
function unwrapRow(r: Response, what: string): Row {
  const row = check(r, what);
  if (!row) throw new Error(`Database returned no row while ${what}`);
  return row as Row;
}

export function createSupabaseRepositories(db: SupabaseClient): Repositories {
  return {
    tasks: {
      async list(userId, filter = {}) {
        let query = db.from("tasks").select("*").eq("user_id", userId);
        if (filter.status) query = query.in("status", filter.status);
        if (filter.projectId) query = query.eq("project_id", filter.projectId);
        if (filter.lifeArea) query = query.eq("life_area", filter.lifeArea);
        if (filter.priority) query = query.eq("priority", filter.priority);
        if (filter.context) query = query.eq("context", filter.context);
        if (filter.dueBefore) query = query.lt("due_date", filter.dueBefore);
        if (filter.dueOnOrAfter) query = query.gte("due_date", filter.dueOnOrAfter);
        if (filter.query) query = query.ilike("title", `%${filter.query}%`);
        const rows = unwrapRows(await query.order("created_at"), "listing tasks");
        return rows.map(toTask);
      },
      async get(userId, id) {
        const row = unwrapMaybe(
          await db.from("tasks").select("*").eq("user_id", userId).eq("id", id).maybeSingle(),
          "loading a task",
        );
        return row ? toTask(row) : null;
      },
      async insert(userId, data) {
        const row = unwrapRow(
          await db
            .from("tasks")
            .insert({ ...toColumns(data), user_id: userId })
            .select("*")
            .single(),
          "creating a task",
        );
        return toTask(row);
      },
      async update(userId, id, patch) {
        const row = unwrapMaybe(
          await db
            .from("tasks")
            .update(toColumns(patch))
            .eq("user_id", userId)
            .eq("id", id)
            .select("*")
            .maybeSingle(),
          "updating a task",
        );
        return row ? toTask(row) : null;
      },
      async delete(userId, id) {
        const rows = unwrapRows(
          await db.from("tasks").delete().eq("user_id", userId).eq("id", id).select("id"),
          "deleting a task",
        );
        return rows.length > 0;
      },
    },

    activity: {
      async add(userId, entry) {
        const row = unwrapRow(
          await db
            .from("task_activity")
            .insert({ ...toColumns(entry), user_id: userId })
            .select("*")
            .single(),
          "recording task activity",
        );
        return toActivity(row);
      },
      async listForTask(userId, taskId) {
        const rows = unwrapRows(
          await db
            .from("task_activity")
            .select("*")
            .eq("user_id", userId)
            .eq("task_id", taskId)
            .order("created_at", { ascending: false }),
          "loading task activity",
        );
        return rows.map(toActivity);
      },
    },

    projects: {
      async list(userId, filter) {
        let query = db.from("projects").select("*").eq("user_id", userId);
        if (filter?.status) query = query.in("status", filter.status);
        const rows = unwrapRows(await query.order("created_at"), "listing projects");
        return rows.map(toProject);
      },
      async get(userId, id) {
        const row = unwrapMaybe(
          await db.from("projects").select("*").eq("user_id", userId).eq("id", id).maybeSingle(),
          "loading a project",
        );
        return row ? toProject(row) : null;
      },
      async insert(userId, data) {
        const row = unwrapRow(
          await db
            .from("projects")
            .insert({ ...toColumns(data), user_id: userId })
            .select("*")
            .single(),
          "creating a project",
        );
        return toProject(row);
      },
      async update(userId, id, patch) {
        const row = unwrapMaybe(
          await db
            .from("projects")
            .update(toColumns(patch))
            .eq("user_id", userId)
            .eq("id", id)
            .select("*")
            .maybeSingle(),
          "updating a project",
        );
        return row ? toProject(row) : null;
      },
    },

    waiting: {
      async list(userId, filter) {
        let query = db.from("waiting_for").select("*").eq("user_id", userId);
        if (filter?.status) query = query.in("status", filter.status);
        if (filter?.projectId) query = query.eq("project_id", filter.projectId);
        const rows = unwrapRows(await query.order("created_at"), "listing waiting items");
        return rows.map(toWaitingFor);
      },
      async get(userId, id) {
        const row = unwrapMaybe(
          await db.from("waiting_for").select("*").eq("user_id", userId).eq("id", id).maybeSingle(),
          "loading a waiting item",
        );
        return row ? toWaitingFor(row) : null;
      },
      async insert(userId, data) {
        const row = unwrapRow(
          await db
            .from("waiting_for")
            .insert({ ...toColumns(data), user_id: userId })
            .select("*")
            .single(),
          "creating a waiting item",
        );
        return toWaitingFor(row);
      },
      async update(userId, id, patch) {
        const row = unwrapMaybe(
          await db
            .from("waiting_for")
            .update(toColumns(patch))
            .eq("user_id", userId)
            .eq("id", id)
            .select("*")
            .maybeSingle(),
          "updating a waiting item",
        );
        return row ? toWaitingFor(row) : null;
      },
    },

    reminders: {
      async list(userId, filter) {
        let query = db.from("reminders").select("*").eq("user_id", userId);
        if (filter?.status) query = query.in("status", filter.status);
        const rows = unwrapRows(await query.order("remind_at"), "listing reminders");
        return rows.map(toReminder);
      },
      async insert(userId, data) {
        const row = unwrapRow(
          await db
            .from("reminders")
            .insert({ ...toColumns(data), user_id: userId })
            .select("*")
            .single(),
          "creating a reminder",
        );
        return toReminder(row);
      },
    },

    profiles: {
      async get(userId) {
        const row = unwrapMaybe(
          await db.from("users").select("*").eq("id", userId).maybeSingle(),
          "loading the profile",
        );
        return row ? toProfile(row) : null;
      },
      async findByPhone(phoneNumber) {
        const row = unwrapMaybe(
          await db.from("users").select("*").eq("phone_number", phoneNumber).maybeSingle(),
          "looking up a user by phone",
        );
        return row ? toProfile(row) : null;
      },
      async update(userId, patch) {
        const row = unwrapRow(
          await db
            .from("users")
            .upsert({ ...profileToColumns(patch), id: userId })
            .select("*")
            .single(),
          "updating the profile",
        );
        return toProfile(row);
      },
    },

    conversations: {
      async insert(userId, data) {
        const row = unwrapRow(
          await db
            .from("conversation_messages")
            .insert({ ...toColumns(data), user_id: userId })
            .select("*")
            .single(),
          "storing a conversation message",
        );
        return toConversationMessage(row);
      },
      async update(userId, id, patch) {
        check(
          await db.from("conversation_messages").update(toColumns(patch)).eq("user_id", userId).eq("id", id),
          "updating a conversation message",
        );
      },
      async findByExternalId(externalId) {
        const row = unwrapMaybe(
          await db.from("conversation_messages").select("*").eq("external_id", externalId).maybeSingle(),
          "looking up a conversation message",
        );
        return row ? toConversationMessage(row) : null;
      },
      async listRecent(userId, limit) {
        const rows = unwrapRows(
          await db
            .from("conversation_messages")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(limit),
          "listing conversation messages",
        );
        return rows.map(toConversationMessage);
      },
    },
  };
}
