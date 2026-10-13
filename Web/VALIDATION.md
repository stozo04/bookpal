# BookPal Web — Validation Ledger

Spec: `docs/WEB_VERSION_BUILD_SPEC.md`. Result is one of `PASS`, `FAIL`,
`BLOCKED`, `SKIPPED (reason)`.

## Ledger

| ID | Phase | Check | Method (exact command or steps) | Result | Evidence | Date |
|----|-------|-------|----------------------------------|--------|----------|------|
| P0-01 | 0 | Backend checks pass | `make backend-check` | PASS | 13 files, 63 tests passed; typecheck clean | 2026-10-12 |
| P0-02 | 0 | Native tests pass | `make reader-test` | PASS | `** TEST SUCCEEDED **` (exit 0) | 2026-10-12 |
| P0-03 | 0 | Local Supabase stack up; 11 migrations | `npx supabase@latest start --workdir Backend` | SKIPPED (owner declined Docker, 2026-10-12) | Owner will verify auth and upload manually with their own Google account | 2026-10-12 |
| P0-04 | 0 | Ledger exists | this file | PASS | `Web/VALIDATION.md` | 2026-10-12 |
| W-01 | 4 | Google sign-in lands on /library for the owner | Manual (owner) + Playwright attached to signed-in Chrome | PASS | Screenshot `validation-artifacts/library.png`; owner confirmed | 2026-10-12 |
| W-02 | 4 | Signed-out requests are refused | `curl /library`, `curl -X POST /api/files/uploads` | PASS | 307 to `/`; 401 | 2026-10-12 |
| W-03 | 4 | Account not on the allowlist is refused | Unit tests (`npm test`, 5 cases) + real Google round trip with `ALLOWED_EMAILS` temporarily set to another address (restored after) | PASS | `/?error=not_invited`, message shown, 0 Supabase cookies; existing session bounced at once; screenshot `refused.png`. Not run with a second human's account | 2026-10-12 |
| W-04 | 6 | EPUB upload end to end | Owner uploaded Accelerando; SQL read-only check | PASS | row `ready`, path `<uid>/<id>/original`, size and type match, sha256 stored | 2026-10-12 |
| W-05 | 6 | Duplicate, bad-file, text, PDF, oversize and retry uploads | `scripts/upload-check.mjs`, `upload-check2.mjs`, SQL read-only checks | PASS | text and PDF stored with exact type and size; repeat upload made no second row; fake PDF, binary .txt, empty and 51 MB files refused; dropped connection then retry gave one row; 0 orphans | 2026-10-12 |
| W-06 | 7 | EPUB renders; contents, themes, size, phone width | `scripts/reader-check.mjs` | PASS | 15 contents entries; no horizontal overflow at 390px; screenshots `reader-*.png` | 2026-10-12 |
| W-07 | 7 | Untrusted EPUB content is inert | iframe audit in `reader-check.mjs` | PASS | 0 scripts, 0 handlers, 0 javascript: links, 0 non-blob images; 0 requests to other hosts | 2026-10-12 |
| W-08 | 7 | Reading place saves and resumes | `scripts/resume-check.mjs`, SQL | PASS | 204 on save; reload returned to Chapter 4; locator has schemaVersion 1 and Mac field names | 2026-10-12 |
| W-09 | 7 | Mac can read a web-written locator | See W-28 | PASS | superseded by W-28 | 2026-10-12 |
| W-10 | 5 | Library shows real cover, title, author, progress | `scripts/shot.mjs /library` | PASS | `library-covers.png` | 2026-10-12 |
| W-11 | 7 | Console message "Blocked script execution in about:srcdoc" | Reproduced with a blank sandboxed iframe; clean Chromium with session cookie (`scripts/clean-reader.mjs`) | PASS | Caused by browser extensions with all-frames content scripts (profile has several). Clean browser: no errors or warnings | 2026-10-12 |
| W-12 | 5 | Rename and delete with typed confirmation | `scripts/manage-check.mjs`, `cleanup-tests.mjs`, SQL | PASS | rename persists; Remove disabled until `DELETE` typed (lowercase rejected); file and row both removed | 2026-10-12 |
| W-13 | 4 | Log out only ends this browser's session | Code review: `signOut({ scope: "local" })` in all three call sites | PASS | Avoids signing the Mac app out. Not exercised against a Mac session | 2026-10-12 |
| W-14 | 7 | Plain text reader: renders, saves and restores place | `scripts/txt-pdf-check.mjs` | PASS | public-domain Alice (170 KB); 300 paragraphs first, more on demand; 9000px before, 8996px after reload | 2026-10-12 |
| W-15 | 7 | PDF reader: selectable text, lazy pages, place, zoom, phone | `scripts/txt-pdf-check.mjs` | PASS | text layer reads the PDF's words; 6 of 110 pages drawn at once; page 7/110 restored; no console errors; zoomed pages scroll inside the reader at 390px | 2026-10-12 |
| W-16 | 7 | Large PDF opens quickly | `scripts/pdf-speed.mjs` | PASS | 24 MB scan: first page 2.1-2.3 s (was 7.5-13.3 s before ranged loading); 10 partial requests; fallback to full download if ranges fail | 2026-10-12 |
| W-17 | 6 | Project storage accepts files of at least 24 MB | 24.2 MB PDF upload | PASS | Real limit not read; owner should confirm under Storage settings | 2026-10-12 |
| W-18 | 7 | Reader regressions after moving to shared chrome | `reader-check.mjs`, `resume-only.mjs` | PASS | audit still clean; no horizontal overflow at 390px; 0 remote requests | 2026-10-12 |
| W-19 | 7 | PDF zoom and EPUB text size are independent settings | Code review of `useReaderPrefs` | PASS | separate stored keys; theme and typeface are shared | 2026-10-12 |
| W-20 | 8 | Connect ChatGPT (Sign in with ChatGPT) | Owner signed in on OpenAI's page; inspected stored record with secrets redacted | PASS | client issued by OpenAI; scopes include `chatgpt.tokens.use.direct`; ID token verified against OpenAI's published keys; file mode 600; tokens never printed | 2026-10-12 |
| W-21 | 8 | Models and reasoning levels come from the account | AI settings page | PASS | 8 models; levels Low to Ultra read from OpenAI; choice saved and shown in the reader | 2026-10-12 |
| W-22 | 8 | Ask about a section and about a selection | `scripts/ask-check.mjs` (real model, owner's plan) | PASS | streamed answers; selected passage becomes the scope; phone bottom sheet; no console errors. Two small plan-usage calls | 2026-10-12 |
| W-23 | 8 | Plan usage only when run locally | `isLocalHost` guard on every AI route | PASS | per OpenAI docs, hosted apps are not eligible; routes return 409 off-localhost. Not exercised on a hosted URL | 2026-10-12 |
| W-24 | 4 | Security headers and strict CSP in a production build | `next build` + `next start`, `curl -I` | PASS | CSP, HSTS, nosniff, frame deny, referrer and permissions policies present; unauthenticated routes redirect or refuse | 2026-10-12 |
| W-25 | 4 | Uploads, EPUB, text and PDF readers work under the strict CSP | Playwright against the production build | PASS | no policy violations; PDF worker, blob images and signed uploads all allowed | 2026-10-12 |
| W-26 | 13 | Initial JS for the sign-in page | gzip of the page's scripts | PASS | 237 KB gzipped (budget 250) | 2026-10-12 |
| W-27 | 13 | Accessibility: axe on library, upload, AI settings, profile and all three readers, light and dark | `scripts/axe-check.mjs` (chapter frame excluded: scripts are forbidden there) | PASS | after darkening quiet grays and the cover label; reader themes covered by `tests/contrast.test.ts` (AAA for reading text, AA for quiet text) | 2026-10-12 |
| W-28 | 7 | Mac decodes the places the web writes | `ReaderTextIndexTests.WebLocatorCompatibilityTests` (2 tests) + `tests/locator.test.ts` | PASS | full native suite: 144 tests, 0 failures, 15 corpus tests skipped | 2026-10-12 |
| W-29 | 5 | Folders: create, duplicate-name refusal, nesting with breadcrumb, move a book, search across folders, cycle prevention, non-empty delete protection | `scripts/folders-check.mjs` (production build) | PASS | 9 of 9 checks; cleaned up afterwards: DB back to 0 folders and the one original book | 2026-10-12 |
| W-30 | 6 | Upload into a chosen folder | `folders-check.mjs` step 8 | PASS | lands in the folder, not the top level | 2026-10-12 |
| W-31 | 5 | PDF first-page covers and metadata title/author | screenshot `library-folders-1.png` | PASS | 110-page scan shows its real cover and author; small PDF shows page one | 2026-10-12 |
| W-32 | 7 | In-book search in EPUB, text and PDF with highlighting | `scripts/search-check.mjs` | PASS | EPUB 49 results, chapter highlight; text 20 results, deep jump highlighted; PDF names the page and highlights; 110-page scan streams first results in 0.4 s; clearing stops it | 2026-10-12 |
| W-33 | 8 | Mac unit suite after all changes | `xcodebuild test` | PASS | 144 tests, 0 failures, 15 corpus tests skipped | 2026-10-12 |
| W-34 | 8 | Appearance saved to the profile (System/Light/Dark), applied without a flash, recovered on a device with no cookie | `scripts/appearance-check.mjs` | PASS | 5 of 5; DB row `reader_profile` | 2026-10-13 |
| W-35 | 5 | Book editor: title, author, description, custom cover (upload, book's own, 4 AI designs) | `scripts/editor-check.mjs` | PASS | cover stored at `<uid>/<id>/cover`, served as JPEG, shown on shelf | 2026-10-13 |
| W-36 | 8 | Summary up to the reader's place, illustration of a selection, cast map, full character profile (real model) | `ai-features-check.mjs`, `saved-notes-check.mjs` | PASS | summary 54 s; illustration 72 s; cast 172 s (16 characters); profile 26 s | 2026-10-13 |
| W-37 | 8 | AI notes are made once and saved: after reload no model calls | `scripts/saved-notes-replay.mjs` | PASS | cast, profile and summary appear instantly; 0 model calls; `reader_ai_notes` rows verified | 2026-10-13 |
| W-38 | 8 | Migrations applied to the shared project (4, additive) | counts before/after; advisor | PASS | +3 tables, +16 policies; no non-Reader change; anon has no access; advisor shows nothing new for Reader tables | 2026-10-13 |
| W-39 | 13 | Accessibility of the new panels, editor, profile and graph; production build with the new routes | `axe-panels.mjs`, `axe-check.mjs`, reader and search regression on a production build | PASS | found and fixed: graph marked as an image with focusable nodes; profile tint taken from the app instead of the reading theme (1.3:1); EPUB bar hiding after resume; all clean in light and dark afterwards | 2026-10-13 |

## Feature parity matrix

| # | Mac feature | Web plan | Phase | Status |
|---|---|---|---|---|
| F1 | Account sign-in | Google sign-in, invite-only | 4 | Done (second-account check pending) |
| F2 | Import PDF/EPUB/TXT | Settings → Upload, drag-and-drop | 6 | Done for EPUB, PDF and TXT |
| F3 | Library grid with covers | Same; client-generated covers | 5 | EPUB and PDF covers done; TXT uses the typographic cover |
| F4 | Folders | Create, rename, nest, move, delete | 5 | Done: create, rename, nest, move, delete (empty only) |
| F5 | Library order / reorder | Drag + keyboard reorder | 5 | Not started |
| F6 | Search across library | Title/author filter + in-book search | 5, 7 | Done: shelf search spans folders; in-book search in all three formats |
| F7 | Resume progress | Open at last locator | 7 | EPUB done |
| F8 | PDF reading | pdf.js | 7 | Done |
| F9 | EPUB reading | Owned parser | 7 | Done |
| F10 | TXT reading | Styled text | 7 | Done |
| F11 | Reading themes and type size | Per-book cloud prefs | 7 | Theme and size done (local to browser, not cloud) |
| F12 | Highlights (5 colors) | Annotations table | 8 | Not started |
| F13 | Notes on highlights | Same | 8 | Not started |
| F14 | Ask AI about a selection | Via the owner's ChatGPT plan (local only) | 9 | Done |
| F15 | Chat with scopes | SSE chat panel | 9 | Done: selection and section/page scopes; whole-book scope not built; conversations not saved |
| F16 | Simplify difficult passage | Inline rewrite | 9 | Not started |
| F17 | Saved conversations | Cloud-saved per book | 9 | Not started |
| F18 | Side-by-side workspace | Split panes / bottom sheet | 10 | Not started |
| F19 | Dictionary | AI definition | 10 | Not started |
| F20 | In-app web browser | Adapted: new tab | 10 | Not started |
| F21 | Catalog search / Read now | Optional | 11 | Not started |
| F22 | Account deletion | Settings → Account | 12 | Not started |
| F23 | Cloud sync status | Per-book status | 6 | Not started |

## Human items outstanding

- **H1** Withdrawn: owner does not want Docker.

## Decision: no local stack (2026-10-12)

The owner chose manual verification with their own Google account over a
local or test database. Consequences, so they are not lost:

- DB-dependent automated checks (RLS isolation §4.3, backend integration
  against real Postgres, Playwright E2E needing Supabase) are `SKIPPED
  (owner decision)`. They are **not** PASS, and R3 isolation is unproven by
  automation. Mitigation: unit tests with mocked clients, SQL review of
  every policy, and the Supabase security advisor after migrations.
- Every remote migration still needs the owner's explicit approval (§3.2).
- Manual checks the owner runs: Google sign-in, upload, AI answer, and a
  second Google account getting "Not invited".
