# Judge guide: Otzar (NEAR HACKATHON 2026)

For human judges and for the Claude Code / Codex screening pass (HACKATHON.md Q-017). Every claim below has a command or a link that checks it. (Otzar was formerly named Hako; contract and account names still say `hako`.)

## In one paragraph

**Product:** Otzar is a Bitcoin vault on NEAR testnet. Each vault is an NFT that controls its own Bitcoin, Ethereum and Solana addresses through NEAR Chain Signatures, and its authority key is ML-DSA-65 (NIST FIPS 204, post-quantum).
**Problem:** Bitcoin and Ethereum signatures (ECDSA) are breakable by a large quantum computer, and idle Bitcoin earns nothing.
**What Otzar does:** Real Bitcoin testnet3 coins cross to NEAR through the Omni BTC connector and are minted as nBTC. The owner locks the nBTC in a vault. The Otzar contract (`hako-contract-mw984kpp.testnet`) verifies an ML-DSA-65 signature on chain with `env::ml_dsa_verify` before any spend, vault transfer, listing, withdrawal, rule change or covered call. The vault earns by selling covered calls: a buyer pays a premium on NEAR straight to the owner. A forged post-quantum signature is refused on chain.
**Tracks:** `defi` (primary), `security`, `nfts`, from [HACKATHON_SUBMISSION_FORM.md](HACKATHON_SUBMISSION_FORM.md). NFT interoperability is incomplete (see Limits).

## Verify in one command (no install, no keys)

```sh
node scripts/judge-verify.mjs
```

Needs Node 18+ and nothing else. It checks public data, not our own files: the FastNEAR transaction API, the NEAR testnet RPC (a `tx` call per transaction, archival RPC first; see the RPC note below), contract view calls and deployed code, the Bitcoin testnet3 explorer API (Blockstream, mempool.space as fallback), and the contract source. Public endpoints rate-limit at times; the script retries with backoff, and a run takes seconds. Expected last line: `32/32 checks passed.` Exit code 0 only if all 32 pass.

| # | Check | Source of truth |
|---|---|---|
| 1 | Contract source: `env::ml_dsa_verify` with the errors "bad ML-DSA signature" and "quantum lock: ML-DSA signature required" | `packages/contract/src/lib.rs` |
| 2 | Vault NFT `otzar-btc-mwg7hadd` minted; its ML-DSA-65 key registered on chain | NEAR testnet txs `BHPHfn…`, `5uNCFY…` |
| 3 | Bitcoin testnet3 tx pays 60,000 sats to the deposit address the bridge connector derives for the seller account | Blockstream API, `btc-connector.n-bridge.testnet` view |
| 4 | Omni relayer `verify_deposit_v2`: `btc-client-v4.testnet` (Bitcoin light client) returns true and 59,800 sats of nBTC are minted | tx `Gv3gYv…` |
| 5 | Lock nBTC into the vault (`nbtc_locked` event); sell a covered call (`write_call_nbtc`); buyer pays 0.147756 tUSDC premium; withdraw with owner key plus ML-DSA signature | txs `9yTwfr…`, `8mAwz8…`, `HQEEMj…`, `4nWpid…` |
| 6 | Refused: withdraw with a forged ML-DSA signature; vault transfer and listing with the NEAR key only ("quantum lock: ML-DSA signature required"); transfer with a forged signature | txs `AT9E1y…`, `3PghCR…`, `ATu4EK…`, `CzDzjh…` |
| 7 | Listing signed with the vault's ML-DSA key succeeds | tx `FnCLpz…` |
| 8 | Refused: ETH spend over the daily cap, with a wrong ML-DSA signature, by a non-owner front-runner, with a stale nonce; resale after a signature was issued | txs `5WGNSs…`, `9zUjXA…`, `H96Bmo…`, `9hFoYX…`, `FjZ2MG…` |
| 9 | Refused: writer spends collateral of a live covered call; BTC spend over the daily cap | txs `A2FQof…`, `EiBvj8…` |
| 10 | Covered-call settlement: in-the-money exercise and out-of-the-money release each end in a Chain Signatures signature (`v1.signer-prod.testnet`); a late relayer price is refused; settle from the signed print succeeds | txs `EXAL6x…`, `9neZbT…`, `65JCAn…`, `71gsno…` |
| 11 | Chain Signatures also returns an Ed25519 signature (Solana) and a signature after the policy delay (BTC) | txs `AEq9Se…`, `AzLx5u…` |
| 12 | Guardian recovery: finalize before the timelock is refused; after it, succeeds | txs `5zrAxs…`, `GnRwjV…` |
| 13 | Deployed contract code sha256 equals the Nov 14 upgrade record (`251f65c2…`) | NEAR RPC `view_code`, `deployments/nbtc-upgrade-2026-11-14.json` |
| 14 | `nft_token`: the vault holds a 1,952-byte ML-DSA-65 public key and has used its nonce; `nft_total_supply` is 30+ | contract views |

The table groups the 32 checks. Each transaction line prints the signer and an explorer link `https://testnet.near.rocks/tx/<hash>`. Refusals are checked as failures that contain the expected error text.

**RPC note.** For each transaction the script first reads the transaction and its receipts from the FastNEAR transaction API, then cross-checks it with an RPC `tx` call using the signer from that response. The public RPC sometimes answers HTTP 429 or stalls on older transactions. After three misses the script stops asking, and a line before the final count reports `N confirmed, M skipped`. A skipped cross-check does not fail a check, which then rests on the transaction API alone; the view-call, code-hash, FastFS, Bitcoin and source checks do not depend on it.

## Do X → see Y

1. **`corepack pnpm install --frozen-lockfile && corepack pnpm test`.** It builds the workspace and both Rust contracts, runs unit, SDK and MCP tests, then runs a real NEAR sandbox. Counts are in [TESTING.md](TESTING.md): 12 contract unit tests, 2 tUSDC tests, 11 SDK tests, a 39-transaction nBTC sandbox with 10 refused attacks, a 55-transaction sandbox with 21 refused attacks, and a 30-transaction covered-call sandbox with 13 refused attacks. Rust and a NEAR sandbox binary are needed.
2. **`pnpm --filter @hako/sdk build`, then `VITE_HAKO_CONTRACT=hako-contract-mw984kpp.testnet pnpm web`**, and open the printed URL (normally `http://127.0.0.1:5173`). You see the landing page with live BTC-USD and vault counts, then `/app` (vaults), `/vault/call-itm-mw9irlhd`, `/market` and `/how`, read from NEAR testnet. Signing needs a funded Meteor testnet wallet; reading does not.
3. **`scripts/demo.sh`** (needs Bitcoin Core and Anvil). You see an NFT sale, rejected attack spends, then MPC-signed Bitcoin and Ethereum withdrawals on local chains, and a new `deployments/testnet-<date>.json`.
4. **`node scripts/demo-recovery.mjs`** (uses ignored testnet keys). You see a 2-of-3 ML-DSA key rotation after a two-minute timelock.
5. **Read the recorded runs:** `deployments/btc-testnet3-2026-11-14.json` (bridge, lock, call, premium, withdraw) and `deployments/film-v5-2026-11-14.json`.

## How Otzar uses NEAR (specific)

| NEAR feature | How Otzar uses it | Where |
|---|---|---|
| `env::ml_dsa_verify` (ML-DSA-65 host function) | Verifies the post-quantum signature on every spend, transfer, listing, withdrawal, rule change and covered call | `packages/contract/src/lib.rs` (`verify_pq`), checks 1, 6–9 |
| NEAR Chain Signatures (`v1.signer-prod.testnet`) | Secp256k1 and Ed25519 signatures for Bitcoin, Ethereum and Solana addresses derived per vault; requested only after the ML-DSA check | checks 10, 11 |
| Omni BTC connector and Bitcoin light client (`btc-connector.n-bridge.testnet`, `btc-client-v4.testnet`, `nbtc.n-bridge.testnet`) | Real Bitcoin testnet3 deposit proven to NEAR, nBTC minted, then locked in the vault | checks 3, 4 |
| NEP-141 (`ft_transfer_call`) | nBTC lock (`lock:<vault>`) and premium payment in tUSDC (`buy:<vault>`) | checks 5 |
| NEP-171 core and enumeration (partial) | The vault is an NFT: `nft_token`, `nft_tokens_for_owner`, `nft_total_supply`, transfer gated by ML-DSA | check 14 |
| Promises and callbacks | Chain Signatures request and result, nBTC refund on a refused lock | contract `execute_*`, `ft_on_transfer` |
| In-place contract upgrades | The contract account was upgraded several times with state preserved; code hashes recorded | check 13, `deployments/*upgrade*.json` |
| Meteor Wallet via wallet-selector | Browser signing on testnet | `packages/web/` |
| MCP server | Agent tools for reading vaults | `packages/mcp/` |

## Limits (read before scoring)

- **Quantum safety stops at NEAR.** NEAR verifies the post-quantum signature before anything moves. Bitcoin's own ECDSA signature, NEAR's MPC root key, the bridge's MPC key and the contract account's ed25519 deploy key are still classical.
- **Native-UTXO Bitcoin vaults run on Bitcoin Core regtest.** Only the bridged nBTC path uses real Bitcoin testnet3. `scripts/demo.sh --network testnet4` exits with `Setup required` because no testnet4 funds were supplied. Public Bitcoin exercise of a covered call is BLOCKED for that reason.
- **Premiums are paid in tUSDC**, a no-value test token minted by Otzar's own account, not real USDC.
- **Prices come from a relayer.** On testnet one ed25519 relayer key posts a signed Coinbase BTC-USD print; the contract checks the signature, source, timing and monotonic posts but cannot check that the HTTP body really said that price. Pyth does not serve NEAR testnet, and the Rhea mainnet oracle returned null for every asset (`deployments/rhea-oracle-mainnet-2026-11-09.json`). Browser settlement is BLOCKED (no relayer endpoint serving prints).
- **Bitcoin collateral on the native path is asserted, not proven:** the writer ML-DSA-signs an outpoint and amount; the contract cannot verify a UTXO.
- **The NFT is not a full NEP-171 option token** (no marketplace approvals or events). Exercise-window lapse and option transfer before expiry are untested on testnet.
- **One recorded settle was refused** (tx `65JCAniy…`, late relayer price). It is in the verifier as an expected refusal, and the contract was upgraded to verify the signed at-expiry print itself.
- Unaudited testnet software, upgradeable. Not checked by this verifier: Ethereum/Solana/Bitcoin broadcasts on local chains, and the film. Details: [BLOCKED.md](BLOCKED.md).

## Repository map

- `packages/contract/`: vault, covered-call, nBTC, guardian-recovery and Chain Signatures contract.
- `packages/test-usdc/`: tUSDC test token. `packages/sdk/`: signing, scanner, relayer message, quotes. `packages/mcp/`: MCP server. `packages/web/`: the app.
- `deployments/`: raw records of every live run. `scripts/`: demos, sandbox runners, relayer, and `judge-verify.mjs`.
- `e2e/`: browser tests.

## Rules compliance

- Code was written in the window; the first commit `1a17fb0` (Nov 9) is a scaffold. **Disclosed prior work:** the ML-DSA recovery pattern and TypeScript toolchain come from `near-qday-recovery` (Oct 20 commits `a4437ba`, `88f4282`), which is baseline, not new work (README, "Hackathon disclosures").
- Public repo and MIT licence (`LICENSE`).
- Demo post on X with the film (`otzar-near-film.mp4`).
- Other team projects are named in the README (Q-015).
