#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
umask 077
source scripts/compose-env.sh

candidate="$(mktemp .env.setup.XXXXXX)"
trap 'rm -f -- "$candidate"' EXIT
if [[ -f .env ]]; then cat .env > "$candidate"; else cat .env.example > "$candidate"; fi

interactive=false
if [[ -t 0 && -t 2 ]]; then interactive=true; fi
blue='' reset=''
if $interactive && [[ "${TERM:-dumb}" != dumb && "${NO_COLOR:-}" == '' ]]; then
  blue=$'\033[1;36m'
  reset=$'\033[0m'
fi
section() { printf '\n%s  %s%s\n' "$blue" "$1" "$reset" >&2; }
setting() {
  local value
  value="$(env_value "$1" "$candidate")"
  printf '%s\n' "${value:-${2:-}}"
}
save() { append_value "$1" "$2" "$candidate"; }
ask() {
  local label="$1" default="${2:-}" answer
  if [[ -n "$default" ]]; then printf '  %s [%s] ' "$label" "$default" >&2
  else printf '  %s ' "$label" >&2; fi
  IFS= read -r answer || exit 2
  printf '%s\n' "${answer:-$default}"
}
secret() {
  local answer
  IFS= read -rsp "  $1 " answer || exit 2
  printf '\n' >&2
  printf '%s\n' "$answer"
}
fail() { printf '%s\n' "$*" >&2; exit 2; }

prompt_admin_password() {
  local prompt="$1" password confirmation
  while true; do
    password="$(secret "$prompt")"
    [[ -n "$password" ]] || return 0
    if ! admin_password_valid "$password"; then
      printf '  Use a password with 16–128 characters. Try again.\n' >&2
      continue
    fi
    confirmation="$(secret 'Confirm administrator password')"
    if [[ "$password" != "$confirmation" ]]; then
      printf '  The passwords did not match. Try again.\n' >&2
      continue
    fi
    local verifier
    verifier="$(printf '%s' "$password" | hash_admin_password)" || fail 'Unable to hash the administrator password.'
    save OMNIDOCS_ADMIN_PASSWORD_HASH "$verifier"
    save OMNIDOCS_ADMIN_PASSWORD ''
    return 0
  done
}

access="${OMNIDOCS_ACCESS_OVERRIDE:-$(setting OMNIDOCS_ACCESS_MODE https)}"
database="$(setting OMNIDOCS_DATABASE_MODE bundled)"

if $interactive; then
  printf '\n%s  ╭─ OmniDocs Setup ────────────────────╮%s\n' "$blue" "$reset" >&2
  section '1  Access'
  if [[ -z "${OMNIDOCS_ACCESS_OVERRIDE:-}" ]]; then
    printf '  1. HTTPS with Caddy\n  2. Local preview over SSH\n' >&2
    case "$(ask 'Choose access mode' "$([[ "$access" == direct ]] && printf 2 || printf 1)")" in
      1) access=https;; 2) access=direct;; *) fail 'Choose 1 or 2.';;
    esac
  fi
  if [[ "$access" == https ]]; then
    host="$(ask 'Domain name or IPv4 address' "$(setting OMNIDOCS_SITE_HOST localhost)")"
    [[ "$host" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || fail 'Enter a host without a scheme or port.'
    bind="$(ask 'Listen on IPv4 address' "$(setting OMNIDOCS_BIND_ADDRESS 127.0.0.1)")"
    [[ "$bind" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || fail 'Enter a listen address such as 0.0.0.0.'
    port="$(ask 'HTTPS port' "$(setting OMNIDOCS_HTTPS_PORT 8443)")"
    [[ "$port" =~ ^[0-9]{1,5}$ ]] && ((10#$port>=1 && 10#$port<=65535)) || fail 'Choose a port from 1 to 65535.'
    save OMNIDOCS_SITE_HOST "$host"
    save OMNIDOCS_BIND_ADDRESS "$bind"
    save OMNIDOCS_HTTPS_PORT "$((10#$port))"
  else
    printf '  Preview listens at http://127.0.0.1:8417 through the SSH tunnel.\n' >&2
  fi

  section '2  Administrator'
  username="$(ask 'Administrator username' "$(setting OMNIDOCS_ADMIN_USERNAME admin)")"
  [[ "$username" =~ ^[A-Za-z0-9._-]{3,64}$ ]] || fail 'Use 3–64 letters, digits, dots, underscores or hyphens.'
  save OMNIDOCS_ADMIN_USERNAME "$username"
  if [[ ! -s .env ]]; then
    prompt_admin_password 'Initial administrator password (Enter to set it after startup)'
  fi
  if [[ "$access" == https ]]; then
    networks="$(ask 'Admin IPs or VPN CIDRs, separated by spaces' "$(setting OMNIDOCS_ADMIN_NETWORKS '127.0.0.1/32 ::1/128')")"
    [[ "$networks" =~ ^[0-9A-Fa-f.:/[:space:]]+$ ]] || fail 'Enter explicit IPv4 or IPv6 addresses or CIDRs.'
    save OMNIDOCS_ADMIN_NETWORKS "$networks"
  fi

  section '3  Email delivery'
  if has_value OMNIDOCS_MAIL_WEBHOOK "$candidate"; then
    mail="$(ask 'Mail webhook URL (Enter keeps the current URL)')"
  elif [[ "$access" == direct ]]; then
    mail="$(ask 'Mail webhook URL (optional for local use)')"
  else
    mail="$(ask 'Mail webhook URL for verification and password reset')"
  fi
  if [[ -n "$mail" ]]; then
    [[ "$mail" =~ ^https://[^[:space:]]+$ ]] || fail 'Enter a valid HTTPS webhook URL.'
    save OMNIDOCS_MAIL_WEBHOOK "$mail"
  fi
  if [[ -n "$mail" ]]; then
    token="$(secret 'Optional Bearer token for this URL (Enter for no token)')"
    save OMNIDOCS_MAIL_TOKEN "$token"
  else
    token="$(secret 'Optional Bearer token (Enter keeps the current value)')"
    if [[ -n "$token" ]]; then save OMNIDOCS_MAIL_TOKEN "$token"; fi
  fi
  unset token

  section '4  PostgreSQL'
  printf '  1. Bundled PostgreSQL in Docker\n  2. External PostgreSQL\n' >&2
  case "$(ask 'Choose database' "$([[ "$database" == external ]] && printf 2 || printf 1)")" in
    1) database=bundled;;
    2)
      database=external
      url="$(secret 'External PostgreSQL URL (hidden; Enter keeps the current URL)')"
      if [[ -n "$url" ]]; then
        [[ "$url" =~ ^postgres(ql)?://[^[:space:]]+$ ]] || fail 'Enter a postgres:// or postgresql:// connection URL.'
        save OMNIDOCS_DATABASE_URL "$url"
      fi
      unset url
      ;;
    *) fail 'Choose 1 or 2.';;
  esac
fi

mail="$(env_value OMNIDOCS_MAIL_WEBHOOK "$candidate")"
if [[ "$access" != direct || -n "$mail" ]]; then
  [[ "$mail" =~ ^https://[^[:space:]]+$ ]] || fail 'Set an HTTPS OMNIDOCS_MAIL_WEBHOOK or run setup interactively to configure email.'
fi
unset mail
otp_key="$(env_value OMNIDOCS_ADMIN_TOTP_SECRET "$candidate")"
[[ -z "$otp_key" || "$otp_key" =~ ^[A-Z2-7]{32}$ ]] || fail 'OMNIDOCS_ADMIN_TOTP_SECRET must be exactly 32 Base32 characters (A–Z and 2–7).'
unset otp_key

compose=(docker compose --env-file "$candidate" -f compose.yaml)
case "$access" in
  direct) compose+=(-f compose.direct.yaml);;
  https) ;;
  *) fail 'OMNIDOCS_ACCESS_MODE must be https or direct.';;
esac
case "$database" in
  external)
    has_value OMNIDOCS_DATABASE_URL "$candidate" || fail 'Enter the external PostgreSQL connection URL.'
    compose+=(-f compose.external.yaml)
    ;;
  bundled)
    if ! has_value OMNIDOCS_POSTGRES_PASSWORD "$candidate"; then
      volumes="$(docker volume ls --format '{{.Name}}')"
      if grep -Fxq omnidocs_postgres_data <<< "$volumes"; then
        $interactive || fail 'PostgreSQL storage already exists. Set its current password in OMNIDOCS_POSTGRES_PASSWORD in .env.'
        password="$(secret 'Existing PostgreSQL volume found. Enter its current password')"
        [[ -n "$password" ]] || fail 'The existing database password is required.'
      else
        password="$(openssl rand -hex 24)"
      fi
      save OMNIDOCS_POSTGRES_PASSWORD "$password"
      unset password
    fi
    ;;
  *) fail 'OMNIDOCS_DATABASE_MODE must be bundled or external.';;
esac
save OMNIDOCS_ACCESS_MODE "$access"
save OMNIDOCS_DATABASE_MODE "$database"
"${compose[@]}" config --quiet
legacy_password="$(compose_admin_password "${compose[@]}")" || legacy_password=''
if [[ -n "$legacy_password" ]]; then
  if admin_password_valid "$legacy_password"; then
    verifier="$(printf '%s' "$legacy_password" | hash_admin_password)" || fail 'Unable to hash the legacy administrator password.'
    save OMNIDOCS_ADMIN_PASSWORD_HASH "$verifier"
    save OMNIDOCS_ADMIN_PASSWORD ''
    unset verifier
  else
    $interactive || fail 'The legacy administrator password is invalid. Run setup interactively.'
    prompt_admin_password 'New password (Enter to reset it after startup)'
    save OMNIDOCS_ADMIN_PASSWORD ''
  fi
fi
unset legacy_password

if $interactive; then
  section '5  Review'
  email_summary='Disabled (local registration can use administrator approval or automatic activation)'
  if has_value OMNIDOCS_MAIL_WEBHOOK "$candidate"; then email_summary='Webhook configured'; fi
  printf '  Access       %s\n  Admin        %s\n  Email        %s\n  PostgreSQL   %s\n' \
    "$access" "$(setting OMNIDOCS_ADMIN_USERNAME admin)" "$email_summary" "$database" >&2
  if [[ "$database" != "$(env_value OMNIDOCS_DATABASE_MODE)" && -f .env ]]; then
    printf '  This changes which database the app connects to. Data migration is a separate operation.\n' >&2
  fi
  case "$(ask 'Save configuration?' yes)" in
    yes|y|Y) ;; *) fail 'Setup cancelled.';;
  esac
fi

mv -f -- "$candidate" .env
printf '\nSettings saved to .env. Use ./omnidocs update to build and start the service.\n'
if [[ "$access" == https ]]; then printf 'Open /admin/ from an approved management network to set up your authenticator.\n'; fi
