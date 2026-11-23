# Releasing

BookPal's version rules are in `AGENTS.md` under "Versioning". A release is a
`vX.Y.Z` tag on `main` that matches the product version.

1. Merge the PRs the release needs. Each one has already bumped the version.
2. Wait for `main`'s CI to go green, including "Version bumped".
3. Tag the merge commit and push the tag:

   ```bash
   git fetch origin && git switch main && git pull --ff-only origin main
   git tag "v$(node -p 'require("./Web/package.json").version')"
   git push origin "v$(node -p 'require("./Web/package.json").version')"
   ```

4. Publish the GitHub release for the tag. The reader-facing notes are the
   tag's entry in `Web/src/lib/releaseNotes.ts`, which the app shows in
   What's New; the generated notes list the PRs behind them:

   ```bash
   gh release create "v$(node -p 'require("./Web/package.json").version')" --generate-notes
   ```

Never move or delete a tag that is already on `origin`. The web app deploys
from `main` through Vercel, so the tag records what shipped; it does not
trigger a deploy.
