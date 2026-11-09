# Hako build report — 2026-11-09

## What works live

- A NEAR testnet box NFT was minted, funded on Bitcoin Core regtest and Anvil, listed, and bought atomically for testnet NEAR. The buyer registered a new ML-DSA-65 key and vault policy. The seller's recovery policy and Bitcoin key registration were cleared on sale.
- The contract rejected over-cap, wrong-key, replay, seller front-run, pending-listing, guardian-diversion, old-Bitcoin-address, and post-signature-resale attempts on NEAR testnet. It handled a delayed Ethereum spend through guardian recovery.
- The NEAR testnet MPC network signed a Bitcoin BIP143 digest and two Ethereum EIP-1559 digests. Bitcoin Core confirmed the Bitcoin withdrawal; Anvil accepted the Ethereum recovery and clean withdrawal. `scripts/verify-evidence.mjs` independently checked every recorded transaction.
- The SDK derives both addresses from the signer root and the `hako/<token_id>/<epoch>` path. The web gallery/detail and MCP `box_info`, `request_spend`, and `list_box` surfaces build and query live state.

## Tests and evidence

`pnpm test` passed: **5** Rust unit tests, **2** SDK tests, **1** live MCP test, web type check, and **25** NEAR sandbox transactions (**8** expected rejections). The demo recorded **24** NEAR testnet transactions (**10** expected rejections), **3** successful Anvil receipts, and **2** confirmed Bitcoin Core transactions. **Zero tests skipped.** The full links, gas measurements, and hashes are in [README.md](README.md), [TESTING.md](TESTING.md), and [deployments/testnet-2026-11-09.json](deployments/testnet-2026-11-09.json).

## BLOCKED and limits

- Public Bitcoin testnet4 and Sepolia e2e: Nick must provide `BITCOIN_TESTNET4_FUNDED_ADDRESS`, `SEPOLIA_RPC_URL`, and funded public-chain addresses. No faucet or mainnet funds were used.
- Browser writes need Nick's NEAR testnet wallet. MCP writes need `NEAR_TESTNET_ACCOUNT`, `NEAR_TESTNET_KEY`, and `ML_DSA_KEY_FILE`; Bitcoin balance/broadcast reads need `VITE_BITCOIN_ESPLORA_URL` or `BITCOIN_ESPLORA_URL`. Missing inputs yield `Setup required` errors. See [BLOCKED.md](BLOCKED.md).
- Public repository, demo post, payout account, contact fields, and consent remain Nick's submission steps. The repository is local only; no remote was created or pushed.
- This is a prototype: no external audit, no on-chain proof of MPC-derived Bitcoin registration, no automatic Bitcoin epoch advancement, and no full NEP-171 approval/event conformance. The browser layout passed a production build and CSS review, but interactive visual QA was unavailable.

## Exact demo commands

From the repository root on macOS arm64, with Node 22+, pnpm 10.22, Rust 1.95, cargo-near 0.22, Foundry Anvil, and curl installed:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm test
scripts/demo.sh
```

`scripts/demo.sh` downloads Bitcoin Core 31.2 to ignored `.tools/` if needed, creates only ignored testnet keys, starts Anvil and regtest, runs and verifies the live demo, and stops both nodes. To view the web UI, set the public variables in `packages/web/.env.local`, run `node scripts/bitcoin-proxy.mjs` with a running regtest node, then `pnpm web`.
