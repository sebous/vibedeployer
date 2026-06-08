#!/usr/bin/env bash
# vibedeploy — upload & version HTML docs on vibedeployer.
# Deps: curl. Config via env:
#   VIBEDEPLOYER_TOKEN   (required)  API key, e.g. vd_...
#   VIBEDEPLOYER_URL     (optional)  host, default https://vibedeployer.sebous.workers.dev
set -euo pipefail

URL="${VIBEDEPLOYER_URL:-https://vibedeployer.sebous.workers.dev}"
URL="${URL%/}"

die() { echo "error: $*" >&2; exit 1; }
[ -n "${VIBEDEPLOYER_TOKEN:-}" ] || die "set VIBEDEPLOYER_TOKEN (your vd_... API key)"
command -v curl >/dev/null || die "curl is required"

AUTH=(-H "Authorization: Bearer ${VIBEDEPLOYER_TOKEN}")

usage() {
  cat >&2 <<EOF
usage:
  vibedeploy create <file.html> [--slug NAME] [--title TITLE] [--password PW]   create a doc (+v1)
  vibedeploy push   <slug> <file.html> [--comment MSG]          add a new version
  vibedeploy list                                               list your docs
  vibedeploy get    <slug>                                      doc + version metadata
  vibedeploy password <slug> <PW|--remove>                      set/rotate/remove doc password
  vibedeploy delete <slug>                                      delete a doc
EOF
  exit 1
}

# JSON-escape a string value (handles backslash, quote, control chars).
json_str() { printf %s "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

cmd="${1:-}"; shift || usage
case "$cmd" in
  create)
    file="${1:-}"; shift || true
    [ -f "$file" ] || die "file not found: $file"
    q=""
    while [ $# -gt 0 ]; do case "$1" in
      --slug)     q="${q}&custom_slug=$2"; shift 2;;
      --title)    q="${q}&title=$(printf %s "$2" | sed 's/ /%20/g')"; shift 2;;
      --password) q="${q}&password=$(printf %s "$2" | sed 's/ /%20/g')"; shift 2;;
      *) die "unknown flag: $1";;
    esac; done
    curl -fsS -X POST "${URL}/api/docs?${q#&}" "${AUTH[@]}" \
      -H "Content-Type: text/html" --data-binary @"$file"
    echo ;;
  push)
    slug="${1:-}"; file="${2:-}"; shift 2 || usage
    [ -n "$slug" ] || usage; [ -f "$file" ] || die "file not found: $file"
    q=""
    while [ $# -gt 0 ]; do case "$1" in
      --comment) q="?comment=$(printf %s "$2" | sed 's/ /%20/g')"; shift 2;;
      *) die "unknown flag: $1";;
    esac; done
    curl -fsS -X POST "${URL}/api/docs/${slug}/versions${q}" "${AUTH[@]}" \
      -H "Content-Type: text/html" --data-binary @"$file"
    echo ;;
  list)   curl -fsS "${URL}/api/docs" "${AUTH[@]}"; echo ;;
  get)    [ -n "${1:-}" ] || usage; curl -fsS "${URL}/api/docs/$1" "${AUTH[@]}"; echo ;;
  password)
    slug="${1:-}"; pw="${2:-}"; shift 2 || usage
    [ -n "$slug" ] && [ -n "$pw" ] || usage
    if [ "$pw" = "--remove" ]; then body='{"password":null}'
    else body="{\"password\":\"$(json_str "$pw")\"}"; fi
    curl -fsS -X PUT "${URL}/api/docs/${slug}/password" "${AUTH[@]}" \
      -H "Content-Type: application/json" -d "$body"
    echo ;;
  delete) [ -n "${1:-}" ] || usage; curl -fsS -X DELETE "${URL}/api/docs/$1" "${AUTH[@]}"; echo ;;
  *) usage ;;
esac
