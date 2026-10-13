-- Per-book details the owner can edit (author, description, custom cover) and
-- a small per-user profile (appearance). Additive; owner-only through RLS.

create table public.reader_book_details (
  user_id uuid not null references auth.users(id) on delete cascade,
  file_id uuid not null,
  author text check (author is null or char_length(author) <= 300),
  description text check (description is null or char_length(description) <= 4000),
  -- Set when a custom cover is stored at <user_id>/<file_id>/cover in the
  -- reader-files bucket; null means the app derives a cover itself.
  cover_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, file_id),
  foreign key (file_id, user_id)
    references public.library_files(id, user_id)
    on delete cascade
);

create trigger reader_book_details_set_updated_at
before update on public.reader_book_details
for each row execute function public.set_updated_at();

alter table public.reader_book_details enable row level security;

create policy reader_book_details_select_own
on public.reader_book_details for select
to authenticated
using ((select auth.uid()) = user_id);

create policy reader_book_details_insert_own
on public.reader_book_details for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy reader_book_details_update_own
on public.reader_book_details for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy reader_book_details_delete_own
on public.reader_book_details for delete
to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete
on table public.reader_book_details
to authenticated;

create table public.reader_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  appearance text not null default 'system'
    check (appearance in ('system', 'light', 'dark')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger reader_profile_set_updated_at
before update on public.reader_profile
for each row execute function public.set_updated_at();

alter table public.reader_profile enable row level security;

create policy reader_profile_select_own
on public.reader_profile for select
to authenticated
using ((select auth.uid()) = user_id);

create policy reader_profile_insert_own
on public.reader_profile for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy reader_profile_update_own
on public.reader_profile for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy reader_profile_delete_own
on public.reader_profile for delete
to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete
on table public.reader_profile
to authenticated;
