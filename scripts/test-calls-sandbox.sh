#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .demo/bitcoin
mkdir -p .tools
if [[ ! -x .tools/bitcoin-31.2/bin/bitcoind ]]; then
  curl -fsSL 'https://bitcoincore.org/bin/bitcoin-core-31.2/bitcoin-31.2-arm64-apple-darwin.tar.gz' -o .tools/bitcoin.tar.gz
  curl -fsSL 'https://bitcoincore.org/bin/bitcoin-core-31.2/SHA256SUMS' -o .tools/SHA256SUMS
  rg 'bitcoin-31.2-arm64-apple-darwin.tar.gz' .tools/SHA256SUMS | sed 's#bitcoin-31.2-arm64-apple-darwin.tar.gz#.tools/bitcoin.tar.gz#' | shasum -a 256 -c
  tar -xzf .tools/bitcoin.tar.gz -C .tools
fi
scripts/sandbox.sh start
.tools/bitcoin-31.2/bin/bitcoind -regtest -datadir="$PWD/.demo/bitcoin" -server=1 -txindex=1 -rpcport=18443 -listen=0 -fallbackfee=0.0001 -printtoconsole=0 > /dev/null 2>&1 &
bitcoin_pid=$!
cleanup() {
  .tools/bitcoin-31.2/bin/bitcoin-cli -regtest -datadir="$PWD/.demo/bitcoin" stop > /dev/null 2>&1 || true
  wait "$bitcoin_pid" 2>/dev/null || true
  scripts/sandbox.sh stop
}
trap cleanup EXIT
for _ in {1..60}; do
  if .tools/bitcoin-31.2/bin/bitcoin-cli -regtest -datadir="$PWD/.demo/bitcoin" getblockcount > /dev/null 2>&1; then break; fi
  sleep 1
done
node scripts/test-calls-sandbox.mjs
