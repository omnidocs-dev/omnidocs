#!/usr/bin/env bash
# Upload the local source and reconcile the Compose project on the server.
set -euo pipefail

target="${1:-}"
if [[ ! "$target" =~ ^[[:alnum:]_][[:alnum:]_.-]*@[[:alnum:]][[:alnum:].-]*$ ]]; then
  printf 'Enter an SSH target in the format user@host.\n' >&2
  exit 2
fi
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ssh_options=(-o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new)

ssh "${ssh_options[@]}" "$target" 'docker compose version'
COPYFILE_DISABLE=1 tar --format ustar -C "$root" -czf - -- \
  Dockerfile compose.yaml compose.direct.yaml compose.external.yaml .dockerignore .env.example deploy omnidocs \
  package.json package-lock.json tsconfig.json vite.config.ts index.html \
  src shared server scripts |
  ssh "${ssh_options[@]}" "$target" 'umask 077; mkdir -p /opt/omnidocs; tar -xzf - -C /opt/omnidocs'

if [[ -t 0 ]]; then
  ssh_options+=(-t)
fi
ssh "${ssh_options[@]}" "$target" 'set -eu
  cd /opt/omnidocs
  if ! ./omnidocs config-check >/dev/null 2>&1; then
    ./omnidocs setup
  fi
  ./omnidocs update
  ./omnidocs status
'
