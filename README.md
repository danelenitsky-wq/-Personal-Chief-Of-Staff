# Chief of Staff

A personal AI Chief of Staff: a WhatsApp agent and a web dashboard over one
shared Supabase database. This repository is at **Phase 3: AI task capture**.

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
   - Dashboard: SQL Editor → paste each file in `supabase/migrations/` in name order → Run.
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

## WhatsApp (Phase 2)

`POST /api/whatsapp` receives Meta webhooks; `GET /api/whatsapp` answers the
verification handshake. For each message it: ignores redeliveries (same
`wamid`), finds the user by `users.phone_number`, stores the message in
`conversation_messages`, replies (see Phase 3 below), and stores the reply.

- Every POST must carry a valid `X-Hub-Signature-256` (HMAC of the raw body
  with `WHATSAPP_APP_SECRET`). In production, requests are refused if the
  secret is not set.
- Without `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` replies are a
  dry run: logged, stored, not sent.
- Logs are JSON lines; tokens are redacted and phone numbers masked.

Try it locally (demo mode already has a user with the fictional number +15550100001):

```bash
WHATSAPP_VERIFY_TOKEN=dev WHATSAPP_APP_SECRET=dev npm run dev
WHATSAPP_VERIFY_TOKEN=dev node scripts/simulate-whatsapp.mjs --verify
WHATSAPP_APP_SECRET=dev node scripts/simulate-whatsapp.mjs "Call the doctor tomorrow"
```

### Connecting a real WhatsApp number

1. Deploy somewhere public with HTTPS (Vercel: import the repo, add the env
   vars from `.env.example`, deploy). Meta cannot reach localhost; for local
   testing a tunnel such as `ngrok http 3000` also works.
2. https://developers.facebook.com → My Apps → Create app → type **Business**.
   Add the **WhatsApp** product. Meta gives you a free test number.
3. WhatsApp → API Setup: copy the **Phone number ID** into
   `WHATSAPP_PHONE_NUMBER_ID` and the temporary **access token** into
   `WHATSAPP_ACCESS_TOKEN` (it expires after 24h; for a lasting token create a
   System User in Business Settings with `whatsapp_business_messaging`
   permission and generate a permanent token). Under "To", add and verify
   your own phone number as a recipient.
4. App settings → Basic: copy the **App secret** into `WHATSAPP_APP_SECRET`.
5. Pick any random string for `WHATSAPP_VERIFY_TOKEN` and redeploy.
6. WhatsApp → Configuration → Webhook: Callback URL
   `https://<your-app>/api/whatsapp`, Verify token = the same string →
   **Verify and save**. Then under Webhook fields, **Subscribe** to `messages`.
7. In the dashboard, Settings → WhatsApp number: enter your number in
   international format (e.g. +972501234567) and save.
8. Send "hello" from your phone to the test number. You should get a reply,
   and see the exchange in Supabase → `conversation_messages`.


## AI task capture (Phase 3)

Each text message goes through a responder that may only act through four
validated tools in `src/lib/ai/tools.ts`: `createTask`, `searchTasks`,
`completeTask`, `updateTask`. Arguments are checked with Zod, dates may be
relative ("tomorrow", "Friday") and are resolved in the user's time zone, and
every call is scoped to the sender's user id. The model never writes to the
database.

- **With `OPENAI_API_KEY`**: `src/lib/ai/orchestrator.ts` sends the message,
  the last 12 messages, recently mentioned tasks and the next 7 days of open
  tasks to OpenAI with the tool definitions, runs the tool calls (up to 6
  rounds) and replies.
- **Without a key**: `src/lib/ai/rules.ts` handles the core patterns ("Call
  doctor tomorrow", "What do I have tomorrow?", "Done with the doctor", "Move
  it to Friday", several actions joined with "and") through the same tools.

Guarantees in code, not just in the prompt:

- A reply that claims an action ("✓ …") when no tool call changed anything is
  replaced with "I couldn't process that correctly. Try rephrasing it."
- If the AI call fails, the message stays stored (marked failed) and the user
  gets that same reply.
- A similar open task is never silently duplicated; the user is asked first.
- "it" and numbered answers ("2" after "Which one?") are resolved from the
  task ids saved on the previous reply (`conversation_messages.metadata`).
- The detected intent is stored on the inbound message.

To enable the AI, add `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`) to
`.env.local` or your Vercel project's environment variables. Settings →
Connections shows whether it is on.
