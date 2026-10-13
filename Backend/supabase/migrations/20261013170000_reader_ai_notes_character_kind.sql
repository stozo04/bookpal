-- Character profiles are saved alongside the cast map and summaries.
alter table public.reader_ai_notes drop constraint reader_ai_notes_kind_check;
alter table public.reader_ai_notes
  add constraint reader_ai_notes_kind_check
  check (kind in ('cast', 'summary', 'character'));
