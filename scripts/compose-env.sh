# Read selected settings without evaluating the dotenv file as shell code.
env_value() {
  local key="$1" file="${2:-.env}"
  if [[ "${!key+set}" == set ]]; then printf '%s\n' "${!key}"; return; fi
  [[ -f "$file" ]] || return 0
  awk -v key="$key" '
    $0 ~ "^[[:space:]]*(export[[:space:]]+)?" key "[[:space:]]*[=:]" {
      sub(/^[^=:]*[=:][[:space:]]*/, "")
      sub(/[[:space:]]+$/, "")
      if ($0 ~ /^\047/ && match($0, /\047[[:space:]]*(#.*)?$/)) $0=substr($0,2,RSTART-2)
      else if ($0 ~ /^"/ && match($0, /"[[:space:]]*(#.*)?$/)) $0=substr($0,2,RSTART-2)
      else sub(/(^|[[:space:]])#.*$/, "")
      value=$0
    }
    END {if (length(value)) print value}
  ' "$file"
}

has_value() {
  [[ -n "$(env_value "$@")" ]]
}

compose_env_value() {
  local key="$1"
  shift
  "$@" config --environment | awk -v key="$key" '
    index($0, key "=")==1 {print substr($0,length(key)+2); found=1}
    END {if (!found) exit 1}
  '
}

admin_password_valid() {
  local bytes
  # The backend measures JavaScript string length in UTF-16 code units.
  bytes="$(printf '%s' "$1" | iconv -f UTF-8 -t UTF-16LE | wc -c)" || return 1
  (( bytes >= 32 && bytes <= 256 ))
}

compose_admin_password() {
  if [[ "${OMNIDOCS_ADMIN_PASSWORD+x}" == x ]]; then
    printf '%s' "$OMNIDOCS_ADMIN_PASSWORD"
  else
    compose_env_value OMNIDOCS_ADMIN_PASSWORD "$@"
  fi
}

hash_admin_password() {
  local runtime=(node)
  if ! command -v node >/dev/null 2>&1; then
    runtime=(docker run --rm -i --network none node:24-bookworm-slim node)
  fi
  "${runtime[@]}" -e '
    const {randomBytes,scryptSync}=require("node:crypto");
    const password=require("node:fs").readFileSync(0,"utf8");
    if(password.length<16||password.length>128){console.error("Use a password with 16–128 characters.");process.exit(2);}
    const salt=randomBytes(16).toString("hex");
    console.log(salt+":"+scryptSync(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024}).toString("hex"));
  '
}

append_value() {
  local key="$1" value="$2" file="${3:-.env}"
  local temp
  temp="$(mktemp "${file}.XXXXXX")"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//\$/\$\$}"
  {
    awk -v key="$key" '$0 !~ "^[[:space:]]*(export[[:space:]]+)?" key "[[:space:]]*[=:]"' "$file"
    printf '%s="%s"\n' "$key" "$value"
  } > "$temp"
  mv -f -- "$temp" "$file"
}
