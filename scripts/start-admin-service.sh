#!/usr/bin/env bash

if [[ ! -t 0 ]]; then
  printf '%s\n' 'Run npm run service:admin in an interactive terminal to enter the administrator password.' >&2
  exit 1
fi

while true; do
  printf 'OmniDocs administrator password (hidden, 16–128 characters): ' >&2
  if ! IFS= read -r -s OMNIDOCS_ADMIN_PASSWORD; then
    printf '\nAdministrator sign-in setup cancelled.\n' >&2
    exit 1
  fi
  printf '\n' >&2

  password_length=${#OMNIDOCS_ADMIN_PASSWORD}
  if (( password_length == 0 )); then
    printf 'No password entered. Type your password before pressing Enter.\n' >&2
  elif (( password_length < 16 )); then
    printf 'Password too short. Use at least 16 characters.\n' >&2
  elif (( password_length > 128 )); then
    printf 'Password too long. Use at most 128 characters.\n' >&2
  else
    break
  fi
done

export OMNIDOCS_ADMIN_USERNAME="${OMNIDOCS_ADMIN_USERNAME:-admin}"
export OMNIDOCS_ADMIN_PASSWORD
exec node --import tsx scripts/start-service.ts --admin
