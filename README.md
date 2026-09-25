# Chief of Staff

A personal AI Chief of Staff: a WhatsApp agent and a web dashboard over one
shared Supabase database. This repository is at **Phase 1: Foundation**.

## Quick start (demo mode, no accounts needed)

```bash
npm install
npm run dev          # http://localhost:3000
```

Without Supabase environment variables the app runs in **demo mode**: an
in-memory store seeded with realistic data (dates are relative to today, in
Asia/Jerusalem, weeks starting Sunday). Every change you make works, but it
resets when the server restarts.

## Checks

```bash
npm run typecheck    # tsc --noEmit (strict)
npm run lint
npm test             # vitest, 40 tests, no network or DB needed
npm run build
```

## Connecting Supabase

1. Create a project at https://supabase.com (free tier is fine).
2. Apply the schema, either:
   - Supabase CLI: `npx supabase link --project-ref <ref>` then `npx supabase db push`, or
   - Dashboard: SQL Editor → paste `supabase/migrations/20260925000000_initial_schema.sql` → Run.
3. Authentication → Providers: keep **Email** enabled. Authentication → URL
   Configuration: set Site URL to your app URL and add
   `http://localhost:3000/auth/callback` to Redirect URLs (magic links).
4. Project Settings → API: copy the URL, `anon` key and `service_role` key into
   `.env.local` (see `.env.example`).
5. Create your user: Authentication → Users → Add user (or use the magic link on
   `/login`). A profile row in `public.users` is created automatically.
6. `npm run dev` and sign in. The dashboard now reads and writes Supabase, with
   row-level security limiting every query to your own rows.

## Architecture

```
Dashboard (server components, server actions)   REST API (/api/*)   WhatsApp webhook (Phase 2)
                        \                            |                  /
                         +-------- src/services (domain logic, Zod validation) --------+
                                                     |
                                    src/lib/db (repository interfaces)
                                     /                               \
                     Supabase repositories (RLS)          In-memory repositories (tests, demo)
```

- **One source of business logic.** Pages, server actions and API routes only
  call `getServices()`; they never touch the database. The Phase 3 AI tools
  will call the same services.
- **Every write is validated** by the Zod schemas in `src/lib/validation`.
- **Every repository method takes `userId`** and filters by it, on top of RLS,
  so service-role code paths (webhook, cron) are equally safe.

## Decisions worth knowing

- **`planned_date` on tasks.** The brief's Task model has only `dueDate`. The
  Weekly Planner needs "the day I'll do it" separately from "the deadline",
  otherwise dragging a task to Tuesday would silently move its deadline.
- **`postpone_count` and `task_activity`.** Needed for "most postponed tasks",
  for not re-recommending tasks you keep pushing, and for the side panel's
  activity history.
- **Completing a project's Next Action promotes the oldest open task** in that
  project. With none left, the project shows "Needs attention".
- **Duplicate detection is lexical for now** (`src/services/similarity.ts`).
  The service contract stays the same when it moves to embeddings.
- **Top 3 and priority scoring are deterministic** (`planning-service.ts`);
  the AI planning agent in Phase 6 builds on them. Scores are never shown.
- **Calendar data is mocked** (`calendar-service.ts`) behind a
  `CalendarProvider` interface that the Google provider will implement.
