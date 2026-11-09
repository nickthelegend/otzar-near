#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm --filter @hako/sdk build
(cd packages/contract && cargo near build non-reproducible-wasm --no-abi)
mkdir -p .demo/solana
solana-test-validator --ledger "$PWD/.demo/solana" --reset --rpc-port 8899 --faucet-port 9900 --quiet > "$PWD/.demo/solana.log" 2>&1 &
validator_pid=$!
cleanup(){ kill "$validator_pid" 2>/dev/null || true; wait "$validator_pid" 2>/dev/null || true; }
trap cleanup EXIT
for _ in {1..60}; do curl -fsS -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' http://127.0.0.1:8899 >/dev/null 2>&1 && break; sleep 1; done
node scripts/demo-solana.mjs
