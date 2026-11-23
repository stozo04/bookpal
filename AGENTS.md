# Reader repository instructions

## Monorepo layout

- The native app and shared Apple-platform code remain at the repository root.
- The optional Hono, Supabase, and Vercel backend lives in `Backend/` and has additional instructions in `Backend/AGENTS.md`.
- Make all new native, backend, schema, and shared-contract changes in this repository.
- When an API contract changes, update and validate both `Reader/Networking` and `Backend/` in the same task and pull request.
- From the repository root, use `make setup`, `make backend-check`, `make reader-test`, and `make check` for the common workflows.
- Deploy the backend from this repository root with the Vercel CLI and keep
  the Vercel project's Root Directory set to `Backend`. Follow `SETUP.md` for
  fork-specific Supabase, Vercel, and AI Gateway configuration.

## Agent workflow

- Read `README.md`, `SETUP.md`, and the instructions nearest the code being
  changed. Work under `Backend/` also follows `Backend/AGENTS.md`.
- Preserve unrelated edits. Use a feature branch or worktree when the local
  repository policy calls for one.
- Run the relevant checks before handing work back. Do not merge or deploy
  without the repository maintainer's authorization.
- Never commit credentials, local service links, personal instructions, or
  agent-specific state. Put private preferences in the agent's global or local
  configuration instead.

## Versioning (every PR that touches the product)

- BookPal has one product version (semantic versioning, `MAJOR.MINOR.PATCH`)
  shared by the Mac app, the web app and the backend. It is written in
  `Web/package.json`, `Backend/package.json`, their lockfiles, and
  `MARKETING_VERSION` in `project.yml` and `Reader.xcodeproj`, and all of them
  must agree. The web app shows it in the footer.
- Bump it only with `scripts/bump-version.sh patch|minor|major`, which writes
  every place at once. Never hand-edit a lockfile or a single file.
- Every bump adds the version's release notes at the top of `RELEASES` in
  `Web/src/lib/releaseNotes.ts`, with the date and one line per change
  (`New`, `Improved`, `Fixed` or `Removed`) written for readers, not
  developers. The footer's What's New shows them. A change with nothing to
  show says "Behind the scenes: …".
- Every PR that changes anything outside `.github/`, `.claude/`, `docs/`,
  top-level `.md` files and any `README.md`, `AGENTS.md` or `CLAUDE.md` bumps
  it once (Dependabot PRs included: bump them before merging), however many commits: PATCH for a fix or small
  tweak, MINOR for a new feature (resets PATCH), MAJOR only when the
  maintainer says so. If `main` moved on, re-bump above `main`'s version
  before merging.
- CI enforces both the bump and the release notes: the "Version bumped" job in
  `.github/workflows/version.yml` runs `scripts/check-version-bump.sh` on every PR, and on every push to
  `main` against the previous `main`. It reads committed files, so commit the
  bump, then run it locally before opening a PR:
  `git fetch origin && scripts/check-version-bump.sh`. A bump also edits
  `project.yml`, `Reader.xcodeproj` and `Backend/`; the `changes` job in
  `ci.yml` ignores those version-only edits so they don't start the macOS and
  backend jobs.
- Releases are tags on `main`; see `RELEASING.md`.

## Apple platform direction

This is a macOS-first product, not a macOS-only product.

- Every domain model, persistence decision, renderer boundary, file-access flow, and major UI structure must be evaluated for a future native iOS and iPadOS target.
- macOS, iOS, and iPadOS must remain in this repository and, unless evidence forces a change, in this Xcode project.
- Keep reusable Swift and SwiftUI code platform-neutral. Isolate AppKit- or UIKit-specific code behind narrow adapters or target-specific folders.
- Do not quietly make Mac Catalyst, pure AppKit, or separate renderers the permanent cross-platform strategy. Record the tradeoff and test it before committing.
- A macOS-only implementation is acceptable for the current milestone when the shared contract remains portable and the platform-specific choice is explicit.
- Prefer capabilities over fake universal abstractions. EPUB, PDF, comics, plain text, and audio do not need to share rendering internals.

## High-risk architecture

Do not add or replace a rendering engine, persistence framework, locator schema, DRM system, import ownership model, or sync architecture without:

1. testing it against the repository corpus;
2. documenting macOS and iOS implications;
3. recording licensing and exit costs; and
4. documenting the decision and tradeoffs in the pull request.

## Test corpus

- Keep reproducible corpus definitions and download tooling in Git.
- Keep downloaded public-domain binaries under `TestCorpus/Downloads/`; this directory is intentionally ignored by Git.
- Do not add copyrighted commercial books to the repository or its download manifest.
- Preserve source URLs, public-domain status, expected format capabilities, byte size, and SHA-256 checksums.
