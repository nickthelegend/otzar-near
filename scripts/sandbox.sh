#!/usr/bin/env bash
# Local NEAR node for development and tests: nearcore 2.14.0-rc.4 in sandbox mode (protocol 88, so
# ml_dsa_verify and ML-DSA-65 access keys behave as on testnet). Same binary near-workspaces uses.
#   scripts/sandbox.sh start   -> runs in the background, writes .demo/sandbox.env
#   scripts/sandbox.sh stop
# SANDBOX_STATE_DIR (default .demo) and SANDBOX_RPC_PORT (default 3030) let tests run their own node.
# The root account is test.near; its key is the sandbox's own validator_key.json (local only).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
VERSION=2.14.0-rc.4
BIN="${NEAR_SANDBOX_BIN:-$ROOT/.tools/near-sandbox-$VERSION/near-sandbox}"
PORT="${SANDBOX_RPC_PORT:-3030}"
STATE="${SANDBOX_STATE_DIR:-$ROOT/.demo}"
HOME_DIR="$STATE/sandbox"

case "${1:-start}" in
  stop)
    if [ -f "$STATE/sandbox.pid" ]; then kill "$(cat "$STATE/sandbox.pid")" 2>/dev/null || true; rm -f "$STATE/sandbox.pid"; fi
    exit 0 ;;
  start) ;;
  *) echo "usage: $0 start|stop" >&2; exit 2 ;;
esac

if [ ! -x "$BIN" ]; then
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64) PLATFORM=Darwin-arm64 ;;
    Linux-x86_64) PLATFORM=Linux-x86_64 ;;
    Linux-aarch64) PLATFORM=Linux-aarch64 ;;
    *) echo "no prebuilt near-sandbox for $(uname -s)-$(uname -m); set NEAR_SANDBOX_BIN" >&2; exit 1 ;;
  esac
  mkdir -p "$(dirname "$BIN")"
  echo "downloading near-sandbox $VERSION for $PLATFORM" >&2
  curl -fsSL "https://s3-us-west-1.amazonaws.com/build.nearprotocol.com/nearcore/$PLATFORM/$VERSION/near-sandbox.tar.gz" \
    | tar -xz -C "$(dirname "$BIN")" --strip-components=1
  [ -x "$BIN" ] || { echo "download did not produce $BIN (archive layout changed?)" >&2; exit 1; }
fi

"$0" stop
rm -rf "$HOME_DIR"; mkdir -p "$HOME_DIR"
"$BIN" --home "$HOME_DIR" init >/dev/null 2>&1
"$BIN" --home "$HOME_DIR" run --rpc-addr "127.0.0.1:$PORT" --network-addr "127.0.0.1:$((PORT + 1))" > "$STATE/sandbox.log" 2>&1 &
echo $! > "$STATE/sandbox.pid"
for _ in $(seq 60); do
  curl -fs "http://127.0.0.1:$PORT/status" >/dev/null 2>&1 && break; sleep 0.5
done
curl -fs "http://127.0.0.1:$PORT/status" >/dev/null || { echo "sandbox did not start, see $STATE/sandbox.log" >&2; exit 1; }
cat > "$STATE/sandbox.env" <<ENV
NEAR_NETWORK=sandbox
NEAR_RPC_URL=http://127.0.0.1:$PORT
HAKO_ROOT_ACCOUNT=test.near
HAKO_ROOT_KEY_FILE=$HOME_DIR/validator_key.json
ENV
echo "sandbox rpc http://127.0.0.1:$PORT (protocol $(curl -fs "http://127.0.0.1:$PORT/status" | python3 -c 'import sys,json;print(json.load(sys.stdin)["protocol_version"])')); env in $STATE/sandbox.env"
