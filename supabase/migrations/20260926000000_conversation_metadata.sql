-- Phase 3: remember which tasks a reply referred to, so follow-ups like
-- "move it to Friday" or "2" (answering "Which one?") resolve correctly.
alter table public.conversation_messages
  add column metadata jsonb not null default '{}'::jsonb;
