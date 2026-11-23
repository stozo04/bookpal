#!/usr/bin/env bash
# Fails unless every place the product version is written agrees at HEAD, that version has an
# entry in Web/src/lib/releaseNotes.ts and, when anything that ships changed since <base>, it is
# above <base>'s. See AGENTS.md, "Versioning".
# Usage: scripts/check-version-bump.sh [base]   (default origin/main; CI on main passes the previous main)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
source scripts/version-files.sh

base="${1:-origin/main}"
current="$(single_version HEAD)"
base_version="$(single_version "$base")"

notes_file="Web/src/lib/releaseNotes.ts"
notes="$(git show "HEAD:$notes_file")"
if ! grep -qF "version: \"$current\"" <<< "$notes"; then
  echo "::error file=$notes_file::Version $current has no release notes. Add its entry at the top of RELEASES." >&2
  exit 1
fi

shipping=""
while IFS= read -r path; do
  [ -z "$path" ] && continue
  is_untouched_path "$path" || { shipping="$path"; break; }
done <<< "$(git diff --name-only "$(git merge-base "$base" HEAD)" HEAD)"

if [ -z "$shipping" ]; then
  echo "Nothing that ships changed since $base: no bump needed (version $current)."
  exit 0
fi

highest="$(printf '%s\n%s\n' "$base_version" "$current" | sort -V | tail -1)"
if [ "$current" = "$base_version" ] || [ "$highest" != "$current" ]; then
  echo "::error::$shipping changed, so the version must rise above $base's $base_version (it is $current)." >&2
  echo "Run scripts/bump-version.sh patch (fix) or minor (feature), and commit it." >&2
  exit 1
fi
echo "Version $base_version -> $current."
