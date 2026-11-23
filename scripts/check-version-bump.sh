#!/usr/bin/env bash
# Fails unless every place the product version is written agrees, and, when the branch changes
# anything that ships, that version is above the base branch's. See AGENTS.md, "Versioning".
# Usage: scripts/check-version-bump.sh [base-ref]   (default origin/main)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
source scripts/version-files.sh

base="${1:-origin/main}"
semver='^[0-9]+\.[0-9]+\.[0-9]+$'

# Prints the one version written at git revision $1 (working tree when empty), or fails.
single_version() {
  local rev="$1" label="${1:-this branch}" versions
  versions="$(read_versions "$rev" | cut -d' ' -f2- | sort -u)"
  if [ "$(wc -l <<< "$versions")" -ne 1 ] || ! [[ "$versions" =~ $semver ]]; then
    echo "::error::The version must be one MAJOR.MINOR.PATCH value everywhere ($label):" >&2
    read_versions "$rev" | sed 's/^/  /' >&2
    echo "Bump with scripts/bump-version.sh, which writes all of them." >&2
    return 1
  fi
  echo "$versions"
}

current="$(single_version "")"
base_version="$(single_version "$base")"

changed="$(git diff --name-only "$(git merge-base "$base" HEAD)" HEAD)"
shipping=""
while IFS= read -r path; do
  [ -z "$path" ] && continue
  is_untouched_path "$path" || { shipping="$path"; break; }
done <<< "$changed"

if [ -z "$shipping" ]; then
  echo "Only CI, agent config or docs changed: no bump needed (version $current)."
  exit 0
fi

highest="$(printf '%s\n%s\n' "$base_version" "$current" | sort -V | tail -1)"
if [ "$current" = "$base_version" ] || [ "$highest" != "$current" ]; then
  echo "::error::$shipping changed, so the version must rise above $base's $base_version (it is $current)." >&2
  echo "Run scripts/bump-version.sh patch (fix) or minor (feature)." >&2
  exit 1
fi
echo "Version $base_version -> $current."
