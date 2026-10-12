import { PORACODE_REMOTE_PROTOCOL_VERSION } from "./remote/protocol";

/**
 * Shell-side owner state for the remote SSH bootstrap.
 *
 * These scripts run on the remote host (`ssh <target> sh -s -- …`) and own the
 * only copy of the remote owner identity. The identity record is private,
 * versioned shell state: it is deliberately NOT a wire format, and it is never
 * authority to signal a process by itself. Authority comes from an
 * authenticated host-control `describe` (`server.cjs status --json`) whose
 * owner generation, profile namespace and data root match the record.
 *
 * Version history:
 * - 1: initial key=value record (pid, start token, owner generation, profile,
 *      data root, runtime hash, port).
 */
export const SSH_OWNER_IDENTITY_VERSION = 1;

/**
 * Versioned client-side launch result. A reply with a different protocol is
 * rejected instead of guessed at; the encoding is added deliberately so a
 * future script change cannot be read by an older parser.
 */
export const SSH_LAUNCH_PROTOCOL_VERSION = 1;

/**
 * NOTE: these snippets are `String.raw` templates. A backslash before `${`
 * would survive raw and reach the shell literally, so a literal shell
 * parameter expansion is emitted with an explicit `"$"` interpolation
 * (`${"$"}{NAME}`); only the TS constants below are interpolated intentionally.
 */
export const REMOTE_NODE_ENV_SCRIPT = String.raw`
prepend_path_if_dir() {
  if [ -d "$1" ]; then
    case ":$PATH:" in
      *":$1:"*) ;;
      *) PATH="$1:$PATH" ;;
    esac
  fi
}

poracode_node_is_compatible() {
  node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 24 || (major === 24 && minor >= 10) ? 0 : 1)' >/dev/null 2>&1
}

ensure_poracode_node() {
  prepend_path_if_dir "$HOME/.local/bin"
  prepend_path_if_dir "$HOME/bin"
  prepend_path_if_dir "/opt/homebrew/bin"
  prepend_path_if_dir "/usr/local/bin"
  prepend_path_if_dir "/usr/bin"
  prepend_path_if_dir "/bin"

  if command -v node >/dev/null 2>&1 && poracode_node_is_compatible; then
    return 0
  fi

  VOLTA_HOME="${"$"}{VOLTA_HOME:-$HOME/.volta}"
  export VOLTA_HOME
  prepend_path_if_dir "$VOLTA_HOME/bin"

  prepend_path_if_dir "$HOME/.asdf/shims"
  prepend_path_if_dir "$HOME/.asdf/bin"
  if [ -s "$HOME/.asdf/asdf.sh" ]; then
    . "$HOME/.asdf/asdf.sh" >/dev/null 2>&1 || true
  fi

  prepend_path_if_dir "$HOME/.local/share/mise/shims"
  prepend_path_if_dir "$HOME/.mise/shims"
  if ! command -v node >/dev/null 2>&1 && command -v mise >/dev/null 2>&1; then
    eval "$(mise activate sh)" >/dev/null 2>&1 || true
  fi

  if ! command -v node >/dev/null 2>&1 && command -v fnm >/dev/null 2>&1; then
    eval "$(fnm env --shell bash)" >/dev/null 2>&1 || true
    fnm use --silent-if-unchanged >/dev/null 2>&1 || fnm use default >/dev/null 2>&1 || true
  fi

  prepend_path_if_dir "$HOME/.nodenv/bin"
  prepend_path_if_dir "$HOME/.nodenv/shims"
  if ! command -v node >/dev/null 2>&1 && command -v nodenv >/dev/null 2>&1; then
    eval "$(nodenv init -)" >/dev/null 2>&1 || true
  fi

  NVM_DIR="${"$"}{NVM_DIR:-$HOME/.nvm}"
  export NVM_DIR
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh"
    nvm use --silent default >/dev/null 2>&1 || nvm use --silent node >/dev/null 2>&1 || nvm use --silent --lts >/dev/null 2>&1 || true
  fi
  if ! command -v node >/dev/null 2>&1 && [ -d "$NVM_DIR/versions/node" ]; then
    for PORACODE_NODE_BIN in "$NVM_DIR"/versions/node/*/bin; do
      prepend_path_if_dir "$PORACODE_NODE_BIN"
    done
  fi

  command -v node >/dev/null 2>&1 && poracode_node_is_compatible
}
`;

/**
 * POSIX-sh primitives shared by the install and launch scripts: process
 * identity tokens, per-profile locks with bounded waits, authenticated owner
 * discovery, and the versioned launch result emitters.
 *
 * Every function is safe under `set -eu` and avoids `local` (POSIX sh), so
 * generated-script tests can run it with any `/bin/sh`.
 *
 * Lock protocol: a lock is an atomically `mkdir`ed directory whose holder
 * record is published with one `mv` (never a partial pid/token). Stale
 * reclamation is only attempted when a complete recorded identity is proven
 * dead, and it runs through an exclusive `.reap` claim that revalidates the
 * exact holder record before removing anything. A holderless lock, a live
 * holder, or an unprovable identity is waited on (bounded) and refused, never
 * removed — a lock acquired by another contender cannot be deleted here.
 */
export const REMOTE_OWNER_SHELL_LIBRARY = String.raw`
# Hard wall-clock bounds for subprocesses this script starts. An old or
# wedged runtime must not stall a launch past the client's own ssh deadline,
# so every status/probe run is bounded rather than loop-counted. Tests may
# lower the status bound.
PORACODE_OWNER_STATUS_TIMEOUT_MS="${"$"}{PORACODE_OWNER_STATUS_TIMEOUT_MS:-15000}"
case "$PORACODE_OWNER_STATUS_TIMEOUT_MS" in
  ''|*[!0-9]*) PORACODE_OWNER_STATUS_TIMEOUT_MS=15000 ;;
esac
if [ "$PORACODE_OWNER_STATUS_TIMEOUT_MS" -gt 300000 ]; then
  PORACODE_OWNER_STATUS_TIMEOUT_MS=300000
fi
PC_OWNER_STATUS_TIMEOUT_SECONDS=$(( (PORACODE_OWNER_STATUS_TIMEOUT_MS + 999) / 1000 ))
PC_PROBE_TIMEOUT_SECONDS=15

# Runs one command this shell spawned itself with a wall-clock bound. The
# command is the only process signalled here, and only because this shell
# started it; 124 reports the bound, any other status is the command's own.
# The first argument is an input file for the command, or "" for no input
# (an asynchronous list gets /dev/null on stdin, so a file must be explicit).
poracode_run_bounded() {
  _pc_run_input="$1"
  _pc_run_seconds="$2"
  shift 2
  case "$_pc_run_seconds" in
    ''|*[!0-9]*) _pc_run_seconds=0 ;;
  esac
  if [ -n "$_pc_run_input" ]; then
    "$@" <"$_pc_run_input" &
  else
    "$@" &
  fi
  _pc_run_pid=$!
  _pc_run_deadline=$(( $(date +%s) + _pc_run_seconds ))
  while kill -0 "$_pc_run_pid" 2>/dev/null; do
    if [ "$(date +%s)" -ge "$_pc_run_deadline" ]; then
      kill -TERM "$_pc_run_pid" 2>/dev/null || true
      sleep 0.2
      kill -KILL "$_pc_run_pid" 2>/dev/null || true
      wait "$_pc_run_pid" 2>/dev/null || true
      return 124
    fi
    sleep 0.2
  done
  _pc_run_rc=0
  wait "$_pc_run_pid" 2>/dev/null || _pc_run_rc=$?
  return "$_pc_run_rc"
}

# ── Process identity ──────────────────────────────────────────────────────
# A PID alone is never authority. The token binds a PID to one process
# lifetime using the kernel boot id plus the process start time; a recycled
# PID has a different token and must not be treated as the recorded owner.
# An unreadable or unrecognizable token fails closed: callers must not signal.
poracode_parse_proc_stat_start() {
  # /proc/<pid>/stat field 2 (comm) is parenthesized and may itself contain
  # spaces or ')', so fields are counted after the FINAL ')': starttime is the
  # 20th field of that tail. Anything unrecognizable prints nothing and fails.
  _pc_stat_line=""
  IFS= read -r _pc_stat_line || return 1
  # sed strips through the last ')' without needing a brace expansion.
  _pc_stat_tail="$(printf '%s\n' "$_pc_stat_line" | sed -e 's/^.*)//')"
  [ -n "$_pc_stat_tail" ] || return 1
  [ "$_pc_stat_tail" != "$_pc_stat_line" ] || return 1
  # Intentional word splitting of the numeric tail.
  set -- $_pc_stat_tail
  [ "$#" -ge 20 ] || return 1
  shift 19
  case "$1" in
    ''|*[!0-9]*) return 1 ;;
  esac
  printf '%s\n' "$1"
}

poracode_process_token() {
  _pc_token_pid="$1"
  [ -n "$_pc_token_pid" ] || return 1
  case "$_pc_token_pid" in
    *[!0-9]*) return 1 ;;
  esac
  if [ -r "/proc/$_pc_token_pid/stat" ]; then
    # /proc is this platform's identity source; if its fields cannot be read
    # the token is unknown, and a different clock must not be substituted.
    _pc_token_boot="$(cat /proc/sys/kernel/random/boot_id 2>/dev/null || true)"
    _pc_token_start="$(poracode_parse_proc_stat_start <"/proc/$_pc_token_pid/stat" 2>/dev/null || true)"
    if [ -n "$_pc_token_boot" ] && [ -n "$_pc_token_start" ]; then
      printf '%s:%s\n' "$_pc_token_boot" "$_pc_token_start"
      return 0
    fi
    return 1
  fi
  # The token must be identical no matter which PATH the computing shell has,
  # so tools are resolved by absolute location first and ps runs under the C
  # locale (a localized lstart would otherwise differ between sessions).
  _pc_token_ps="ps"
  if [ -x /bin/ps ]; then
    _pc_token_ps="/bin/ps"
  fi
  _pc_token_start="$(LC_ALL=C "$_pc_token_ps" -o lstart= -p "$_pc_token_pid" 2>/dev/null | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' || true)"
  if [ -n "$_pc_token_start" ]; then
    _pc_token_boot=""
    for _pc_token_sysctl in /usr/sbin/sysctl /sbin/sysctl /usr/bin/sysctl /bin/sysctl; do
      if [ -x "$_pc_token_sysctl" ]; then
        _pc_token_boot="$("$_pc_token_sysctl" -n kern.boottime 2>/dev/null || true)"
        break
      fi
    done
    if [ -z "$_pc_token_boot" ]; then
      _pc_token_boot="$(sysctl -n kern.boottime 2>/dev/null || true)"
    fi
    printf '%s:%s\n' "$_pc_token_boot" "$_pc_token_start"
    return 0
  fi
  return 1
}

# ── Per-profile locks ─────────────────────────────────────────────────────
poracode_lock_write_holder() {
  _pc_hold_dir="$1"
  _pc_hold_token="$2"
  [ -d "$_pc_hold_dir" ] || return 1
  _pc_hold_tmp="$_pc_hold_dir/.holder.$$"
  if ! {
    printf 'pid=%s\n' "$$"
    printf 'token=%s\n' "$_pc_hold_token"
  } >"$_pc_hold_tmp" 2>/dev/null; then
    rm -f "$_pc_hold_tmp" 2>/dev/null || true
    return 1
  fi
  # One rename publishes the complete record, so no reader can observe a
  # partial pid/token. The temp file lives inside the lock directory: if the
  # directory was replaced underneath us the rename fails instead of writing
  # into a foreign lock.
  if ! mv -f "$_pc_hold_tmp" "$_pc_hold_dir/holder" 2>/dev/null; then
    rm -f "$_pc_hold_tmp" 2>/dev/null || true
    return 1
  fi
  return 0
}

# Removes only a lock directory this shell created but could not publish into.
# rmdir refuses a foreign non-empty lock, so this cannot delete another
# contender's lock.
poracode_lock_abandon() {
  _pc_abandon_dir="$1"
  rm -f "$_pc_abandon_dir/.holder.$$" 2>/dev/null || true
  rmdir "$_pc_abandon_dir" 2>/dev/null || true
}

# 0 = the recorded holder can no longer be the live owner (dead process, or a
# complete start token proving PID reuse). 1 = live or unprovable identity,
# which is never authority to reclaim.
poracode_lock_holder_stale() {
  _pc_stale_pid="$1"
  _pc_stale_token="$2"
  [ -n "$_pc_stale_pid" ] || return 1
  case "$_pc_stale_pid" in
    *[!0-9]*) return 1 ;;
  esac
  [ -n "$_pc_stale_token" ] || return 1
  if kill -0 "$_pc_stale_pid" 2>/dev/null; then
    _pc_stale_now="$(poracode_process_token "$_pc_stale_pid" 2>/dev/null || true)"
    if [ -n "$_pc_stale_now" ] && [ "$_pc_stale_token" != "$_pc_stale_now" ]; then
      return 0
    fi
    return 1
  fi
  return 0
}

# Guarded stale reclamation. Only one reaper can hold the .reap claim inside
# one lock generation, and the exact holder identity is revalidated under that
# claim (including liveness), so a reaper can only ever delete the dead holder
# it observed. A lock acquired by another contender is never removed; a failed
# claim just means another reaper is responsible for it.
poracode_lock_reap() {
  _pc_reap_dir="$1"
  _pc_reap_pid="$2"
  _pc_reap_token="$3"
  poracode_lock_holder_stale "$_pc_reap_pid" "$_pc_reap_token" || return 1
  mkdir "$_pc_reap_dir/.reap" 2>/dev/null || return 1
  _pc_reap_now_pid="$(sed -n 's/^pid=//p' "$_pc_reap_dir/holder" 2>/dev/null | head -n 1)"
  _pc_reap_now_token="$(sed -n 's/^token=//p' "$_pc_reap_dir/holder" 2>/dev/null | head -n 1)"
  if [ "$_pc_reap_now_pid" = "$_pc_reap_pid" ] &&
    [ "$_pc_reap_now_token" = "$_pc_reap_token" ] &&
    poracode_lock_holder_stale "$_pc_reap_now_pid" "$_pc_reap_now_token"; then
    rm -rf "$_pc_reap_dir"
    return 0
  fi
  rmdir "$_pc_reap_dir/.reap" 2>/dev/null || true
  return 1
}

poracode_lock_acquire() {
  _pc_lock_dir="$1"
  _pc_lock_wait_ms="$2"
  _pc_lock_token="$3"
  case "$_pc_lock_wait_ms" in
    ''|*[!0-9]*) _pc_lock_wait_ms=0 ;;
  esac
  _pc_lock_deadline=$(( $(date +%s) + (_pc_lock_wait_ms + 999) / 1000 ))
  while ! mkdir "$_pc_lock_dir" 2>/dev/null; do
    if [ "$(date +%s)" -ge "$_pc_lock_deadline" ]; then
      return 1
    fi
    _pc_lock_pid="$(sed -n 's/^pid=//p' "$_pc_lock_dir/holder" 2>/dev/null | head -n 1)"
    _pc_lock_holder_token="$(sed -n 's/^token=//p' "$_pc_lock_dir/holder" 2>/dev/null | head -n 1)"
    if [ -n "$_pc_lock_pid" ] && poracode_lock_holder_stale "$_pc_lock_pid" "$_pc_lock_holder_token"; then
      poracode_lock_reap "$_pc_lock_dir" "$_pc_lock_pid" "$_pc_lock_holder_token" || true
    fi
    sleep 0.25
  done
  if ! poracode_lock_write_holder "$_pc_lock_dir" "$_pc_lock_token"; then
    poracode_lock_abandon "$_pc_lock_dir"
    return 1
  fi
  return 0
}

# Removes the lock only when this live shell still owns the recorded holder
# (or when the directory is empty and unpublished). A lock that was reaped and
# re-acquired by another contender has a different holder and stays.
poracode_lock_release() {
  _pc_rel_dir="$1"
  _pc_rel_token="$2"
  _pc_rel_pid="$(sed -n 's/^pid=//p' "$_pc_rel_dir/holder" 2>/dev/null | head -n 1)"
  if [ -n "$_pc_rel_pid" ]; then
    if [ "$_pc_rel_pid" = "$$" ]; then
      _pc_rel_holder_token="$(sed -n 's/^token=//p' "$_pc_rel_dir/holder" 2>/dev/null | head -n 1)"
      if [ -n "$_pc_rel_holder_token" ] && [ -n "$_pc_rel_token" ] && [ "$_pc_rel_holder_token" != "$_pc_rel_token" ]; then
        return 0
      fi
      rm -rf "$_pc_rel_dir"
    fi
    return 0
  fi
  poracode_lock_abandon "$_pc_rel_dir"
}

# ── Owner identity record ─────────────────────────────────────────────────
# Private, versioned shell state read only by these scripts. PC_ID_STATUS
# distinguishes "absent" from "unknown" (corrupt, partial or future format):
# an unknown record is preserved, never parsed as this version, never
# overwritten, and never authority to signal.
poracode_identity_read() {
  PC_ID_SEEN=0
  PC_ID_STATUS="absent"
  PC_ID_PID=""
  PC_ID_TOKEN=""
  PC_ID_GENERATION=""
  PC_ID_PROFILE=""
  PC_ID_ROOT=""
  PC_ID_RUNTIME=""
  PC_ID_PORT=""
  [ -f "$1" ] || return 1
  _pc_id_version="$(sed -n 's/^version=//p' "$1" 2>/dev/null | head -n 1)"
  if [ "$_pc_id_version" != "${SSH_OWNER_IDENTITY_VERSION}" ]; then
    PC_ID_STATUS="unknown"
    return 1
  fi
  PC_ID_STATUS="current"
  PC_ID_SEEN=1
  PC_ID_PID="$(sed -n 's/^pid=//p' "$1" 2>/dev/null | head -n 1)"
  PC_ID_TOKEN="$(sed -n 's/^token=//p' "$1" 2>/dev/null | head -n 1)"
  PC_ID_GENERATION="$(sed -n 's/^generation=//p' "$1" 2>/dev/null | head -n 1)"
  PC_ID_PROFILE="$(sed -n 's/^profile=//p' "$1" 2>/dev/null | head -n 1)"
  PC_ID_ROOT="$(sed -n 's/^root=//p' "$1" 2>/dev/null | head -n 1)"
  PC_ID_RUNTIME="$(sed -n 's/^runtime=//p' "$1" 2>/dev/null | head -n 1)"
  PC_ID_PORT="$(sed -n 's/^port=//p' "$1" 2>/dev/null | head -n 1)"
  return 0
}

poracode_identity_write() {
  _pc_id_path="$1"
  # Never replace a record this version cannot understand; an unknown record
  # belongs to a newer app and must survive an older client.
  if [ -f "$_pc_id_path" ]; then
    _pc_id_existing="$(sed -n 's/^version=//p' "$_pc_id_path" 2>/dev/null | head -n 1)"
    if [ "$_pc_id_existing" != "${SSH_OWNER_IDENTITY_VERSION}" ]; then
      return 1
    fi
  fi
  _pc_id_tmp="$_pc_id_path.tmp.$$"
  if ! {
    printf 'version=%s\n' "${SSH_OWNER_IDENTITY_VERSION}"
    printf 'pid=%s\n' "$PC_ID_PID"
    printf 'token=%s\n' "$PC_ID_TOKEN"
    printf 'generation=%s\n' "$PC_ID_GENERATION"
    printf 'profile=%s\n' "$PC_ID_PROFILE"
    printf 'root=%s\n' "$PC_ID_ROOT"
    printf 'runtime=%s\n' "$PC_ID_RUNTIME"
    printf 'port=%s\n' "$PC_ID_PORT"
  } >"$_pc_id_tmp" 2>/dev/null; then
    rm -f "$_pc_id_tmp"
    return 1
  fi
  if ! mv -f "$_pc_id_tmp" "$_pc_id_path" 2>/dev/null; then
    rm -f "$_pc_id_tmp"
    return 1
  fi
  return 0
}

# ── Authenticated owner discovery ─────────────────────────────────────────
# Runs the owner's own runtime "status --json" (HMAC-authenticated host
# control: request proof, generation match, profile/data-root match). This is
# the only source of owner authority; the identity record is compared to it,
# never trusted on its own. Both the command and its parser are wall-clock
# bounded, so a hung old runtime cannot stall the launch past its deadline.
poracode_owner_status_fields() {
  _pc_status_node="$1"
  _pc_status_runtime="$2"
  _pc_status_base="$3"
  _pc_status_out="$4"
  [ -f "$_pc_status_runtime/server.cjs" ] || return 1
  _pc_status_raw="$_pc_status_out.raw"
  rm -f "$_pc_status_raw" "$_pc_status_out" 2>/dev/null || true
  _pc_status_rc=0
  poracode_run_bounded "" "$PC_OWNER_STATUS_TIMEOUT_SECONDS" \
    env PORACODE_BASE_DIR="$_pc_status_base" \
    "$_pc_status_node" "$_pc_status_runtime/server.cjs" status --json \
    >"$_pc_status_raw" 2>/dev/null || _pc_status_rc=$?
  if [ "$_pc_status_rc" -ne 0 ]; then
    rm -f "$_pc_status_raw" 2>/dev/null || true
    return 1
  fi
  _pc_status_rc=0
  poracode_run_bounded "$_pc_status_raw" "$PC_OWNER_STATUS_TIMEOUT_SECONDS" "$_pc_status_node" -e '
let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  try {
    const value = JSON.parse(input);
    const description = value && typeof value.description === "object" ? value.description : {};
    const clean = (candidate) =>
      typeof candidate === "string" && candidate.length > 0 && candidate.length < 4096 && !/[\r\n]/u.test(candidate)
        ? candidate
        : "";
    const generation = clean(value.ownerGeneration);
    const profile = clean(description.profileNamespace);
    const root = clean(description.dataRoot);
    let port = "";
    if (typeof description.endpoint === "string") {
      try {
        const parsed = new URL(description.endpoint);
        if (/^\d+$/u.test(parsed.port)) port = parsed.port;
      } catch {}
    }
    const ok = generation && profile && root ? 1 : 0;
    process.stdout.write(
      "ok=" + ok +
      "\ngeneration=" + generation +
      "\nprofile=" + profile +
      "\nroot=" + root +
      "\nport=" + port + "\n",
    );
  } catch {
    process.stdout.write("ok=0\n");
  }
});
' >"$_pc_status_out" 2>/dev/null || _pc_status_rc=$?
  rm -f "$_pc_status_raw" 2>/dev/null || true
  if [ "$_pc_status_rc" -ne 0 ]; then
    return 1
  fi
  grep -q '^ok=1$' "$_pc_status_out" || return 1
  return 0
}

# Exit codes: 0 compatible Poracode Helper (protocol matches), 2 reachable but
# not this protocol's helper, 1 nothing listening.
poracode_probe_helper() {
  "$1" - "$2" <<'NODE'
const http = require("node:http");
const port = Number(process.argv[2]);
const req = http.get({ host: "127.0.0.1", port, path: "/.well-known/poracode/environment", timeout: 800 }, (res) => {
  let body = "";
  res.setEncoding("utf8");
  res.on("data", (chunk) => { body += chunk; });
  res.on("end", () => {
    let descriptor = null;
    try { descriptor = JSON.parse(body); } catch { descriptor = null; }
    if (res.statusCode === 200 && descriptor && descriptor.hostMode === "helper") {
      process.stdout.write("ownerProtocolVersion=" + String(descriptor.protocolVersion || "") + "\n");
      process.stdout.write("ownerAppVersion=" + String(descriptor.appVersion || "").replace(/[^0-9A-Za-z.+-]/gu, "") + "\n");
      process.exit(descriptor.protocolVersion === ${PORACODE_REMOTE_PROTOCOL_VERSION} ? 0 : 2);
    }
    process.exit(2);
  });
});
req.on("timeout", () => { req.destroy(); process.exit(1); });
req.on("error", () => process.exit(1));
NODE
}

poracode_probe_helper_bounded() {
  poracode_run_bounded "" "$PC_PROBE_TIMEOUT_SECONDS" poracode_probe_helper "$@"
}

# ── Versioned launch results ──────────────────────────────────────────────
# A refusal is a typed outcome, not a crash: scripts print one JSON object and
# exit 0 so the client can map it to a localized, non-destructive error.
poracode_emit_ready() {
  _pc_ready_reused="false"
  if [ "$1" = "1" ]; then
    _pc_ready_reused="true"
  fi
  _pc_ready_protocol="$5"
  [ -n "$_pc_ready_protocol" ] || _pc_ready_protocol="0"
  printf '{"poracodeLaunchProtocol":%s,"outcome":"ready","remotePort":%s,"reused":%s,"ownerRuntimeHash":"%s","ownerAppVersion":"%s","ownerProtocolVersion":%s}\n' \
    "${SSH_LAUNCH_PROTOCOL_VERSION}" "$2" "$_pc_ready_reused" "$3" "$4" "$_pc_ready_protocol"
}

poracode_emit_refused() {
  _pc_refused_protocol="$3"
  [ -n "$_pc_refused_protocol" ] || _pc_refused_protocol="0"
  printf '{"poracodeLaunchProtocol":%s,"outcome":"refused","code":"%s","ownerAppVersion":"%s","ownerProtocolVersion":%s}\n' \
    "${SSH_LAUNCH_PROTOCOL_VERSION}" "$1" "$2" "$_pc_refused_protocol"
}
`;
