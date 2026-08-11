import { PORACODE_REMOTE_PROTOCOL_VERSION } from "./remote/protocol";

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

  VOLTA_HOME="\${VOLTA_HOME:-$HOME/.volta}"
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

  NVM_DIR="\${NVM_DIR:-$HOME/.nvm}"
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
mkdir -p "$HOME/.poracode/ssh/uploads" "$HOME/.poracode/ssh/runtime"
`;

export const INSTALL_REMOTE_RUNTIME_SCRIPT = String.raw`set -eu
${REMOTE_NODE_ENV_SCRIPT}
HASH="$1"
case "$HASH" in
  *[!0-9a-f]*|'') printf 'Invalid Poracode runtime hash.\n' >&2; exit 2 ;;
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
ARCHIVE="$BASE/uploads/$HASH.tar.gz"
FINAL="$BASE/runtime/$HASH"
STAGE="$BASE/runtime/.staging-$HASH-$$"
PREVIOUS="$BASE/runtime/.previous-$HASH-$$"
test -f "$ARCHIVE" || { printf 'Uploaded Poracode runtime archive was not found.\n' >&2; exit 43; }
rm -rf "$STAGE" "$PREVIOUS"
mkdir -p "$STAGE"
cleanup() { rm -rf "$STAGE" "$PREVIOUS"; }
trap cleanup EXIT
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
rm -f "$ARCHIVE"
trap - EXIT
printf 'ready\n'
`;

export const LAUNCH_REMOTE_SERVER_SCRIPT = String.raw`set -eu
${REMOTE_NODE_ENV_SCRIPT}
CONNECTION_ID="$1"
RUNTIME_HASH="$2"
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
PID_FILE="$STATE/pid"
PORT_FILE="$STATE/port"
RUNTIME_FILE="$STATE/runtime"
LOG_FILE="$STATE/server.log"
DATA_DIR="$STATE/data"
mkdir -p "$STATE" "$DATA_DIR"
test -f "$RUNTIME/.ready" || { printf 'Poracode remote runtime is not installed.\n' >&2; exit 45; }
APP_VERSION="$("$NODE" -p 'require(process.argv[1]).version' "$RUNTIME/package.json")"

server_ready() {
  "$NODE" - "$1" "$2" <<'NODE'
const http = require("node:http");
const port = Number(process.argv[2]);
const appVersion = process.argv[3];
const req = http.get({ host: "127.0.0.1", port, path: "/.well-known/poracode/environment", timeout: 800 }, (res) => {
  let body = "";
  res.setEncoding("utf8");
  res.on("data", (chunk) => { body += chunk; });
  res.on("end", () => {
    try {
      const descriptor = JSON.parse(body);
      process.exit(
        res.statusCode === 200 &&
        descriptor.protocolVersion === ${PORACODE_REMOTE_PROTOCOL_VERSION} &&
        descriptor.hostMode === "helper" &&
        descriptor.appVersion === appVersion
          ? 0
          : 1
      );
    } catch {
      process.exit(1);
    }
  });
});
req.on("timeout", () => { req.destroy(); process.exit(1); });
req.on("error", () => process.exit(1));
NODE
}

pick_port() {
  "$NODE" <<'NODE'
const net = require("node:net");
(async () => {
  for (let port = 49152; port <= 65535; port += 1) {
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

PID="$(cat "$PID_FILE" 2>/dev/null || true)"
PORT="$(cat "$PORT_FILE" 2>/dev/null || true)"
CURRENT_RUNTIME="$(cat "$RUNTIME_FILE" 2>/dev/null || true)"
if [ -n "$PID" ] && [ -n "$PORT" ] && [ "$CURRENT_RUNTIME" = "$RUNTIME_HASH" ] && kill -0 "$PID" 2>/dev/null && server_ready "$PORT" "$APP_VERSION"; then
  :
else
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE" "$PORT_FILE" "$RUNTIME_FILE"
  PORT="$(pick_port)" || { printf 'No remote loopback port is available for Poracode.\n' >&2; exit 46; }
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
  printf '%s\n' "$PID" >"$PID_FILE"
  printf '%s\n' "$PORT" >"$PORT_FILE"
  printf '%s\n' "$RUNTIME_HASH" >"$RUNTIME_FILE"
  READY=0
  ATTEMPT=0
  while [ "$ATTEMPT" -lt 100 ]; do
    if server_ready "$PORT" "$APP_VERSION"; then READY=1; break; fi
    if ! kill -0 "$PID" 2>/dev/null; then break; fi
    ATTEMPT=$((ATTEMPT + 1))
    sleep 0.2
  done
  if [ "$READY" -ne 1 ]; then
    printf 'Poracode Helper failed to start or returned an incompatible protocol.\n' >&2
    tail -n 80 "$LOG_FILE" >&2 2>/dev/null || true
    kill "$PID" 2>/dev/null || true
    rm -f "$PID_FILE" "$PORT_FILE" "$RUNTIME_FILE"
    exit 47
  fi
fi
printf '{"remotePort":%s}\n' "$PORT"
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
