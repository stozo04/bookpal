-- AI-made notes about a book, kept so they are made once: the character map
-- (one per book, replaced when the reader asks for an update) and "story so far"
-- summaries (one per place in the book). Owner-only through RLS.

create table public.reader_ai_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  file_id uuid not null,
  kind text not null check (kind in ('cast', 'summary')),
  -- Where in the book the note was made for, e.g. 'Chapter 5' or 'page 40'.
  label text not null check (char_length(label) between 1 and 200),
  progress double precision not null check (progress between 0 and 1),
  content jsonb not null check (pg_column_size(content) <= 200000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, file_id, kind, label),
  foreign key (file_id, user_id)
    references public.library_files(id, user_id)
    on delete cascade
);

create trigger reader_ai_notes_set_updated_at
before update on public.reader_ai_notes
for each row execute function public.set_updated_at();

alter table public.reader_ai_notes enable row level security;

create policy reader_ai_notes_select_own
on public.reader_ai_notes for select
to authenticated
using ((select auth.uid()) = user_id);

create policy reader_ai_notes_insert_own
on public.reader_ai_notes for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy reader_ai_notes_update_own
on public.reader_ai_notes for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy reader_ai_notes_delete_own
on public.reader_ai_notes for delete
to authenticated
using ((select auth.uid()) = user_id);

-- Supabase's default privileges also hand anon (and extras to authenticated)
-- every new public table; keep only what the app uses.
revoke all on table public.reader_ai_notes from anon, authenticated;
grant select, insert, update, delete on table public.reader_ai_notes to authenticated;
