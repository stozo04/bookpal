#!/usr/bin/env bash
# Raises the product version everywhere it is written. See AGENTS.md, "Versioning".
# Usage: scripts/bump-version.sh patch|minor|major
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
source scripts/version-files.sh

part="${1:-}"
case "$part" in patch|minor|major) ;; *) echo "Usage: $0 patch|minor|major" >&2; exit 2 ;; esac
single_version HEAD >/dev/null

next="$(cd Web && npm version "$part" --no-git-tag-version)"
next="${next#v}"
(cd Backend && npm version "$next" --no-git-tag-version --allow-same-version >/dev/null)
sed -i.bak -E "s/^( *MARKETING_VERSION: *)[0-9.]+/\1$next/" project.yml
sed -i.bak -E "s/^([[:space:]]*MARKETING_VERSION = )[0-9.]+;/\1$next;/" Reader.xcodeproj/project.pbxproj
rm project.yml.bak Reader.xcodeproj/project.pbxproj.bak
echo "$next"
