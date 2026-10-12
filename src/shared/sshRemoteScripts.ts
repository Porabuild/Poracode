import { PORACODE_REMOTE_PROTOCOL_VERSION } from "./remote/protocol";
import { REMOTE_NODE_ENV_SCRIPT, REMOTE_OWNER_SHELL_LIBRARY } from "./sshRemoteShell";

export {
  REMOTE_NODE_ENV_SCRIPT,
  SSH_LAUNCH_PROTOCOL_VERSION,
  SSH_OWNER_IDENTITY_VERSION,
} from "./sshRemoteShell";

export const PROBE_REMOTE_RUNTIME_SCRIPT = String.raw`set -eu
${REMOTE_NODE_ENV_SCRIPT}
HASH="$1"
RUNTIME="$HOME/.poracode/ssh/runtime/$HASH"
ensure_poracode_node || {
  printf 'Poracode SSH requires Node 24.10 or newer on the remote host.\n' >&2
  exit 41
}
if [ -f "$RUNTIME/.ready" ] && [ "$(cat "$RUNTIME/.ready")" = "$HASH" ] && [ -f "$RUNTIME/server.cjs" ] && [ -f "$RUNTIME/supervisor.cjs" ]; then
  printf 'ready\n'
else
  printf 'install\n'
fi
`;

export const PREPARE_REMOTE_UPLOAD_SCRIPT = String.raw`set -eu
mkdir -p "$HOME/.poracode/ssh/uploads" "$HOME/.poracode/ssh/runtime" "$HOME/.poracode/ssh/locks"
`;

/**
 * Idempotent, lock-guarded content-addressed install. The runtime archive has
 * a per-attempt name so concurrent clients never write the same upload file;
 * the per-hash install lock serializes extraction + `npm install`, and a
 * second client that acquires the lock after the first sees the ready marker
 * and skips the work.
 */
export const INSTALL_REMOTE_RUNTIME_SCRIPT = String.raw`set -eu
${REMOTE_NODE_ENV_SCRIPT}
${REMOTE_OWNER_SHELL_LIBRARY}
HASH="$1"
ARCHIVE_NAME="$2"
set +u
LOCK_WAIT_MS="$3"
set -u
case "$LOCK_WAIT_MS" in
  ''|*[!0-9]*) LOCK_WAIT_MS="540000" ;;
esac
if [ "$LOCK_WAIT_MS" -gt 3600000 ]; then
  LOCK_WAIT_MS=3600000
fi
case "$HASH" in
  *[!0-9a-f]*|'') printf 'Invalid Poracode runtime hash.\n' >&2; exit 2 ;;
esac
case "$ARCHIVE_NAME" in
  */*|'') printf 'Invalid Poracode runtime archive name.\n' >&2; exit 2 ;;
esac
ensure_poracode_node || {
  printf 'Poracode SSH requires Node 24.10 or newer on the remote host.\n' >&2
  exit 41
}
command -v npm >/dev/null 2>&1 || {
  printf 'Poracode SSH requires npm on the remote host.\n' >&2
  exit 42
}
BASE="$HOME/.poracode/ssh"
ARCHIVE="$BASE/uploads/$ARCHIVE_NAME"
FINAL="$BASE/runtime/$HASH"
LOCK_DIR="$BASE/locks/install-$HASH"
STAGE="$BASE/runtime/.staging-$HASH-$$"
PREVIOUS="$BASE/runtime/.previous-$HASH-$$"
test -f "$ARCHIVE" || { printf 'Uploaded Poracode runtime archive was not found.\n' >&2; exit 43; }
mkdir -p "$BASE/locks" "$BASE/runtime"
LOCK_TOKEN="$(poracode_process_token $$ 2>/dev/null || true)"
if ! poracode_lock_acquire "$LOCK_DIR" "$LOCK_WAIT_MS" "$LOCK_TOKEN"; then
  printf 'Another Poracode client is installing the remote runtime.\n' >&2
  exit 48
fi
cleanup() {
  rm -rf "$STAGE" "$PREVIOUS"
  rm -f "$ARCHIVE"
}
release_lock() {
  poracode_lock_release "$LOCK_DIR" "$LOCK_TOKEN"
}
trap 'cleanup; release_lock' EXIT
trap 'exit 143' HUP INT TERM
# A previous installer that died mid-staging leaves its lock (reclaimed by the
# guarded reaper only when its recorded holder is provably dead) and its
# staging/archive behind; under the lock only this installer is active, so the
# leftovers for this hash are removed before starting.
rm -rf "$BASE/runtime/.staging-$HASH-"* "$BASE/runtime/.previous-$HASH-"*
for stale_upload in "$BASE/uploads/$HASH-"*.tar.gz; do
  [ -f "$stale_upload" ] || continue
  [ "$stale_upload" = "$ARCHIVE" ] && continue
  rm -f "$stale_upload"
done
if [ -f "$FINAL/.ready" ] && [ "$(cat "$FINAL/.ready")" = "$HASH" ] && [ -f "$FINAL/server.cjs" ] && [ -f "$FINAL/supervisor.cjs" ]; then
  printf 'ready\n'
  exit 0
fi
rm -rf "$STAGE" "$PREVIOUS"
mkdir -p "$STAGE"
tar -xzf "$ARCHIVE" -C "$STAGE"
(
  cd "$STAGE"
  npm install --omit=dev --no-audit --no-fund --loglevel=error
)
mkdir -p "$HOME/.poracode/agent-plugins"
if [ -d "$STAGE/agent-plugins" ]; then
  cp -R "$STAGE/agent-plugins/." "$HOME/.poracode/agent-plugins/"
fi
printf '%s\n' "$HASH" >"$STAGE/.ready"
if [ -d "$FINAL" ]; then
  mv "$FINAL" "$PREVIOUS"
fi
if ! mv "$STAGE" "$FINAL"; then
  if [ -d "$PREVIOUS" ]; then mv "$PREVIOUS" "$FINAL"; fi
  exit 44
fi
rm -rf "$PREVIOUS"
printf 'ready\n'
`;

/**
 * Ownership-safe launch.
 *
 * `connect` never signals or replaces an existing owner: it either reuses an
 * owner proven by the authenticated host-control describe (any runtime hash,
 * any app version, as long as the remote protocol matches) or starts a new
 * owner. A live but unverifiable owner refuses (`owner-unverified`); a
 * verified owner that does not speak this remote protocol refuses
 * (`owner-incompatible`); a verified owner whose listener is down refuses
 * (`owner-unresponsive`). Starting a new owner while another owner still holds
 * the data-root lease fails closed through that owner's own lease and is
 * reported as `owner-conflict`.
 *
 * The one process this script may terminate is the new owner it spawned
 * itself, re-proven by its own start token, when that child fails to become
 * ready; no recorded or reused owner is ever signalled on ordinary connect.
 *
 * `upgrade` is the explicit, owner-authorized operation: it requires the
 * identity record to match the authenticated describe (generation, profile,
 * data root) and a recorded start token that is present and verified (an
 * unknown token is never authority to signal), joins the old owner's shutdown
 * (SIGTERM, then exit + port closure within the drain budget, never SIGKILL),
 * and only then starts the requested runtime into the same data root. Ordinary
 * connects never call it.
 */
export const LAUNCH_REMOTE_SERVER_SCRIPT = String.raw`set -eu
${REMOTE_NODE_ENV_SCRIPT}
${REMOTE_OWNER_SHELL_LIBRARY}
MODE="$1"
CONNECTION_ID="$2"
RUNTIME_HASH="$3"
set +u
LOCK_WAIT_MS="$4"
DRAIN_WAIT_MS="$5"
set -u
case "$LOCK_WAIT_MS" in
  ''|*[!0-9]*) LOCK_WAIT_MS="120000" ;;
esac
case "$DRAIN_WAIT_MS" in
  ''|*[!0-9]*) DRAIN_WAIT_MS="30000" ;;
esac
if [ "$LOCK_WAIT_MS" -gt 3600000 ]; then
  LOCK_WAIT_MS=3600000
fi
if [ "$DRAIN_WAIT_MS" -gt 3600000 ]; then
  DRAIN_WAIT_MS=3600000
fi
PC_START_WAIT_MS=20000
case "$MODE" in
  connect|upgrade) ;;
  *) printf 'Invalid Poracode launch mode.\n' >&2; exit 2 ;;
esac
case "$CONNECTION_ID" in
  *[!0-9a-f-]*|'') printf 'Invalid Poracode SSH connection id.\n' >&2; exit 2 ;;
esac
case "$RUNTIME_HASH" in
  *[!0-9a-f]*|'') printf 'Invalid Poracode runtime hash.\n' >&2; exit 2 ;;
esac
ensure_poracode_node || {
  printf 'Poracode SSH requires Node 24.10 or newer on the remote host.\n' >&2
  exit 41
}
NODE="$(command -v node)"
BASE="$HOME/.poracode/ssh"
RUNTIME="$BASE/runtime/$RUNTIME_HASH"
STATE="$BASE/hosts/$CONNECTION_ID"
IDENTITY_FILE="$STATE/owner-identity"
LOG_FILE="$STATE/server.log"
DATA_DIR="$STATE/data"
mkdir -p "$STATE" "$DATA_DIR" "$BASE/locks"
# The legacy pid/port/runtime files are gone: this script never reads them for
# liveness or signalling, and leaving them lets an older client kill a reused
# PID from stale metadata. This cleanup is unrelated to the versioned identity
# record, which is preserved untouched when it is not this version.
rm -f "$STATE/pid" "$STATE/port" "$STATE/runtime"
test -f "$RUNTIME/.ready" || { printf 'Poracode remote runtime is not installed.\n' >&2; exit 45; }
APP_VERSION="$("$NODE" -p 'require(process.argv[1]).version' "$RUNTIME/package.json")"

PC_LOCK_HELD=0
poracode_require_lock() {
  if [ "$PC_LOCK_HELD" -eq 1 ]; then
    return 0
  fi
  LOCK_DIR="$BASE/locks/owner-$CONNECTION_ID"
  LOCK_TOKEN="$(poracode_process_token $$ 2>/dev/null || true)"
  if ! poracode_lock_acquire "$LOCK_DIR" "$LOCK_WAIT_MS" "$LOCK_TOKEN"; then
    poracode_emit_refused "owner-busy" "" ""
    exit 0
  fi
  PC_LOCK_HELD=1
  trap 'poracode_lock_release "$LOCK_DIR" "$LOCK_TOKEN"' EXIT
  trap 'exit 143' HUP INT TERM
}

PC_AUTH=0
PC_GENERATION=""
PC_PROFILE=""
PC_ROOT=""
PC_PORT=""
PC_OWNER_APP=""
PC_OWNER_PROTOCOL=""
PC_PROBE_RC=1
PC_ID_LIVE=0
PC_ID_MATCH=0
PC_ID_TOKEN_VERIFIED=0
PC_STATUS_RUNTIME_HASH="$RUNTIME_HASH"

poracode_refresh_identity() {
  poracode_identity_read "$IDENTITY_FILE" || true
  PC_ID_LIVE=0
  PC_ID_MATCH=0
  PC_ID_TOKEN_VERIFIED=0
  if [ "$PC_ID_SEEN" -eq 1 ] && [ -n "$PC_ID_PID" ] && kill -0 "$PC_ID_PID" 2>/dev/null; then
    _pc_identity_token="$(poracode_process_token "$PC_ID_PID" 2>/dev/null || true)"
    if [ -n "$PC_ID_TOKEN" ] && [ -n "$_pc_identity_token" ] && [ "$PC_ID_TOKEN" != "$_pc_identity_token" ]; then
      # A complete token proves PID reuse: the recorded owner is gone.
      PC_ID_LIVE=0
    else
      # The recorded process exists. Without a complete, matching token its
      # identity is unproven, so it counts as live for refusal purposes but
      # never as authority to signal.
      PC_ID_LIVE=1
      if [ -n "$PC_ID_TOKEN" ] && [ "$PC_ID_TOKEN" = "$_pc_identity_token" ]; then
        PC_ID_TOKEN_VERIFIED=1
      fi
    fi
  fi
}

poracode_refresh_status_runtime() {
  PC_STATUS_RUNTIME_HASH="$RUNTIME_HASH"
  if [ -n "$PC_ID_RUNTIME" ] && [ -f "$BASE/runtime/$PC_ID_RUNTIME/server.cjs" ]; then
    PC_STATUS_RUNTIME_HASH="$PC_ID_RUNTIME"
  fi
}

poracode_query_owner() {
  PC_AUTH=0
  PC_GENERATION=""
  PC_PROFILE=""
  PC_ROOT=""
  PC_PORT=""
  PC_ID_MATCH=0
  _pc_owner_fields="$STATE/.owner-status.$$"
  if poracode_owner_status_fields "$NODE" "$BASE/runtime/$PC_STATUS_RUNTIME_HASH" "$DATA_DIR" "$_pc_owner_fields"; then
    PC_AUTH=1
    PC_GENERATION="$(sed -n 's/^generation=//p' "$_pc_owner_fields" | head -n 1)"
    PC_PROFILE="$(sed -n 's/^profile=//p' "$_pc_owner_fields" | head -n 1)"
    PC_ROOT="$(sed -n 's/^root=//p' "$_pc_owner_fields" | head -n 1)"
    PC_PORT="$(sed -n 's/^port=//p' "$_pc_owner_fields" | head -n 1)"
    if [ -n "$PC_ID_GENERATION" ] && [ "$PC_ID_GENERATION" = "$PC_GENERATION" ] && [ "$PC_ID_PROFILE" = "$PC_PROFILE" ] && [ "$PC_ID_ROOT" = "$PC_ROOT" ]; then
      PC_ID_MATCH=1
    fi
  fi
  rm -f "$_pc_owner_fields"
}

poracode_probe_owner() {
  PC_PROBE_RC=1
  PC_OWNER_APP=""
  PC_OWNER_PROTOCOL=""
  _pc_probe_out="$STATE/.owner-probe.$$"
  _pc_probe_rc=0
  poracode_probe_helper_bounded "$NODE" "$1" >"$_pc_probe_out" 2>/dev/null || _pc_probe_rc=$?
  PC_PROBE_RC="$_pc_probe_rc"
  if [ -s "$_pc_probe_out" ]; then
    PC_OWNER_PROTOCOL="$(sed -n 's/^ownerProtocolVersion=//p' "$_pc_probe_out" | head -n 1)"
    PC_OWNER_APP="$(sed -n 's/^ownerAppVersion=//p' "$_pc_probe_out" | head -n 1)"
  fi
  rm -f "$_pc_probe_out"
}

poracode_refuse_unknown_identity() {
  # A corrupt, partial or future-format record is never parsed as this
  # version, never signalled, never overwritten, and never replaced by a new
  # owner: starting one would silently discard state a newer app owns.
  if [ "$PC_ID_STATUS" = "unknown" ]; then
    poracode_emit_refused "owner-unverified" "$PC_OWNER_APP" "$PC_OWNER_PROTOCOL"
    exit 0
  fi
}

# Reuses a live authenticated owner without touching it. Compatibility is the
# remote protocol, not the bundled runtime hash or the app version.
poracode_reuse_or_refuse_authenticated_owner() {
  if [ -z "$PC_PORT" ]; then
    poracode_emit_refused "owner-unresponsive" "$PC_OWNER_APP" "$PC_OWNER_PROTOCOL"
    exit 0
  fi
  poracode_probe_owner "$PC_PORT"
  if [ "$PC_PROBE_RC" -eq 0 ]; then
    poracode_emit_ready 1 "$PC_PORT" "$PC_STATUS_RUNTIME_HASH" "$PC_OWNER_APP" "$PC_OWNER_PROTOCOL"
    exit 0
  fi
  if [ "$PC_PROBE_RC" -eq 2 ]; then
    poracode_emit_refused "owner-incompatible" "$PC_OWNER_APP" "$PC_OWNER_PROTOCOL"
    exit 0
  fi
  poracode_emit_refused "owner-unresponsive" "$PC_OWNER_APP" "$PC_OWNER_PROTOCOL"
  exit 0
}

poracode_start_new_owner() {
  PORT="$(pick_port)" || { printf 'No remote loopback port is available for Poracode.\n' >&2; exit 46; }
  LOG_OFFSET=0
  if [ -f "$LOG_FILE" ]; then
    LOG_OFFSET="$(wc -c <"$LOG_FILE" 2>/dev/null || printf '0')"
  fi
  nohup env \
    PORACODE_BASE_DIR="$DATA_DIR" \
    PORACODE_REMOTE_ACCESS_HOST=127.0.0.1 \
    PORACODE_REMOTE_ACCESS_ADVERTISED_HOST=127.0.0.1 \
    PORACODE_REMOTE_ACCESS_PORT="$PORT" \
    PORACODE_APP_VERSION="$APP_VERSION" \
    PORACODE_WSL_HELPERS_DIR="$RUNTIME/wsl-helpers" \
    PORACODE_BUNDLED_SKILLS_DIR="$RUNTIME/skills" \
    PORACODE_BUNDLED_PLUGINS_DIR="$RUNTIME/plugins" \
    "$NODE" "$RUNTIME/server.cjs" >>"$LOG_FILE" 2>&1 </dev/null &
  PID="$!"
  CHILD_TOKEN="$(poracode_process_token "$PID" 2>/dev/null || true)"
  READY=0
  START_DEADLINE=$(( $(date +%s) + (PC_START_WAIT_MS + 999) / 1000 ))
  while :; do
    if poracode_probe_helper_bounded "$NODE" "$PORT" >/dev/null 2>&1; then READY=1; break; fi
    if ! kill -0 "$PID" 2>/dev/null; then break; fi
    if [ "$(date +%s)" -ge "$START_DEADLINE" ]; then break; fi
    sleep 0.2
  done
  if [ "$READY" -eq 1 ]; then
    # The environment probe is unauthenticated, so readiness alone is not
    # ownership: the owner must also answer the authenticated status for THIS
    # data root before its port is reported. A foreign listener on the chosen
    # port, or an owner that cannot authenticate, fails closed below.
    PC_STATUS_RUNTIME_HASH="$RUNTIME_HASH"
    READY=0
    while :; do
      poracode_query_owner
      if [ "$PC_AUTH" -eq 1 ]; then
        READY=1
        break
      fi
      if ! kill -0 "$PID" 2>/dev/null; then break; fi
      if [ "$(date +%s)" -ge "$START_DEADLINE" ]; then break; fi
      sleep 0.2
    done
  fi
  if [ "$READY" -ne 1 ]; then
    # Only the process this invocation started, re-proven by its start token,
    # may be stopped here; the identity record is never authority to signal.
    if kill -0 "$PID" 2>/dev/null; then
      _pc_child_token_now="$(poracode_process_token "$PID" 2>/dev/null || true)"
      if [ -n "$CHILD_TOKEN" ] && [ "$_pc_child_token_now" = "$CHILD_TOKEN" ]; then
        kill "$PID" 2>/dev/null || true
      fi
    fi
    LOG_TAIL="$(tail -c "+$((LOG_OFFSET + 1))" "$LOG_FILE" 2>/dev/null || true)"
    printf '%s\n' "$LOG_TAIL" >&2
    if printf '%s\n' "$LOG_TAIL" | grep -q 'already owns'; then
      poracode_emit_refused "owner-conflict" "" ""
    else
      poracode_emit_refused "launch-failed" "" ""
    fi
    exit 0
  fi
  # The authenticated status above is the authority for this ready owner, so
  # the identity record can be written without a second query.
  PC_ID_PID="$PID"
  PC_ID_TOKEN="$CHILD_TOKEN"
  PC_ID_GENERATION="$PC_GENERATION"
  PC_ID_PROFILE="$PC_PROFILE"
  PC_ID_ROOT="$PC_ROOT"
  PC_ID_RUNTIME="$RUNTIME_HASH"
  PC_ID_PORT="$PORT"
  poracode_identity_write "$IDENTITY_FILE" || true
  poracode_emit_ready 0 "$PORT" "$RUNTIME_HASH" "$APP_VERSION" "${PORACODE_REMOTE_PROTOCOL_VERSION}"
  exit 0
}

pick_port() {
  "$NODE" <<'NODE'
const net = require("node:net");
(async () => {
  // A random starting offset keeps concurrent, unrelated launches from all
  // probing the same prefix of the ephemeral range; the readiness step still
  // re-verifies ownership through the authenticated status.
  const first = 49152;
  const count = 65536 - first;
  const offset = Math.floor(Math.random() * count);
  for (let step = 0; step < count; step += 1) {
    const port = first + ((offset + step) % count);
    const available = await new Promise((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
    });
    if (available) { process.stdout.write(String(port)); return; }
  }
  process.exit(1);
})().catch(() => process.exit(1));
NODE
}

poracode_refresh_identity
poracode_refresh_status_runtime
poracode_query_owner

if [ "$MODE" = "connect" ] && [ "$PC_AUTH" -eq 1 ]; then
  poracode_reuse_or_refuse_authenticated_owner
fi
if [ "$MODE" = "upgrade" ] && [ "$PC_AUTH" -eq 1 ]; then
  poracode_require_lock
  poracode_refresh_identity
  poracode_refresh_status_runtime
  poracode_query_owner
  if [ "$PC_AUTH" -eq 1 ]; then
    if [ "$PC_ID_MATCH" -ne 1 ] || [ "$PC_ID_LIVE" -ne 1 ] || [ "$PC_ID_TOKEN_VERIFIED" -ne 1 ] || [ -z "$PC_ID_PID" ]; then
      poracode_emit_refused "owner-unverified" "$PC_OWNER_APP" "$PC_OWNER_PROTOCOL"
      exit 0
    fi
    poracode_probe_owner "$PC_PORT"
    if [ "$PC_PROBE_RC" -eq 0 ] && [ "$PC_ID_RUNTIME" = "$RUNTIME_HASH" ]; then
      poracode_emit_ready 1 "$PC_PORT" "$PC_ID_RUNTIME" "$PC_OWNER_APP" "$PC_OWNER_PROTOCOL"
      exit 0
    fi
    kill -TERM "$PC_ID_PID" 2>/dev/null || {
      if kill -0 "$PC_ID_PID" 2>/dev/null; then
        poracode_emit_refused "owner-unverified" "$PC_OWNER_APP" "$PC_OWNER_PROTOCOL"
        exit 0
      fi
    }
    DRAIN_DEADLINE=$(( $(date +%s) + (DRAIN_WAIT_MS + 999) / 1000 ))
    while kill -0 "$PC_ID_PID" 2>/dev/null; do
      if [ "$(date +%s)" -ge "$DRAIN_DEADLINE" ]; then
        poracode_emit_refused "drain-timeout" "$PC_OWNER_APP" "$PC_OWNER_PROTOCOL"
        exit 0
      fi
      sleep 0.2
    done
    if [ -n "$PC_PORT" ]; then
      while :; do
        _pc_port_rc=0
        poracode_probe_helper_bounded "$NODE" "$PC_PORT" >/dev/null 2>&1 || _pc_port_rc=$?
        [ "$_pc_port_rc" -eq 1 ] && break
        if [ "$(date +%s)" -ge "$DRAIN_DEADLINE" ]; then
          poracode_emit_refused "drain-timeout" "$PC_OWNER_APP" "$PC_OWNER_PROTOCOL"
          exit 0
        fi
        sleep 0.2
      done
    fi
    PC_AUTH=0
    PC_ID_LIVE=0
    PC_ID_MATCH=0
    PC_ID_TOKEN_VERIFIED=0
  fi
fi

if [ "$PC_ID_LIVE" -eq 1 ]; then
  poracode_emit_refused "owner-unverified" "$PC_OWNER_APP" "$PC_OWNER_PROTOCOL"
  exit 0
fi
poracode_refuse_unknown_identity

poracode_require_lock
poracode_refresh_identity
poracode_refresh_status_runtime
poracode_query_owner

if [ "$MODE" = "connect" ] && [ "$PC_AUTH" -eq 1 ]; then
  poracode_reuse_or_refuse_authenticated_owner
fi
if [ "$PC_ID_LIVE" -eq 1 ]; then
  poracode_emit_refused "owner-unverified" "$PC_OWNER_APP" "$PC_OWNER_PROTOCOL"
  exit 0
fi
poracode_refuse_unknown_identity

poracode_start_new_owner
`;

export const PAIR_REMOTE_SERVER_SCRIPT = String.raw`set -eu
${REMOTE_NODE_ENV_SCRIPT}
CONNECTION_ID="$1"
RUNTIME_HASH="$2"
ensure_poracode_node || exit 41
NODE="$(command -v node)"
BASE="$HOME/.poracode/ssh"
RUNTIME="$BASE/runtime/$RUNTIME_HASH"
DATA_DIR="$BASE/hosts/$CONNECTION_ID/data"
PORACODE_BASE_DIR="$DATA_DIR" exec "$NODE" "$RUNTIME/server.cjs" pair --json
`;
