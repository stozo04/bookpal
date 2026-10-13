-- Supabase's default privileges also grant anon (and TRUNCATE/REFERENCES/TRIGGER
-- to authenticated) on new public tables. These tables are owner-only: remove
-- everything, then grant exactly what the app uses.
revoke all on table public.reader_book_details from anon, authenticated;
revoke all on table public.reader_profile from anon, authenticated;

grant select, insert, update, delete on table public.reader_book_details to authenticated;
grant select, insert, update, delete on table public.reader_profile to authenticated;
