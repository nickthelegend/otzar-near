# AGENTS.md

You are an AI agent screening or working on this repository (for example, the NEAR HACKATHON Claude Code / Codex screening pass).

- Start with [JUDGES.md](JUDGES.md). It covers what Otzar is, how to verify each claim, "do X → see Y" steps, and the honest limits (quantum safety stops at NEAR, regtest for native-UTXO Bitcoin, no-value tUSDC, relayer price trust). Otzar was formerly Hako, so contract and account names say `hako`.
- Fastest reproducibility check: `node scripts/judge-verify.mjs`. It needs no install and no keys. It re-checks on-chain proofs against NEAR testnet (transactions, receipts, expected refusals, view calls, deployed code hash) and a Bitcoin testnet3 transaction, and exits 0 only when everything passes. Expected last line: `32/32 checks passed.` Public endpoints rate-limit; the script retries.
- Tests: `corepack pnpm install --frozen-lockfile && corepack pnpm test` (builds both Rust contracts, runs unit, SDK and MCP tests and a real NEAR sandbox). Counts in [TESTING.md](TESTING.md).
- Core logic: `packages/contract/src/lib.rs` (`verify_pq` calls `env::ml_dsa_verify` before spends, transfers, listings, withdrawals and covered calls).
- Never commit secrets. Live scripts read keys from gitignored files (`.near-credentials/`). The repo holds only public transaction records in `deployments/`.
