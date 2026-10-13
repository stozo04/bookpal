-- Looked-up words and "catch me up" recaps are saved alongside the other AI notes.
alter table public.reader_ai_notes drop constraint reader_ai_notes_kind_check;
alter table public.reader_ai_notes
  add constraint reader_ai_notes_kind_check
  check (kind in ('cast', 'summary', 'character', 'word', 'recap'));
