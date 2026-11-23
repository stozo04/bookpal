#!/usr/bin/env bash
# Shared by bump-version.sh and check-version-bump.sh: where the product version lives,
# and which changed paths cannot affect the shipped app, backend or web.

version_sources=(
  "Web/package.json"
  "Web/package-lock.json"
  "Backend/package.json"
  "Backend/package-lock.json"
  "project.yml"
  "Reader.xcodeproj/project.pbxproj"
)

# Prints "<file> <version>" for every place the version is written, read from git revision $1
# (or the working tree when $1 is empty).
read_versions() {
  local rev="$1" file text
  for file in "${version_sources[@]}"; do
    if [ -n "$rev" ]; then
      text="$(git show "$rev:$file" 2>/dev/null)" || { echo "$file missing"; continue; }
    else
      text="$(cat "$file")"
    fi
    case "$file" in
      *.json) echo "$file $(node -e 'console.log(JSON.parse(require("fs").readFileSync(0, "utf8")).version)' <<< "$text")" ;;
      project.yml) echo "$file $(sed -n 's/^ *MARKETING_VERSION: *\([0-9.]*\).*/\1/p' <<< "$text" | sort -u | paste -sd, -)" ;;
      *.pbxproj) echo "$file $(sed -n 's/^[[:space:]]*MARKETING_VERSION = \([0-9.]*\);/\1/p' <<< "$text" | sort -u | paste -sd, -)" ;;
    esac
  done
}

# True when a changed path cannot change what ships: CI config, agent config, docs.
is_untouched_path() {
  case "$1" in
    .github/*|.claude/*|docs/*|*.md) return 0 ;;
    *) return 1 ;;
  esac
}
