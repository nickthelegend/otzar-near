#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${1:-regtest}" != "regtest" ]]; then
  if [[ "${1:-}" == "--network" && "${2:-}" == "testnet4" ]]; then
    echo 'Setup required: BITCOIN_TESTNET4_FUNDED_ADDRESS and SEPOLIA_RPC_URL. Public-chain mode is not configured.' >&2
  else
    echo 'usage: scripts/demo.sh [--network testnet4]' >&2
  fi
  exit 2
fi

pnpm install --frozen-lockfile
pnpm --filter @hako/sdk build
(cd packages/contract && cargo near build non-reproducible-wasm)

mkdir -p .tools .demo/bitcoin
if [[ ! -x .tools/bitcoin-31.2/bin/bitcoind ]]; then
  curl -fsSL 'https://bitcoincore.org/bin/bitcoin-core-31.2/bitcoin-31.2-arm64-apple-darwin.tar.gz' -o .tools/bitcoin.tar.gz
  curl -fsSL 'https://bitcoincore.org/bin/bitcoin-core-31.2/SHA256SUMS' -o .tools/SHA256SUMS
  rg 'bitcoin-31.2-arm64-apple-darwin.tar.gz' .tools/SHA256SUMS | sed 's#bitcoin-31.2-arm64-apple-darwin.tar.gz#.tools/bitcoin.tar.gz#' | shasum -a 256 -c
  tar -xzf .tools/bitcoin.tar.gz -C .tools
fi

anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --state "$PWD/.demo/anvil-state.json" > /dev/null 2>&1 &
anvil_pid=$!
.tools/bitcoin-31.2/bin/bitcoind -regtest -datadir="$PWD/.demo/bitcoin" -server=1 -txindex=1 -rpcport=18443 -listen=0 -fallbackfee=0.0001 -printtoconsole=0 > /dev/null 2>&1 &
bitcoin_pid=$!
cleanup() {
  .tools/bitcoin-31.2/bin/bitcoin-cli -regtest -datadir="$PWD/.demo/bitcoin" stop > /dev/null 2>&1 || true
  kill "$anvil_pid" 2>/dev/null || true
  wait "$anvil_pid" 2>/dev/null || true
  wait "$bitcoin_pid" 2>/dev/null || true
}
trap cleanup EXIT
for _ in {1..60}; do
  if curl -sSf -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' http://127.0.0.1:8545 > /dev/null 2>&1 && .tools/bitcoin-31.2/bin/bitcoin-cli -regtest -datadir="$PWD/.demo/bitcoin" getblockcount > /dev/null 2>&1; then break; fi
  sleep 1
done
node scripts/deploy-testnet.mjs
node scripts/verify-evidence.mjs
