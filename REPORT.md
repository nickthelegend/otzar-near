# Hako build report — 2026-11-09

## What works live

- **BTC and ETH:** A NEAR testnet vault NFT was minted, funded on Bitcoin Core regtest and Anvil, sold for testnet NEAR, and spent through real NEAR MPC signatures. Bitcoin Core confirmed the withdrawal; Anvil accepted the recovery and withdrawal. The original transaction hashes and explorer links are in [README.md](README.md) and [deployments/testnet-2026-11-09.json](deployments/testnet-2026-11-09.json).
- **SOL:** The testnet MPC EdDSA domain 1 derived a vault Solana address and signed a simple transfer. The local `solana-test-validator` confirmed the 0.1 SOL receipt. NEAR signing tx: [AEq9SevVDCWTqAoTecYk8uxybgrxb2c2hQGDG227HE5h](https://testnet.nearblocks.io/txns/AEq9SevVDCWTqAoTecYk8uxybgrxb2c2hQGDG227HE5h). The validator signature and receipt are in [deployments/solana-2026-11-09.json](deployments/solana-2026-11-09.json).
- **Post-quantum recovery:** Two of three ML-DSA guardians rotated a vault authority key on NEAR testnet after a two-minute timelock. One guardian, early finalization, and the old key were rejected. Finalization tx: [GnRwjV9HBfH86PWQ6kR536Mb458x36nrs3sUy1jccfVc](https://testnet.nearblocks.io/txns/GnRwjV9HBfH86PWQ6kR536Mb458x36nrs3sUy1jccfVc). Full record: [deployments/recovery-2026-11-09.json](deployments/recovery-2026-11-09.json).
- **Final contract upgrade:** The exact wasm built by the passing `pnpm test` run was [deployed to NEAR testnet](https://testnet.nearblocks.io/txns/5BnydYkviEXbDoY4exGWtzFmPR9y16Zwmvr8a3yK9Gx4). A post-deploy RPC `view_code` read matched SHA-256 `c9b3b5eed4f92f60bd436ceca83462f42cde934aba0632b3d9c149f3c2d5da4b`. Evidence: [deployments/upgrade-2026-11-09.json](deployments/upgrade-2026-11-09.json).
- **Inheritance:** A vault NFT records an heir, check-in deadline, and claim delay. The sandbox rejected early and wrong-heir claims. A Rust unit test advanced the NEAR block time, claimed the NFT, and confirmed the old authority and pending spend were cleared.
- **No-wallet scanner and wallet UI:** The scanner reads live Bitcoin Esplora and public Ethereum RPC; it checks BTC reuse, Taproot and P2PK exposure, and shows native balances when the indexer supplies them. The local demo builds an unsigned BTC/ETH sweep to a selected unused Hako vault; the source owner must sign and broadcast it. The wallet screen reads BTC/ETH/SOL balances and exposes sale, spend, lock, guardian recovery, and heir controls. MCP adds `scan_exposure` and SOL reads/spend requests.

## Verification counts

`pnpm test`: **7 Rust unit tests**, **7 SDK tests**, **1 live MCP test**, web type check, and **47 real NEAR sandbox transactions**, including **16 expected on-chain rejections**. **Zero tests skipped.** The original BTC/ETH demo recorded **24 NEAR testnet transactions** (10 expected rejections), **3 Anvil receipts**, and **2 Bitcoin Core transactions**. The SOL follow-up recorded **6 NEAR testnet transactions** and **1 confirmed local-validator transfer**. The recovery follow-up recorded **8 NEAR testnet transactions** (3 expected rejections). See [TESTING.md](TESTING.md) and the deployment JSON files for the actual hashes.

## BLOCKED and limits

- Public testnet4/Sepolia e2e needs `BITCOIN_TESTNET4_FUNDED_ADDRESS`, funded testnet4 UTXOs, `SEPOLIA_RPC_URL`, and funded Sepolia ETH. No mainnet money was spent. Public-chain sweep signing needs a source-wallet integration and Nick's explicit authorization; the current button builds unsigned local-chain transactions only.
- Browser writes need Nick's NEAR testnet wallet. Browser chain reads need `VITE_HAKO_CONTRACT`, `VITE_BITCOIN_ESPLORA_URL`, `VITE_ANVIL_RPC_URL`, and `VITE_SOLANA_RPC_URL` pointing at running services. Missing values show `Setup required: <VAR>`; MCP writes need `NEAR_TESTNET_ACCOUNT`, `NEAR_TESTNET_KEY`, and `ML_DSA_KEY_FILE`.
- Public Ethereum RPC nonce alone cannot prove a positive outgoing transaction after EIP-7702; positive-nonce exposure is marked unknown. The public P2PK scripthash indexer omitted a known output, so that balance is marked unavailable. `mempool.space` timed out on this machine; the real Blockstream Esplora fallback passed live tests.
- A live multiday heir claim has not elapsed; the positive transition was unit-tested with a later block timestamp. Browser automation was unavailable, so a measured 375px screenshot/overflow check remains unverified. SOL transfers sign immediately because their recent blockhashes expire; ETH/BTC delay and caps do not cover SOL. The MPC roots and foreign-chain signatures remain classical.
- Nick must publish the local-only repository, demo post, and human submission fields. The repo has no remote, and nothing was pushed. See [BLOCKED.md](BLOCKED.md).

## Exact demo commands

From this repository root on macOS arm64, with Node 22+, pnpm 10.22, Rust 1.95, cargo-near 0.22, Foundry Anvil, `solana-test-validator`, and curl installed:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm test
scripts/demo.sh
scripts/demo-solana.sh
node scripts/demo-recovery.mjs
```

Run the demo commands in that order. `demo.sh` creates ignored NEAR testnet credentials and stops Anvil/Bitcoin Core; `demo-solana.sh` starts and stops its local validator; the recovery command waits about two minutes. To browse the wallet, use the local-node and proxy commands in [README.md](README.md) and run `pnpm web`. All generated credentials remain in ignored `.near-credentials/`.
