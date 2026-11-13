#!/usr/bin/env bash
#
# Derive the Android versionCode / versionName from a release tag.
#
#   scripts/app-version.sh v5.2.0
#     version_name=5.2.0
#     version_code=50200
#
# The scheme is  major * 10000 + minor * 100 + patch,  so the integer always
# sorts the same way the human version does:
#
#   5.1.0  -> 50100      5.2.0  -> 50200      5.2.1  -> 50201
#   5.9.0  -> 50900      5.10.0 -> 51000      6.0.0  -> 60000
#
# Why a derived code instead of a counter: Play requires versionCode to increase
# on every upload and NEVER lets it come back down, so the one thing that must
# not happen is two different builds claiming the same code, or a rebuild of an
# old tag producing a new one. Deriving it from the tag makes the mapping total
# and reproducible -- the same tag always yields the same pair, on any machine.
#
# Output is `key=value` lines, which is exactly the format GITHUB_OUTPUT wants:
#   scripts/app-version.sh "$TAG" >> "$GITHUB_OUTPUT"
#
# NOTE: builds before this scheme used a hand-maintained counter that reached 6.
# Every code this script emits is far above that, so the sequence keeps rising.
# Going back to small counters after shipping a 5xxxx code is impossible.
set -euo pipefail

usage() {
  echo "usage: $(basename "$0") <tag>    e.g. v5.2.0 or 5.2.0" >&2
  exit 2
}

[ $# -eq 1 ] || usage
raw="$1"
[ -n "$raw" ] || usage

# Accept both `v5.2.0` and `5.2.0`.
version="${raw#v}"

if ! [[ "$version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  echo "error: '$raw' is not MAJOR.MINOR.PATCH (e.g. v5.2.0)" >&2
  exit 1
fi

major="${BASH_REMATCH[1]}"
minor="${BASH_REMATCH[2]}"
patch="${BASH_REMATCH[3]}"

# Two digits each is what keeps the arithmetic monotonic. 5.1.100 would collide
# with 5.2.0 (both 50200), so refuse it rather than ship a duplicate code.
if [ "$minor" -gt 99 ] || [ "$patch" -gt 99 ]; then
  echo "error: minor and patch must each be <= 99 (got $version)" >&2
  echo "       bump the next component up instead." >&2
  exit 1
fi

# Strip leading zeros so 05 is not read as octal by the shell.
code=$(( 10#$major * 10000 + 10#$minor * 100 + 10#$patch ))

if [ "$code" -gt 2100000000 ]; then
  echo "error: versionCode $code exceeds Play's 2100000000 limit" >&2
  exit 1
fi

echo "version_name=$version"
echo "version_code=$code"
