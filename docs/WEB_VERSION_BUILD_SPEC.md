# BookPal Web — Build Specification

> **Audience:** an AI coding agent (Claude Code, Codex, or similar) working in this
> repository, plus the human owner who reviews its work.
>
> **Goal:** build a web version of the native macOS Reader app so the owner can
> read, highlight, take notes and use the AI features from any browser,
> including on a phone. Each phase checks its own work, and the agent records
> every check.
>
> **How to use this file:** work through the phases **in order**. Do not start
> a phase until the previous phase's *Definition of done* passes and is
> recorded in the validation ledger (§4). If a step needs something only the
> human can provide, follow §3.4. Never fake a pass.

---

## Table of contents

1. [Product summary](#1-product-summary)
2. [Non-negotiable requirements](#2-non-negotiable-requirements)
3. [Rules of engagement for the agent](#3-rules-of-engagement-for-the-agent)
4. [Self-validation system](#4-self-validation-system)
5. [Current system — facts the agent must know](#5-current-system--facts-the-agent-must-know)
6. [Target architecture](#6-target-architecture)
7. [Feature parity matrix](#7-feature-parity-matrix)
8. [Design language — elegant and quaint](#8-design-language--elegant-and-quaint)
9. [Phases](#9-phases)
10. [Test data strategy](#10-test-data-strategy)
11. [Human checkpoints](#11-human-checkpoints)
12. [Final acceptance checklist](#12-final-acceptance-checklist)
13. [Appendix: reference file map](#13-appendix-reference-file-map)

---

## 1. Product summary

The repository holds:

| Part | Folder | Runs on | Status |
|---|---|---|---|
| Native app (Swift/SwiftUI) | `Reader/`, `ReaderTests/`, `Reader.xcodeproj` | macOS | Working |
| Backend API (Hono + TypeScript) | `Backend/` | Vercel project `reader-backend` | Deployed at `https://reader-backend-nine.vercel.app` |
| Database, auth and file storage | `Backend/supabase/migrations/` | Supabase project ref `bqyfplifeyvkilkoneph` (shared — see §3.2) | 11 Reader migrations applied |
| **Web app (this spec)** | **`Web/`** (new) | **New Vercel project `bookpal-web`** | **To build** |

The web app is a **new client** of the **existing backend**. It does not replace
the Mac app, and both share one account, one library and one cloud copy of
each book.

---

## 2. Non-negotiable requirements

These come from the owner. When any other guidance in this file conflicts with
them, these win.

### R1 — Elegant, understated UI/UX
"Elegant and quaint, not over the top." Follow §8 exactly. Calm typography,
generous whitespace, paper-like surfaces, almost no color outside highlights,
and short, purposeful motion. No dashboards, gradients, glassmorphism, or
emoji in the UI chrome.

### R2 — Upload from Settings → Upload
- A **Settings** area containing an **Upload** section.
- From there, the owner picks files from anywhere their device allows: a
  Finder/file picker on the Mac, the Files app on iPhone, or drag-and-drop on
  desktop.
- Files go to the private **`reader-files`** storage bucket through the
  existing upload flow (§5.4). This cloud copy is the **source of truth**.
- Supported types match the backend: **EPUB, PDF, TXT** (`application/epub+zip`,
  `application/pdf`, `text/plain`).
- Upload many files at once, with per-file progress, retry, duplicate
  detection (SHA-256) and clear errors.
- After upload, the book appears in the library and is automatically prepared
  for AI ("knowledge ingestion", §5.5).

### R3 — Google sign-in, invite-only, strict per-user isolation
- Sign-in is **Google only** on the web. There is **no open sign-up**.
- **Only the owner's Google account may sign in at launch.** The owner's
  email is **not** written in this repository, which is public. It is
  configured as data (§9, Phase 2) and supplied by the human.
- The design must support **inviting family members later** without code
  changes: an allowlist stored as data, not hardcoded.
- **Every book and every sub-feature belongs to exactly one user**: files,
  folders, reading progress, highlights, notes, AI conversations, AI
  knowledge, preferences and storage objects. No user can ever see, change or
  infer another user's data. The checks run at four layers (database RLS,
  storage policies, backend API, UI), and isolation tests are mandatory
  (§4.3).

---

## 3. Rules of engagement for the agent

### 3.1 Repository rules (from `AGENTS.md`, `Backend/AGENTS.md`, `CLAUDE.md`)
- Read `README.md`, `SETUP.md`, `AGENTS.md` and `Backend/AGENTS.md` before
  starting.
- Work on a **feature branch** per phase (`web/phase-N-<slug>`) and open a
  pull request into `main` of `stozo04/bookpal`. Do **not** merge; the owner
  merges.
- When an API contract changes, update **both** `Backend/` and the Mac client
  in `Reader/Networking`, or prove the change is purely additive and the Mac
  client is unaffected. Record that proof in the PR.
- Database changes are **additive migrations only**, in
  `Backend/supabase/migrations/`, named `YYYYMMDDHHMMSS_<slug>.sql`.
- **High-risk architecture rule:** adding a rendering engine, persistence
  framework or locator schema requires testing against `TestCorpus/`,
  documenting macOS/iOS/web implications, recording licensing and exit costs,
  and a decision record (Phase 1 does this).
- Never commit credentials, `.env*` files, `.vercel/`, personal emails or
  service links.
- Run the relevant checks (`make backend-check`, `make reader-test`, and the
  new `make web-check`) before handing work back.

### 3.2 The Supabase project is SHARED — extreme care required
The Reader tables live inside the owner's **"My Daily Journal"** Supabase
project, which also runs an unrelated personal assistant app (about 60
tables, its own users, its own storage buckets).

The agent **must not**:
- run `supabase db push`, `supabase db reset`, or any `migration repair`
  against the remote project. The remote migration history contains entries
  this repo doesn't know about, so `db push` would refuse, and "repairing" it
  would corrupt the other app's history;
- create, alter or drop anything that is not Reader-owned (Reader-owned means
  the tables, functions and policies created by files in
  `Backend/supabase/migrations/`, the `catalog`/`catalog_ingest` schemas, and
  the `reader-files`/`reader-catalog-files` buckets);
- add Supabase **Auth hooks** (such as a "before user created" hook),
  change the **Site URL**, or disable auth providers. These are project-wide
  and would break the other app;
- create test users in the remote project (use the local stack, §10);
- print, log or commit `SUPABASE_SECRET_KEY` or the service-role key.

**How to apply a migration to the remote project** (the only approved method):
1. Get the owner's explicit approval for that specific migration.
2. Apply it in a single transaction:
   `begin; <file contents>; insert into supabase_migrations.schema_migrations (version, name) values ('<version>', '<name>'); commit;`
3. Verify with read-only queries that the objects exist and that non-Reader
   object counts are unchanged.
4. Run the Supabase security advisor and confirm no **new** Reader findings.

### 3.3 "Getting around blocks" — what is and isn't allowed
The owner allows the agent to **create its own test data** to keep moving.
That means:

✅ **Allowed:** seeding a **local** Supabase stack; creating synthetic test
users locally; generating synthetic EPUB/PDF/TXT fixtures; downloading
public-domain books listed in `TestCorpus/manifest.json`; using a
deterministic **fake AI provider** in tests; using a test-only email/password
sign-in path that is **impossible in production** (§10.3); and mocking
Google OAuth locally.

❌ **Never allowed, even to get unblocked:** disabling RLS or storage
policies; widening an allowlist in production; shipping a test sign-in path
in a production build; using the secret key in browser code; writing to
non-Reader objects in the shared database; deploying to production without
the owner's approval; committing copyrighted books; bypassing Claude Code
permission or safety prompts; marking a check as passed without running it.

If a block can't be removed legitimately, **stop that item**, record it as
`BLOCKED` in the ledger with the reason and the exact human action needed,
and continue with independent work.

### 3.4 Things only the human can do
Batch these requests. Never wait idle on one; keep working on independent
items.

| Need | Why the agent can't do it |
|---|---|
| Create the Google OAuth client in Google Cloud Console | Requires the owner's Google account |
| Enable the Google provider in Supabase and paste the client ID/secret | Secret handling; project-wide auth setting |
| Add the web redirect URLs in Supabase Auth → URL Configuration (add only, never replace) | Shared project setting |
| Add the owner's email to the production allowlist | Personal data; must not be in the repo |
| Approve each remote migration | Shared production database |
| Approve production deploys | Production release |
| Final real-world checks: Google sign-in, real upload, AI answer | Requires the owner's identity |

---

## 4. Self-validation system

### 4.1 The validation ledger
Create and maintain **`Web/VALIDATION.md`**. Every check gets one row:

```markdown
| ID | Phase | Check | Method (exact command or steps) | Result | Evidence | Date |
|----|-------|-------|----------------------------------|--------|----------|------|
| P2-03 | 2 | Non-allowlisted user gets 403 on /v1/files | `npm --prefix Backend test -- allowlist` | PASS | 4 tests passed, output excerpt below | 2026-10-12 |
```

- **Result** is exactly one of `PASS`, `FAIL`, `BLOCKED`, `SKIPPED (reason)`.
- **Evidence** is a short output excerpt, a test name, or a screenshot path
  under `Web/validation-artifacts/` (git-ignored, except for small PNGs used
  in the final report).
- A phase is done only when every row for that phase is `PASS`, or is
  `BLOCKED` on a human item listed in §11.
- Re-run all earlier phases' automated checks at the end of every phase
  (regression). Record the summary row `P<N>-REGRESSION`.

### 4.2 Test layers (all are required)

| Layer | Tool | Runs against | Purpose |
|---|---|---|---|
| Unit | Vitest | Node/jsdom | Parsers, chunking, locators, utilities, components |
| Backend integration | Vitest (existing `Backend/tests`) | Local Supabase stack | Routes, allowlist, RLS, new tables |
| Database isolation | SQL + supabase-js script | Local Supabase stack | RLS/storage policies hold for two users |
| End-to-end | Playwright (Chromium + WebKit; desktop 1280×800 and iPhone 390×844) | Local web + local backend + local Supabase | Real user flows |
| Accessibility | `@axe-core/playwright` | Every primary screen | Zero serious/critical violations |
| Visual sanity | Playwright screenshots | Every primary screen, light and dark | Human-reviewable record of the design |
| Performance | Lighthouse CI (or Playwright traces) | Production build, locally | Budgets in §9 Phase 13 |
| Production smoke | `curl` and a scripted read-only flow | Preview, then production | Health, auth gate, headers |

### 4.3 Mandatory isolation suite (R3)
With **User A** (allowlisted), **User B** (allowlisted, family-member
simulation) and **User C** (not allowlisted), prove all of the following,
each as its own test:

1. A uploads a book; B's `GET /v1/files` doesn't include it.
2. B calling `POST /v1/files/{A's id}/download` gets `404`, not the file.
3. B reading A's storage path directly with B's token is denied.
4. B can't read, update or delete A's folders, reading states, annotations,
   conversations, knowledge chunks or preferences — through the API **and**
   through direct supabase-js queries with B's token (RLS).
5. B's AI chat with `scope: "wholeBook"` and A's publication ID returns no
   content from A's book.
6. C gets `403 not_invited` on every `/v1/*` route except
   `/v1/auth/session-check` (or equivalent), and the UI shows the "not
   invited" screen.
7. Removing B from the allowlist immediately blocks B's next request, with
   no data deleted.
8. The UI never renders another user's data, even after switching accounts
   in the same browser (check for cache leaks).

### 4.4 Commands the agent adds
- `make web-check`: lint, typecheck, unit tests and production build for
  `Web/`.
- `make web-e2e`: Playwright suite against the local stack.
- `make check`: extend it to include `web-check`.

---

## 5. Current system — facts the agent must know

Verify each fact before relying on it. The code is the source of truth, and
this section is a map.

### 5.1 Backend API (Hono, `Backend/src/index.ts`)
Authenticated routes require `Authorization: Bearer <Supabase access token>`.
A middleware on `/v1/*` (skipping `/v1/auth/*`) validates the token with
`supabase.auth.getUser` and creates a **user-scoped** Supabase client, so RLS
applies.

| Route | Purpose |
|---|---|
| `GET /health/live`, `GET /health/ready` | Liveness; readiness including Supabase |
| `POST /v1/auth/sign-up` / `sign-in` / `refresh` | Email/password auth (Mac app). **Sign-up must be disabled for R3** |
| `GET /v1/me` | Current user |
| `GET /v1/files`, `PUT /v1/files/order`, `POST /v1/files/uploads`, `POST /v1/files/:id/complete`, `PATCH /v1/files/:id`, `POST /v1/files/:id/download`, `DELETE /v1/files/:id` | Library files |
| `GET/POST /v1/folders`, `PATCH/DELETE /v1/folders/:id` | Folders |
| `POST /v1/reading-states/sync` | Reading progress sync |
| `POST /v1/publications/:id/ingestions`, `PUT …/chunks`, `POST …/complete`, `GET …/knowledge` | AI knowledge ingestion |
| `POST /v1/ai/chat/stream` (SSE) | Contextual chat; scopes `passage`, `page`, `upToHere`, `wholeBook` |
| `POST /v1/ai/highlight-question` | Question about a selection |
| `POST /v1/ai/respond` | One-shot response (used for "simplify passage") |
| `POST /v1/ai/chat/title` | Names a conversation |
| `GET /v1/catalog/search`, `POST /v1/catalog/interests`, `PUT /v1/files/:id/catalog-match` | Public-domain catalog |
| `GET /v1/entitlements`, `DELETE /v1/account` | Entitlements; account deletion |

**There is no CORS middleware today.** Browser calls from another origin
will fail until Phase 2 adds it.

### 5.2 Data model (Supabase, all user-scoped with RLS)
`user_profiles`, `folders`, `library_files` (with `sort_order`),
`reading_states`, `publication_knowledge`, `publication_chunks`,
`publication_annotations`, `catalog_interests`,
`catalog_provider_interests`, `library_publication_catalog_matches`, plus
billing tables. Storage: private bucket `reader-files`, with objects at
`<user_id>/<file_id>/original` and owner-only storage policies.

### 5.3 What is local-only on the Mac today (important)
The Mac app keeps these **only in local SQLite**
(`Reader/Persistence/ReaderLibraryStore.swift`):
- **highlights**, with color `lemon | petal | ember | aqua | moss` (RGB values
  in `Reader/ReaderCore/ReadingTypes.swift`) and note placement;
- **notes**;
- **saved AI conversations**;
- **per-book reader preferences**: scale, PDF scale mode, scroll mode.

`publication_annotations` in the cloud exists only to feed AI search. It
has no color and is tied to `publication_knowledge`.

**Consequence:** the web app needs **new cloud tables** for annotations,
conversations and preferences (Phase 3). The Mac app can adopt them later;
that's a separate, optional phase (Phase 15).

### 5.4 Upload flow (reuse exactly)
1. Compute SHA-256 of the file bytes (lowercase hex). It must equal
   `FileFingerprint.sha256` on the Mac, so the same book matches across
   devices.
2. `POST /v1/files/uploads` with `{clientFileId?, displayName,
   originalFilename, mediaType, byteSize, sha256, folderId?}`. The response
   is either `needsUpload:false` (already uploaded) or a signed upload URL
   plus token.
3. Upload the bytes to the signed URL (Supabase `uploadToSignedUrl`).
4. `POST /v1/files/:id/complete`.
5. On failure, retry with the same `clientFileId`. The route is idempotent
   and returns `409 file_identity_conflict` on mismatched content.

The backend schema has **no byte-size cap**, so the **storage** upload limit
applies. Phase 6 must read the project's actual limit (Supabase dashboard
→ Storage → Settings, or the Management API), enforce it client-side with a
clear message, and use resumable (TUS) uploads for files over 6 MB if the
signed-URL flow can't handle them reliably. Record the limit in the ledger.

### 5.5 AI knowledge ingestion (done by the client)
The **client** extracts text, splits it into chunks, and sends them:
`ingestions` → `chunks` (batches of ≤100 chunks and ≤1,000,000 characters)
→ `complete`. Each chunk has `{ordinal, resourceId, resourceTitle, text,
positionStart, positionEnd, progressionStart, progressionEnd}`. The web app
must reproduce the Mac's text extraction and chunking **closely enough**
that AI answers and progress values match across devices. Read
`Reader/ReaderCore/ReaderTextIndex.swift`, `PublicationReaderSession.swift`
and `LibraryModel.swift`, and document any differences in the Phase 1
decision record. `parserVersion` should be distinct for the web parser if
its output can differ (for example `1001`), so the two are never silently
mixed.

### 5.6 Locator schema (progress and highlights)
`ReaderLocator` (`Reader/ReaderCore/ReadingTypes.swift`):
`{schemaVersion: 1, publicationFingerprint, resourceID, position,
progression, textAnchor?, rectangles[]}`. `reading_states.locator` stores
this JSON. The web app **must** read and write this exact shape, so
continuing on the Mac after reading on the web lands in the right place.
Phase 1 defines how web renderers map to `resourceID`/`position`/`progression`
for PDF (page index), EPUB (spine item href) and TXT.

### 5.7 Mac design system
`Reader/DesignSystem/QuietReaderDesign.swift` ("Quiet Reader"): paper white
`#FFFFFF`; ink `#1D1D1F`; secondary ink `#26262A`; voice `#8A8A8C`; quiet
voice `#A8A8AA`; faint voice `#B2B2B4`; hairline `#C6C6C8`; Georgia for
reading text and the system UI font for chrome; reading themes white /
cream / gray / dark; short ease-in-out transitions of about 0.20–0.28 s.

---

## 6. Target architecture

```
Browser (Web/, Next.js on Vercel project "bookpal-web")
  │  Google sign-in via Supabase Auth (PKCE) → Supabase session (access token)
  │  All data calls → Backend with Bearer token (CORS allowlisted origin)
  │  File bytes → Supabase Storage via signed upload/download URLs from Backend
  ▼
Backend/ (Hono on Vercel "reader-backend")  ← single place for business rules
  │  + allowlist middleware (reader_allowed_users)
  │  + CORS middleware (WEB_ALLOWED_ORIGINS)
  │  + new routes: annotations, conversations, preferences
  ▼
Supabase (shared project): Postgres + RLS, Storage "reader-files", Auth (Google)
```

**Decisions (made here, so the agent doesn't relitigate them):**

| Topic | Decision | Reason |
|---|---|---|
| Location | `Web/` at the repo root, with its own `AGENTS.md` | Monorepo rule |
| Framework | Next.js (App Router) + TypeScript (strict) | First-class on Vercel; SSR for the auth callback |
| Styling | CSS Modules + CSS custom properties (design tokens). **No** UI kit, **no** Tailwind | Keeps the understated design hand-tuned and small |
| Data access | Browser → **Backend API** only. The browser uses supabase-js **only** for Auth and for uploading/downloading via signed URLs | One source of business rules for Mac and web; RLS still applies |
| Auth | Supabase Auth, **Google provider**, PKCE flow, `@supabase/ssr` cookies | Required by R3 |
| Allowlist | Table `public.reader_allowed_users` + backend middleware + a UI "not invited" screen | Data-driven and family-ready; doesn't affect the other app sharing the project |
| PDF rendering | `pdfjs-dist` (Apache-2.0) | Mature; provides a text layer for selection and highlights |
| EPUB rendering | **Owned parser** (JSZip + DOMParser over OPF/spine), rendering **sanitized** XHTML (DOMPurify) in a **sandboxed iframe without `allow-scripts`**, one spine item at a time, vertical reflow | Mirrors the Mac's owned-parser design and avoids depending on epub.js; must pass the corpus tests |
| TXT rendering | Plain text in a styled container, split into virtual sections for long files | Simple |
| State | React Server Components for the shell; client components for the reader; TanStack Query for API caching (cache keyed by user ID and cleared on sign-out) | Prevents cross-account cache leaks (§4.3 #8) |
| Offline | **Online-only** for v1; show a calm "You're offline" state | Keeps scope realistic |

Any deviation needs an entry in the Phase 1 decision record **and** the
owner's approval.

---

## 7. Feature parity matrix

The agent keeps this table updated in `Web/VALIDATION.md` (Status column).

| # | Mac feature | Web plan | Phase | Notes |
|---|---|---|---|---|
| F1 | Account sign-in | Google sign-in, invite-only | 4 | R3 |
| F2 | Import PDF/EPUB/TXT | Settings → Upload, drag-and-drop | 6 | R2 |
| F3 | Library grid with covers | Same; EPUB embedded cover, PDF first-page render, TXT typographic cover | 5 | Covers generated client-side, cached |
| F4 | Folders | Create, rename, nest, move, delete (no cycles) | 5 | Backend enforces cycles |
| F5 | Library order / reorder | Drag to reorder (pointer + keyboard) | 5 | `PUT /v1/files/order` |
| F6 | Search across library | Title/author filter + in-book full-text search | 5, 7 | |
| F7 | Resume progress | Opens at the last locator; syncs with the Mac | 7 | §5.6 |
| F8 | PDF reading | pdf.js, fit width/page, zoom | 7 | |
| F9 | EPUB reading | Owned parser, vertical reflow by section | 7 | |
| F10 | TXT reading | Styled text | 7 | |
| F11 | Reading themes and type size | White/cream/gray/dark; type scale; stored per book in the cloud | 7 | New preferences table |
| F12 | Highlights (5 colors) | Same colors and names | 8 | New annotations table |
| F13 | Notes on highlights | Same | 8 | |
| F14 | Ask AI about a selection | Highlight question | 9 | |
| F15 | Chat with scopes (passage/page/upToHere/wholeBook) | Streaming SSE chat panel | 9 | |
| F16 | Simplify difficult passage | Inline rewrite popover | 9 | `/v1/ai/respond` |
| F17 | Saved conversations | Cloud-saved, per book | 9 | New conversations table |
| F18 | Side-by-side workspace (book + chat/dictionary/book) | Resizable split panes on desktop; bottom sheet on phone | 10 | |
| F19 | Dictionary | Short AI definition via `/v1/ai/respond` (no system dictionary on the web) | 10 | Adapted, documented |
| F20 | In-app web browser | **Adapted:** open links in a new tab; optional "research" chat. Iframing arbitrary sites is blocked by most sites | 10 | Documented divergence |
| F21 | Catalog search / Read now | Search public-domain catalog, add to library | 11 | Optional; may defer |
| F22 | Account deletion | Settings → Account → Delete (typed confirmation) | 12 | |
| F23 | Cloud sync status | Calm per-book status: uploaded / preparing for AI / ready / failed + retry | 6 | |

---

## 8. Design language — elegant and quaint

Write this into `Web/DESIGN.md` and implement it as tokens in
`Web/src/styles/tokens.css`.

**Mood:** a well-made paperback in a quiet room. Restraint over decoration.

**Color** (light; derived from §5.7):
- Paper `#FFFFFF`; warm paper (cream theme) `#F6F1E7`-ish (take exact values
  from `QuietReaderDesign.swift`); ink `#1D1D1F`; secondary ink `#26262A`;
  voice `#8A8A8C`; hairline `#C6C6C8`.
- Exactly **one** subtle accent for focus and progress: ink at 28% opacity
  (matches `progress`). No brand-blue buttons.
- Highlight colors: exact RGB from `ReaderHighlightColor`, applied at a
  readable opacity.
- **Dark mode:** derive from the Mac's `dark` theme values. Honor
  `prefers-color-scheme` and offer a manual override in Settings.

**Typography:**
- Reading text: Georgia (with fallbacks `"Iowan Old Style", "Palatino
  Linotype", serif`), 18–21 px base, line height 1.6, measure 60–70
  characters.
- Chrome: system UI stack, 13–15 px, voice-gray labels, sentence case.
- Titles: Georgia, light weight. Occasional italics for quiet emphasis, as
  the Mac uses light italics.

**Layout:**
- Generous margins (the Mac uses a 48 px window margin and a 180 px left
  content gutter on desktop). On phones: 20 px gutters and a single column.
- Hairline (1 px `#C6C6C8`) dividers instead of boxes. Corner radius 10 px
  for small controls only.
- Library: covers on a calm grid with title and author below in voice gray.
  No card shadows; the faintest shadow on hover at most.

**Motion:**
- 200–280 ms ease-in-out for screen changes and 250 ms ease-out for hover.
  Gentle springs only for panes and reordering. Respect
  `prefers-reduced-motion` (no motion).

**Interaction details that create the "quaint" feel:**
- Toasts are short sentences in italic Georgia at the bottom, auto-dismissed.
- Empty states use one line of plain, friendly text plus one action ("Your
  shelf is empty. Upload a book.").
- Icons: a single thin-stroke set (Lucide, 1.5 px stroke), used sparingly.
- No modal stacks; at most one sheet or popover at a time.

**Validation for R1 (record each in the ledger):**
- Screenshots of the library, reader (each format), upload, settings, chat
  and sign-in, in light and dark, desktop and phone.
- Axe: zero serious/critical issues. Contrast AA for all text (AAA for
  reading text).
- A written self-review against this section: list every place that departs
  from it and why.
- Owner sign-off is a human checkpoint (§11).

---

## 9. Phases

Each phase lists **Goal**, **Steps**, **Definition of done (DoD)** and the
**Checks** to record (IDs `P<phase>-NN`).

### Phase 0 — Orientation and baseline
**Goal:** a known-good starting point.
- Read the files in §3.1. Create the branch `web/phase-0-baseline`.
- Run `make backend-check` and `make reader-test`. Record the results.
- Start the **local** Supabase stack: `npx supabase@latest start --workdir
  Backend` (needs Docker Desktop; if it's missing, record BLOCKED and ask the
  human to install it). Apply the migrations locally with `npx
  supabase@latest db reset --workdir Backend` (**local only**).
- Create `Web/VALIDATION.md` with the ledger header and the §7 matrix.

**DoD / Checks:**
- P0-01 backend checks pass.
- P0-02 native tests pass.
- P0-03 local stack is up; `select count(*) from supabase_migrations.schema_migrations` returns 11 locally.
- P0-04 the ledger exists.

### Phase 1 — Decision record (high-risk architecture rule)
**Goal:** document the renderer, locator and parser choices before writing
the code that depends on them.
- Write `docs/decisions/0001-web-reader.md` covering: PDF (pdfjs-dist), EPUB
  (owned parser + sandboxed iframe), TXT; how each maps to `ReaderLocator`;
  text extraction and chunking parity with the Mac; `parserVersion` policy;
  licensing (Apache-2.0, MIT, BSD) and exit costs; macOS/iOS/web
  implications; security (untrusted EPUB HTML, CSP).
- Build a **throwaway spike** that loads every `TestCorpus` book (download
  them with `scripts/download_test_corpus.sh`) and records: opens yes/no,
  spine/page count, extracted character count, and first-chunk text
  compared with what the Mac produces for the same book (if the Mac's output
  can't be captured automatically, note it and compare against the
  manifest's `expectedContentDocuments`).

**DoD / Checks:**
- P1-01 the decision record exists and covers all of the points above.
- P1-02 every corpus book opens in the spike, or each failure is explained.
- P1-03 locator round-trip: write a locator on the web → read it back →
  same position, for PDF, EPUB and TXT.

### Phase 2 — Backend: invite-only access, sign-up lock, CORS
**Goal:** satisfy R3 at the server before any web UI exists.
- New migration `…_reader_allowed_users.sql`:
  - `public.reader_allowed_users (email citext primary key, role text not null default 'member' check (role in ('owner','member')), invited_at timestamptz not null default now(), note text)`.
  - RLS enabled with **no** client policies (service-role only). Revoke from
    `anon` and `authenticated`.
  - Requires the `citext` extension in the `extensions` schema
    (`create extension if not exists citext with schema extensions`), or
    store the email lower-cased in `text` with a check constraint. Choose one
    and record it.
  - **Do not** insert any real email in the migration.
- Backend middleware, after token validation on `/v1/*`: look up
  `lower(user.email)` in `reader_allowed_users` using the admin client.
  If it's absent, return `403 {error:{code:"not_invited"}}`. Cache the
  result per request only (no cross-request cache, so revocation takes
  effect immediately).
- Require the Google identity's email to be **verified**
  (`user.email_confirmed_at` or the identity data). Unverified → 403.
- `POST /v1/auth/sign-up` → `403 signup_disabled` unless the env var
  `READER_OPEN_SIGNUP=true` (default false). The Mac's email sign-in keeps
  working **only** for allowlisted emails.
- CORS: Hono `cors()` on `/v1/*` with `origin` restricted to
  `WEB_ALLOWED_ORIGINS` (comma-separated; production web URL, preview
  pattern, `http://localhost:3000`), `Authorization` and `Content-Type`
  headers allowed, and credentials **not** needed (Bearer tokens).
- Seed **locally** with test emails (§10.2). Production seeding is a human
  step (§11, H3).

**DoD / Checks:**
- P2-01 migration applies locally; the advisor shows no new findings.
- P2-02 an allowlisted user gets 200 on `GET /v1/me`; a non-allowlisted user
  gets 403 `not_invited` on every protected route (generated test over the
  route list).
- P2-03 sign-up returns 403 by default.
- P2-04 CORS: preflight from an allowed origin passes; a disallowed origin
  gets no `Access-Control-Allow-Origin`.
- P2-05 revocation: deleting an allowlist row blocks the next request.
- P2-06 Mac compatibility: `make reader-test` passes, and the PR explains
  that the change is additive except for sign-up (the Mac's sign-up screen
  now shows the backend's error; acceptable and documented).

### Phase 3 — Backend: cloud annotations, conversations, preferences
**Goal:** move the Mac's local-only features (§5.3) to per-user cloud tables
for the web.
- Migration(s), all with `user_id uuid not null references auth.users on
  delete cascade`, RLS on, and `select/insert/update/delete` policies
  `using ((select auth.uid()) = user_id)`:
  - `reader_annotations (id uuid pk, user_id, file_id uuid not null, locator jsonb not null, selected_text text not null, note text, highlight_color text not null check (in lemon|petal|ember|aqua|moss), note_placement_x double precision, note_placement_y double precision, created_at, updated_at, deleted_at timestamptz)`,
    with FK `(file_id, user_id) → library_files(id, user_id) on delete cascade`.
    The soft delete supports future Mac sync.
  - `reader_conversations (id uuid pk, user_id, file_id uuid null, publication_title text not null, title text, messages jsonb not null, locator jsonb, created_at, updated_at)`,
    with an FK to `library_files` that is `on delete set null` and a guard
    that `file_id` belongs to the same user.
  - `reader_preferences (user_id, file_id, theme text, type_scale double precision, pdf_scale_mode text, scroll_mode text, updated_at, primary key (user_id, file_id))`.
  - `updated_at` triggers via `public.set_updated_at()`.
- Routes (with zod schemas in `validation.ts`):
  `GET/POST/PATCH/DELETE /v1/files/:fileId/annotations[/:id]`,
  `GET/POST/PATCH/DELETE /v1/conversations[/:id]` (filterable by `fileId`),
  `GET/PUT /v1/files/:fileId/preferences`.
- When an annotation changes, keep `publication_annotations` (the AI
  search copy) in sync if knowledge exists for that file, reusing the
  existing knowledge store, so the AI can see the user's highlights.

**DoD / Checks:**
- P3-01 migrations apply locally; the advisor is clean for the new tables.
- P3-02 CRUD tests for each route.
- P3-03 isolation tests §4.3 #4 for all three tables (API and direct RLS).
- P3-04 cascade: deleting a file removes its annotations and preferences,
  and nulls the conversation's `file_id`.
- P3-05 `make backend-check` and `make reader-test` pass.

### Phase 4 — Web scaffold, design system, Google sign-in
**Goal:** a deployed-locally shell where only invited users get in.
- `Web/` with Next.js + TS strict, ESLint, Vitest, Playwright, CSS Modules,
  `tokens.css`, `Web/AGENTS.md`, `Web/README.md`, `Web/.env.example`
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `NEXT_PUBLIC_READER_BACKEND_URL`; **never** the secret key).
- Auth: `@supabase/ssr`; a sign-in page with a single "Continue with Google"
  button; `/auth/callback` route (PKCE code exchange); sign-out.
  After sign-in, call `GET /v1/me`. On 403 `not_invited`, sign out locally
  and show the **Not invited** screen ("This library is private. Ask the
  owner for an invitation.").
- App shell: a quiet left menu on desktop (Library, Search, Settings,
  account mark) mirroring the Mac's menu column; a bottom bar or top sheet
  on phone.
- Security headers: strict CSP (self + Supabase + backend origins; `frame-src`
  self for the EPUB iframe; no `unsafe-eval` in production), HSTS,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.

**DoD / Checks:**
- P4-01 `make web-check` passes.
- P4-02 E2E: an allowlisted test user (test sign-in path, §10.3) reaches the
  library.
- P4-03 E2E: a non-allowlisted user sees "Not invited" and no data request
  succeeds.
- P4-04 the production build contains **no** test sign-in code (grep the
  build output for the marker string; it must be absent).
- P4-05 Google button flow verified against **mocked** OAuth locally;
  real Google is human checkpoint H5.
- P4-06 axe is clean on the sign-in and not-invited screens; screenshots
  saved.

### Phase 5 — Library
**Goal:** browse and organize the user's books.
- Grid of covers (lazy, cached in IndexedDB keyed by user ID + SHA-256),
  title, author, progress hairline.
- Folders: create, rename, nest, move, delete (empty only, or move contents
  first); breadcrumbs.
- Reorder by drag and by keyboard (Space to lift, arrows to move, Space to
  drop).
- Filter by title/author; sort by recent / manual / title.
- Book actions: open, rename, move, delete (typed confirmation for delete).

**DoD / Checks:**
- P5-01 to P5-06: E2E for each action, including folder-cycle prevention and
  reorder persistence after reload.
- P5-07 an empty state shows when there are no books.
- P5-08 phone layout screenshots; no horizontal scroll at 390 px.

### Phase 6 — Settings → Upload (R2)
**Goal:** upload from anywhere into `reader-files`.
- Settings page sections: **Upload**, Appearance, Account.
- Upload: a drop zone plus a "Choose files…" button (`<input type="file"
  multiple accept=".epub,.pdf,.txt,application/epub+zip,application/pdf,text/plain">`),
  an optional destination folder picker, and a queue with per-file states:
  hashing → uploading (with %) → finalizing → preparing for AI → ready /
  failed (retry).
- Hash in a Web Worker (SHA-256, streamed in 1 MB slices like the Mac).
- Validate the type by **content sniffing** (EPUB zip with the mimetype
  entry, the `%PDF-` header, UTF-8 text), not only by extension.
- Enforce the storage size limit found in §5.4.
- Duplicate: if the backend says `needsUpload:false`, show "Already on your
  shelf."
- After `complete`, run ingestion (§5.5) in a worker; show progress; on
  failure the book is still readable and the AI shows "preparing failed —
  retry".
- Concurrency: at most 3 files at once; the page warns before closing while
  uploads are active.

**DoD / Checks:**
- P6-01 upload one EPUB, one PDF and one TXT (corpus books) → all `ready` in
  the library; the storage object exists at `<uid>/<fileId>/original`
  (verify with the admin client locally).
- P6-02 the same file twice → the second is detected as a duplicate; no new
  row.
- P6-03 a renamed `.exe` as `.pdf` is rejected with a friendly message.
- P6-04 oversize file → friendly message; no orphaned row.
- P6-05 network failure mid-upload (Playwright route abort) → retry
  succeeds; no duplicate rows.
- P6-06 ingestion completes: `publication_knowledge.processing_status =
  'parsed'` and `chunk_count > 0`.
- P6-07 isolation: User B never sees User A's uploads (§4.3 #1–3).
- P6-08 works at phone width (the file picker opens; queue is usable).

### Phase 7 — Reader (PDF, EPUB, TXT) and progress sync
- PDF: pdf.js with a text layer; continuous vertical scroll; fit width
  default; zoom.
- EPUB: owned parser; spine navigation; table of contents; sanitized
  sandboxed iframe; theme CSS injected; images allowed only from the book's
  own resources (blob URLs); external links open in a new tab with
  `rel=noopener`.
- TXT: paragraphs; virtualized for large files.
- Themes (white/cream/gray/dark), type scale, and margins; saved through
  `/v1/files/:id/preferences`.
- Progress: debounce (about 2 s) and sync via `POST /v1/reading-states/sync`
  with the exact `ReaderLocator` shape; on open, restore the latest locator.
- In-book search (find in the current book) with result highlighting.

**DoD / Checks:**
- P7-01 every corpus book renders (screenshot each).
- P7-02 progress round-trip: read to about 40% → reload → same place (all
  formats).
- P7-03 cross-client: a locator written by the web is accepted by the
  backend schema and is valid for the Mac (validate against the Swift
  `ReaderLocator` shape with a shared JSON fixture; add a Swift unit test
  that decodes the web fixture if feasible).
- P7-04 malicious EPUB fixture (script tags, `onload`, `javascript:` links,
  remote images) → nothing executes; no network calls to remote hosts (check
  the Playwright request log).
- P7-05 performance: the first page of a 5 MB PDF is visible in under 2.5 s
  locally.

### Phase 8 — Highlights and notes
- Select text → a quiet popover: 5 color dots, Note, Ask AI, Simplify, Copy.
- Persist through the Phase 3 API; render highlights from locators
  (`textAnchor` and/or `rectangles`); notes appear as margin marks that open
  in a small card.
- A per-book "Highlights & notes" list that jumps to each location.

**DoD / Checks:**
- P8-01 create/edit/recolor/delete a highlight in each format; survives
  reload.
- P8-02 a note on a highlight survives reload.
- P8-03 the AI knowledge copy is updated (`publication_annotations` row
  exists).
- P8-04 isolation §4.3 #4 for annotations via the UI.

### Phase 9 — AI
- Chat panel: streaming SSE from `/v1/ai/chat/stream`; scope selector
  (Passage / Page / Up to here / Whole book) shown as quiet text tabs; stop
  button; markdown rendering (sanitized).
- Ask about a selection → `/v1/ai/highlight-question`.
- Simplify → `/v1/ai/respond` with the selected text; result shown inline
  under the passage, with dismiss.
- Conversations auto-titled via `/v1/ai/chat/title`, saved via the Phase 3
  API, listed per book.
- **Fake AI provider for tests:** add a backend env flag
  `READER_AI_PROVIDER=fake` (**only honored when `NODE_ENV !== 'production'`
  and `VERCEL_ENV` is not `production`**), returning deterministic streamed
  text that echoes the scope and the first chunk ordinal, so tests can
  assert the right context was used.

**DoD / Checks:**
- P9-01 streaming renders incrementally; stop works.
- P9-02 for each scope, the fake provider proves the correct context window
  (`upToHere` never includes chunks after the current progression).
- P9-03 conversations persist and reload, are scoped per book and per user.
- P9-04 the fake flag is refused in production mode (unit test of the
  guard).
- P9-05 a real AI smoke test is human checkpoint H6.

### Phase 10 — Workspace panes
- Desktop: the book plus one side pane (Chat / Dictionary / Second book /
  Notes), resizable, with the width remembered; a bottom pane is optional.
- Phone: panes become a bottom sheet with detents.
- Dictionary: select a word → short definition via `/v1/ai/respond` (prompt:
  concise dictionary entry); clearly labeled "AI definition".
- Web browser pane: **not** an iframe browser. Links open in a new tab; this
  is documented in the matrix as an adapted feature.

**DoD / Checks:** P10-01 pane open/resize/close; P10-02 phone bottom sheet;
P10-03 dictionary lookup works with the fake provider; P10-04 axe clean.

### Phase 11 — Catalog (optional; the owner may defer)
Search the public-domain catalog via `/v1/catalog/search`; "Add to shelf"
for `read_now` results. DoD: P11-01 search returns results locally after
seeding a small Gutenberg sample (`npm run catalog:seed:gutenberg -- --pages
1`, **locally only**).

### Phase 12 — Account
Settings → Account: signed-in email, sign out, delete account (typed
confirmation; calls `DELETE /v1/account`), appearance (light/dark/system).

DoD: P12-01 sign-out clears all caches (IndexedDB entries keyed by the user,
query cache); P12-02 account deletion removes the user's rows and storage
objects locally (verify with the admin client).

### Phase 13 — Hardening
- Accessibility: keyboard navigation everywhere, focus rings (ink at 28%),
  reader landmarks, screen-reader labels.
- Performance budgets (production build, local): LCP < 2.5 s on library,
  JS < 250 KB gzipped on the initial route (reader chunks lazy-loaded),
  CLS < 0.05.
- Error states: backend down, token expired (silent refresh, then a gentle
  sign-in prompt), storage failure, AI failure — each with a calm message
  and a retry.
- Security review: run the `security-review` skill (or an equivalent manual
  checklist) on the full web diff; fix findings.

**DoD / Checks:** P13-01 axe clean on all screens; P13-02 budgets met or
deviations explained; P13-03 each error state is shown in an E2E test;
P13-04 security review findings are resolved or accepted by the owner.

### Phase 14 — Deploy
1. Create the Vercel project `bookpal-web` (Root Directory `Web`). Set the
   public env vars for Preview and Production.
2. Add the backend env `WEB_ALLOWED_ORIGINS` (production URL + preview
   pattern). Remind the owner that `SUPABASE_SECRET_KEY` must exist in the
   backend's **Preview** environment too.
3. Human applies the remote migrations (§3.2) — H4.
4. Deploy a **preview**; smoke tests: health, sign-in page renders, CSP
   headers present, `/v1/me` without a token → 401, with a non-allowlisted
   test token → 403 (only if testable without creating remote users;
   otherwise mark it SKIPPED and verify locally).
5. Human checkpoints H5–H7 on the preview.
6. With the owner's approval, deploy to production. Repeat the smoke tests.
7. Optional: connect GitHub `stozo04/bookpal` to both Vercel projects
   (production = `main`; "skip deployments when root directory unchanged").

**DoD / Checks:** P14-01 preview smoke tests pass; P14-02 human checkpoints
recorded; P14-03 production smoke tests pass.

### Phase 15 — (Optional, later) Mac app adopts the cloud annotations
Make the Mac app sync highlights, notes, conversations and preferences
through the Phase 3 API, so the web and the Mac show the same highlights.
This is a separate project with its own decision record (sync conflicts,
offline queue, soft deletes).

---

## 10. Test data strategy

### 10.1 Environments
- **Automated tests run only against the local Supabase stack** (Docker),
  the local backend (`npm --prefix Backend run dev` or `vercel dev`), and the
  local web app.
- Never against the shared production project.

### 10.2 Seed data (local)
Script `Web/scripts/seed-local.ts` (idempotent):
- Users, created with the admin API, email/password, `email_confirm: true`:
  - `reader-e2e-a@example.test` (allowlisted, role `owner`)
  - `reader-e2e-b@example.test` (allowlisted, role `member`)
  - `reader-e2e-c@example.test` (**not** allowlisted)
- Books: public-domain corpus files from `TestCorpus/Downloads/` (download
  them with `scripts/download_test_corpus.sh`) plus generated fixtures in
  `Web/tests/fixtures/`: a tiny EPUB (2 chapters), a malicious EPUB (§P7-04),
  a 2-page PDF, a TXT with Unicode, an oversize dummy, and a fake `.pdf` that
  is really an executable header.
- AI: `READER_AI_PROVIDER=fake`.
- Teardown script `Web/scripts/reset-local.ts`.

### 10.3 Test-only sign-in path
Google OAuth can't be automated reliably. Provide an email/password sign-in
route **only** when all of these hold:
- `process.env.NEXT_PUBLIC_E2E_AUTH === "1"` at **build** time, **and**
- the Supabase URL host is `127.0.0.1` or `localhost`.

Guard it in code, add a unit test for the guard, and add the build-output
grep check (P4-04). The production build must never contain it.

### 10.4 What tests may never do
Use real personal emails, call real Google, call the real AI Gateway (except
the human-run H6), or touch remote data.

---

## 11. Human checkpoints

The agent prepares exact click-by-click instructions for each, in the PR
description or in chat, and records the outcome in the ledger.

| ID | When | What the human does | What the agent verifies afterwards |
|---|---|---|---|
| H1 | Before Phase 0 if needed | Install Docker Desktop | `docker info` works |
| H2 | Before Phase 4 deploy | Google Cloud Console: create an OAuth client (Web). Authorized redirect URI: `https://bqyfplifeyvkilkoneph.supabase.co/auth/v1/callback`. Then Supabase → Auth → Providers → Google: enable it and paste the client ID and secret | The provider shows as enabled (read-only check) |
| H3 | Before Phase 14 | Insert the owner's email into the **production** allowlist (the agent gives the exact SQL with a placeholder, which the human runs in the SQL editor) | `select count(*) from reader_allowed_users` = 1 (count only; don't print the email) |
| H4 | Phase 14 | Approve applying each new migration to the shared project | Objects exist; non-Reader counts unchanged; advisor clean |
| H5 | Preview | Sign in with Google as the owner | Lands in the library; `/v1/me` returns 200 |
| H6 | Preview | Upload a real (owned or public-domain) book; ask the AI one question in each scope | Book `ready`; answers stream |
| H7 | Preview | Sign in with a different Google account | Sees "Not invited"; no data visible |
| H8 | End | Design sign-off on screenshots (R1) | Recorded |
| H9 | End | Approve the production deploy | Production smoke tests pass |

---

## 12. Final acceptance checklist

The agent completes this and pastes it, filled in, into the final PR.

- [ ] Every ledger row for Phases 0–14 is `PASS` (or the owner accepted it
      as `SKIPPED`/`BLOCKED`).
- [ ] R1: screenshots reviewed and signed off (H8); axe clean; written design
      self-review included.
- [ ] R2: Settings → Upload works for EPUB/PDF/TXT from the desktop picker,
      drag-and-drop, and the phone file picker; files land in `reader-files`
      under the user's own folder; AI preparation completes.
- [ ] R3: Google-only sign-in; open sign-up disabled; allowlist enforced
      server-side; the isolation suite (§4.3, all 8) passes; the owner's
      email is in production data only, not in Git.
- [ ] Mac app unaffected: `make reader-test` passes; Mac sign-in still works
      for allowlisted emails.
- [ ] Shared Supabase project: no non-Reader objects changed (before/after
      counts recorded); advisor shows no new Reader findings.
- [ ] No secrets, personal emails, `.env*`, or `.vercel/` committed
      (`git log -p | grep -iE "sb_secret|service_role|@gmail"` returns
      nothing new).
- [ ] Docs: `Web/README.md`, `Web/AGENTS.md`, `Web/DESIGN.md`,
      `docs/decisions/0001-web-reader.md`, and an updated root `README.md`
      section "Web app".

---

## 13. Appendix: reference file map

| Need | File |
|---|---|
| Backend routes and auth middleware | `Backend/src/index.ts` |
| Request schemas and limits | `Backend/src/validation.ts` |
| Backend config / env | `Backend/src/config.ts`, `Backend/.env.example` |
| AI prompts and services | `Backend/src/ai.ts`, `Backend/src/features/*` |
| DB schema | `Backend/supabase/migrations/*.sql` |
| Mac API client (contract mirror) | `Reader/Networking/ReaderBackendClient.swift` |
| Locator and highlight colors | `Reader/ReaderCore/ReadingTypes.swift` |
| Text index / chunking | `Reader/ReaderCore/ReaderTextIndex.swift`, `Reader/ReaderCore/PublicationReaderSession.swift` |
| Fingerprint | `Reader/ReaderCore/FileFingerprint.swift` |
| Local-only data (to move to the cloud) | `Reader/Persistence/ReaderLibraryStore.swift` |
| Library behavior | `Reader/Domain/LibraryModel.swift` |
| Design tokens | `Reader/DesignSystem/QuietReaderDesign.swift`, `ReaderColors.swift` |
| Screens and flows to mirror | `Reader/QuietReader/QuietReaderScreens.swift`, `Reader/Features/*`, `Reader/Workspace/*` |
| Corpus | `TestCorpus/manifest.json`, `scripts/download_test_corpus.sh` |
