#!/usr/bin/env bash
# Sourced by bump-version.sh and check-version-bump.sh.

version_sources=(
  "Web/package.json"
  "Web/package-lock.json"
  "Backend/package.json"
  "Backend/package-lock.json"
  "project.yml"
  "Reader.xcodeproj/project.pbxproj"
)

# Prints "<file> <version>" for every place the version is written at git revision $1.
read_versions() {
  local rev="$1" file text
  for file in "${version_sources[@]}"; do
    text="$(git show "$rev:$file" 2>/dev/null)" || { echo "$file missing"; continue; }
    case "$file" in
      *-lock.json) echo "$file $(node -e 'const l = JSON.parse(require("fs").readFileSync(0, "utf8")); console.log([...new Set([l.version, l.packages?.[""]?.version])].join(","))' <<< "$text")" ;;
      *.json) echo "$file $(node -e 'console.log(JSON.parse(require("fs").readFileSync(0, "utf8")).version)' <<< "$text")" ;;
      project.yml) echo "$file $(sed -n 's/^ *MARKETING_VERSION: *\([0-9.]*\).*/\1/p' <<< "$text" | sort -u | paste -sd, -)" ;;
      *.pbxproj) echo "$file $(sed -n 's/^[[:space:]]*MARKETING_VERSION = \([0-9.]*\);/\1/p' <<< "$text" | sort -u | paste -sd, -)" ;;
    esac
  done
}

# Prints the one version written at git revision $1, or fails listing every place.
single_version() {
  local rev="$1" versions
  versions="$(read_versions "$rev" | cut -d' ' -f2- | sort -u)"
  if [ "$(wc -l <<< "$versions")" -ne 1 ] || ! [[ "$versions" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "::error::The version must be one MAJOR.MINOR.PATCH value everywhere (at $rev):" >&2
    read_versions "$rev" | sed 's/^/  /' >&2
    echo "Bump with scripts/bump-version.sh, which writes all of them." >&2
    return 1
  fi
  echo "$versions"
}

# True when a changed path cannot change what ships: CI config, agent config, docs.
is_untouched_path() {
  case "$1" in
    .github/*|.claude/*|docs/*) return 0 ;;
    */*) case "${1##*/}" in README.md|AGENTS.md|CLAUDE.md) return 0 ;; esac; return 1 ;;
    *.md) return 0 ;;
    *) return 1 ;;
  esac
}
