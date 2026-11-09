# Hako follow-up 2 report — 2026-11-09

## What works live

- Hako's earlier BTC, ETH, and SOL vault, ML-DSA guardian recovery, inheritance, scanner, wallet, and MCP flows remain documented with independently queryable NEAR testnet hashes and local-chain receipts in [README.md](README.md) and `deployments/`.
- A covered call was [written on NEAR testnet](https://testnet.nearblocks.io/txns/AgzrR5H6Jw3WdAiojPbZ1Dd6vDzY9GE9aCkswJZtyQjL) against a Bitcoin Core regtest funded UTXO. An owner [front-run BTC spend was rejected on-chain](https://testnet.nearblocks.io/txns/ApokgoGr5fF2VJ1UhAApVwcTaUBwMRpfpzmzRzYMDrWY). A second local NEAR sandbox and Bitcoin Core run rejected spend, transfer, listing, and early-close attacks. Evidence: [testnet call](deployments/calls-testnet-2026-11-09.json), [sandbox call](deployments/calls-sandbox.json).
- The [final tested wasm was deployed again](https://testnet.nearblocks.io/txns/2aDHEvai52YJyE5HXJBRAWGoBuFw15KbKVe8mTwozmA1); an RPC code read matched SHA-256 `badb2268140fb213af9056a6aa626596020353466f08e0fed41694fdc8519171`. [Hash evidence](deployments/calls-upgrade-2026-11-09.json).
- The SDK, Earn panel, and MCP expose live call state and a real 1Click ETH/SOL/USDC-to-native-BTC `dry: true` quote. [One ETH-to-BTC quote](deployments/oneclick-dry-2026-11-09.json) returned 26,474 sats for 0.01 ETH, a correlation ID and provider signature, with no deposit address or swap. The web production build passed, and a headless Chrome check of `/` and every `/app` tab at 1440 and 390 px found no overflow and no page errors ([TESTING.md](TESTING.md)).
- The Pyth testnet BTC/USD freshness query returned `null`; no settlement or exercise success is claimed. [Oracle evidence](deployments/pyth-testnet-2026-11-09.json).

## Verification counts

`corepack pnpm test`: **9 Rust unit tests**, **8 SDK tests**, **1 MCP test**, web type check, **47 original NEAR sandbox transactions** (16 expected rejections), and **13 covered-call sandbox transactions** (4 expected rejections) alongside a real regtest funding transaction. Zero skipped tests. The earlier BTC/ETH/SOL/recovery testnet and local-chain evidence remains in [TESTING.md](TESTING.md). The new testnet call attempt recorded **9 NEAR transactions: 8 successful, 1 expected rejection**. Premium purchase was not attempted because the buyer's testnet-USDC balance was zero. A separate live dry quote succeeded; intermittent 1Click HTTP 500 timeouts were also observed.

## BLOCKED

- Fund `hako-buyer-mw984kqb.testnet` with at least **51 Tidepool testnet USDC** at [the site faucet](https://app.usetidepool.tech/faucet). Its on-chain balance is zero; the faucet API returned HTTP 403 `site_only`. After funding, `scripts/demo-calls.sh` can attempt premium transfer and option-holder transfer. No premium payment is claimed yet.
- Provide `PYTH_HERMES_API_KEY` through a local ignored env file and a verified signed update to `pyth-oracle.testnet`. Its BTC/USD feed was absent at the queried block, and unauthenticated Hermes returned HTTP 401. OTM release, ITM exercise, exercise-window lapse, a later real price crossing, and a real MPC-signed buyer Bitcoin receipt remain unverified.
- The NEAR contract stores an ML-DSA signed Bitcoin UTXO assertion but has no on-chain Bitcoin proof. The option holder transfer is custom and does not yet satisfy full NEP-171 interoperability. Mainnet auto-compounding and any-chain deposits need `NEAR_MAINNET_ACCOUNT`, funded assets, and a separately authorized live 1Click flow; Hako only issues dry quotes. See [BLOCKED.md](BLOCKED.md).
- Nick must publish this local-only repository, provide the human submission fields and demo post, and disclose any second independent project. No remote was created and nothing was pushed.

## Exact demo commands

From the repository root, with the README toolchain installed:

```sh
corepack pnpm install --frozen-lockfile && corepack pnpm test
node scripts/verify-oneclick.mjs
scripts/demo.sh
scripts/demo-solana.sh
node scripts/demo-recovery.mjs
scripts/demo-calls.sh
```

`pnpm test` starts and stops its own NEAR sandbox and Bitcoin Core. `demo.sh` creates ignored NEAR testnet credentials and stops Anvil/Bitcoin Core; `demo-solana.sh` stops its validator. The recovery demo waits about two minutes. `demo-calls.sh` starts and stops Bitcoin Core and exits with `Setup required` before deploying until the named buyer has testnet USDC. To inspect the wallet, configure `packages/web/.env.local` from `.env.example`, then use the local-node/proxy commands in [README.md](README.md) and run `corepack pnpm web`. No mainnet transaction is performed.
