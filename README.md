# Otzar — the quantum-safe Bitcoin vault that earns

**A Bitcoin vault only your quantum-safe key can move, and it earns covered-call premium while it waits.**

Each vault is an NFT on NEAR that controls its own Bitcoin address through NEAR Chain Signatures. Its authority key is **ML-DSA-65** (NIST FIPS 204, post-quantum). The Otzar contract verifies that signature on chain with `env::ml_dsa_verify` before any Bitcoin spend, **vault transfer or listing**, rule change, guardian change or covered call. Owners sell covered calls from the vault: a buyer pays a premium on NEAR, the owner keeps it, and gives up gains above the strike.

**Where the guarantee stops:** NEAR checks the post-quantum signature before anything moves. Bitcoin's own ECDSA signature, NEAR's MPC root key and the contract account's ed25519 deploy key are still classical (see [Limits](#limits-and-security-boundaries)). Bitcoin runs on Bitcoin Core regtest; premiums are paid in tUSDC, a no-value test token.

### Quantum-locked ownership (new, Nov 13)

Until Nov 13 the ML-DSA key gated spends but not ownership: `nft_transfer` and `list` checked only the owner's classical NEAR key. Both now require an ML-DSA-65 signature over `transfer:v1:<receiver>` / `list:v1:<price>` once a vault has a key ([contract](packages/contract/src/lib.rs)). Sandbox tests cover classical-only, forged, receiver-replay and wrong-price attempts; the testnet contract was upgraded and the code hash verified ([record](deployments/pq-ownership-2026-11-13.json)).

| Live on NEAR testnet, Nov 13 | Result | Transaction |
| --- | --- | --- |
| Upgrade to quantum-locked ownership (code sha256 `2c60b114…3641b`, verified over RPC) | Confirmed | [DYNM8tkz…](https://testnet.nearblocks.io/txns/DYNM8tkz6ss7NvxrsZhX61a8EGu3iA4qRYagA43Mn4ua) |
| Owner's NEAR key alone tries to transfer a locked vault | Refused: `quantum lock: ML-DSA signature required` | [3PghCRJx…](https://testnet.nearblocks.io/txns/3PghCRJxtpsUXpwsnXmeC64qwqPRFXpAALUApmLwjNpZ) |
| Transfer with a forged ML-DSA signature | Refused: `bad ML-DSA signature` | [CzDzjh2x…](https://testnet.nearblocks.io/txns/CzDzjh2x4YgKkHTjML4oX63k59getTWdcQT3SgmQ8sSy) |
| Owner's NEAR key alone tries to list it for sale | Refused: `quantum lock: ML-DSA signature required` | [ATu4EK8A…](https://testnet.nearblocks.io/txns/ATu4EK8AG6FSJKVEHjTUTQLPkGVBQ9HnnCiEY3Litzk) |
| Listing signed with the vault's ML-DSA key | Confirmed (then withdrawn in [91MkDqXU…](https://testnet.nearblocks.io/txns/91MkDqXUuYYYkCPdRQKsYSLhHUS3zEuJwPgFv8pkZoTP)) | [FnCLpz6R…](https://testnet.nearblocks.io/txns/FnCLpz6RzsQDRokCdNUaETqtWHa1w5MBDJ9HJkTAffLk) |

ML-DSA verification (`ml_dsa_verify`, protocol 87+) is live on both NEAR testnet and mainnet (protocol 88); this build is deployed on testnet only.

## Try it

Run these commands from the repo root. Use Node 22+ and pnpm 10.22.0 on your PATH. This is a local web demo reading NEAR testnet; no hosted demo URL is recorded in this repo.

1. Do `pnpm install --frozen-lockfile` — see the workspace dependencies install from the lockfile.
2. Do `pnpm --filter @hako/sdk build` — see the SDK compile into `packages/sdk/dist`.
3. Do `VITE_HAKO_CONTRACT=hako-contract-mw984kpp.testnet pnpm web` — see Vite print its local URL (normally `http://127.0.0.1:5173`). Leave this terminal running.
4. Open that URL — see the landing page with live BTC-USD, live vault counts and the on-chain feed. **Launch app** opens `/app` (vaults), then `/vault/call-itm-mw9irlhd` (strike vs BTC chart, rounds, quantum lock), `/market` (buy calls, live falling ask), `/write` (write a call, signed with ML-DSA), `/positions`, `/activity`, `/security` (the quantum-safe page: live access keys, code hash, refused-on-chain proofs) and `/settings`. Reading needs no wallet.
5. Open `/how` — see the covered-call explanation, testnet round, security limits, and public-address exposure scanner. To reproduce transactions yourself, follow the [Judge walkthrough](#judge-walkthrough) and its additional toolchain/setup requirements.

Reading vaults and rounds needs no local chain nodes. The covered-call write and Bitcoin send flows need Bitcoin Core. Public RPC or NearBlocks rate limits can interrupt reads. Errors are shown in the app; reload after the service recovers. Browser writes require your own Meteor testnet wallet and the relevant setup below. Settlement and Bitcoin exercise are reproduced by `scripts/demo-calls.sh`; the browser does not provide those actions. See [full-flow QA](FLOW-QA.md) for the screen-by-screen results and human sign-in gates.

## Live on NEAR testnet

Main vault contract: [`hako-contract-mw984kpp.testnet`](https://testnet.nearblocks.io/address/hako-contract-mw984kpp.testnet). Premium token: [`husdc-3177b477.testnet`](https://testnet.nearblocks.io/address/husdc-3177b477.testnet), a no-value test token. Chain Signatures uses `v1.signer-prod.testnet`.

These are recorded NEAR testnet transactions from November 9. Bitcoin delivery was on local Bitcoin Core regtest.

| Action | Transaction |
| --- | --- |
| Upgrade to signed-print settlement | [B2xv656hbBdzHPXpYNyD35nWqqogTdhDtELbBbn2hW9w](https://testnet.nearblocks.io/txns/B2xv656hbBdzHPXpYNyD35nWqqogTdhDtELbBbn2hW9w) |
| Buy the call; pay premium to the writer | [LEHEvVvX9fSEY8u5ZU1adrXcSrvVdYXydJnkKJpBtbe](https://testnet.nearblocks.io/txns/LEHEvVvX9fSEY8u5ZU1adrXcSrvVdYXydJnkKJpBtbe) |
| Settle the in-the-money call | [71gsnoXgkW34ByRqNwwvNuUfikxh8aofGaAPixprnnyq](https://testnet.nearblocks.io/txns/71gsnoXgkW34ByRqNwwvNuUfikxh8aofGaAPixprnnyq) |
| Request the MPC signature for Bitcoin delivery | [EXAL6x2FCgETk2YoHqGqrxVL6aFhv1cLmjm8X5ccH8w2](https://testnet.nearblocks.io/txns/EXAL6x2FCgETk2YoHqGqrxVL6aFhv1cLmjm8X5ccH8w2) |
| Finalize guardian key recovery after the timelock | [GnRwjV9HBfH86PWQ6kR536Mb458x36nrs3sUy1jccfVc](https://testnet.nearblocks.io/txns/GnRwjV9HBfH86PWQ6kR536Mb458x36nrs3sUy1jccfVc) |

Sources: [settlement upgrade](deployments/settle-upgrade-2026-11-09.json), [covered-call loop](deployments/calls-live-testnet-2026-11-09-171226.json), and [guardian recovery](deployments/recovery-2026-11-09.json).

Formerly Hako; on-chain account IDs keep the old prefix. A vault NFT on NEAR controls its Bitcoin Core regtest address through NEAR Chain Signatures. Its authority key is ML-DSA-65; the NFT carries spending rules, M-of-N post-quantum guardians, and an inheritable heir policy. A buyer can acquire a funded vault NFT on NEAR without a foreign-chain transfer at sale time. Public-chain addresses can be inspected without connecting a wallet.

**Also wired on local chains:** ETH (Anvil) and SOL (Solana test validator); not part of the judged flow.

This is a **testnet and local-chain prototype**, not a mainnet vault. “Quantum-safe” refers to NEAR authorization: foreign-chain signatures and MPC root keys remain classical. The vault NFT implements NEP-171 ownership and enumeration views used here; approvals, metadata events, and full marketplace interoperability are not implemented. See [Limits and security boundaries](#limits-and-security-boundaries).

## Covered calls and where the yield comes from

An Otzar owner can sell a covered call on a native-BTC box. A buyer pays a premium for the right to buy a fixed number of sats at a USD strike by expiry. The owner keeps the premium even if BTC finishes below the strike. If BTC finishes above it and the buyer exercises, the owner receives the strike payment and gives up those sats. **The owner's BTC upside above the strike is capped.** The premium is payment for that trade-off; it is not guaranteed investment yield.

The writer signs the strike, sats, expiry, premium range, and Bitcoin UTXO assertion with ML-DSA-65. The contract runs a Dutch auction whose asking premium falls from the opening price toward the minimum over up to seven days. While active, the call blocks owner Bitcoin spend requests, box listing, and box transfer on NEAR. The buyer pays with NEP-141 `ft_transfer_call`; the contract forwards the premium to the writer and records the sale only after that transfer succeeds. Each call fixes its premium token when it is written.

**Testnet premium token: tUSDC.** (Its deployed on-chain symbol still reads `tUSDC (Hako test)`, and the vault NFT metadata still says `Hako`; both were deployed before the rename.) Tidepool's testnet USDC faucet is site-only, so Otzar deploys its own clearly labelled NEP-141, [`husdc-3177b477.testnet`](https://testnet.nearblocks.io/address/husdc-3177b477.testnet) (symbol `tUSDC`, 6 decimals, source in `packages/test-usdc`). It has no value or peg; only the token account can mint. The contract owner points new calls at it with the contract-only `set_call_config`.

**Testnet price: relayer price (testnet).** Pyth Core no longer serves NEAR (`pyth-oracle.testnet` returns `null`). On testnet, `scripts/price-relayer.mjs` reads the last Coinbase Exchange BTC-USD trade (`https://api.exchange.coinbase.com/products/BTC-USD/ticker`) and signs `sha256("hako:relayer-price:v1:<contract>:BTC-USD:<price_e6>:<trade_time>:<source_url>")` with an ed25519 relayer key (`ed25519:79cyBu1FHUTJUXXdvksqMMapfdFTt8vx8kDE1NFaM5u5`). The contract checks:

- `post_relayer_price` (the live feed): signature, an allow-listed source URL, trade time at most 60 s old and not in the future, and a strictly newer time than the last post;
- `settle_call(token_id, price, time, source, signature)`: the same signature, and a trade observed in the first five minutes after expiry. Settlement is open for 24 hours. After that, `expire_unsettled_call` marks the call unsettled and the encumbrance lifts.

The price is never typed by hand, and the demo chooses strikes from the real spot price (ITM 2% below, OTM 3% above), so the real price at expiry decides the outcome. **Mainnet design:** read the Rhea price oracle `priceoracle.near` instead of the relayer. A [mainnet read on 2026-11-09](deployments/rhea-oracle-mainnet-2026-11-09.json) found the contract with 17 assets and a 90 s recency window, but every price, including bridged WBTC, was `null` at that block. That path is not yet verified.

**Yield display.** Rounds shorter than one day show `Demo round (<minutes> min)`, with actual test-token premiums. They show no annualised percentage and do not contribute to blended APY. The chart shows premiums in tUSDC when demo rounds are present. For paid rounds lasting at least one day, annualised yield is `premium ÷ (strike × size) × 365 d ÷ tenor`, from on-chain state. These prototype terms are not an options-model price or a yield forecast.

Vault IDs beginning with `qa-` are omitted from public lists, counts, charts and summaries. They remain available at `/vault/<id>` and in their connected owner’s portfolio. This is catalog filtering, not on-chain privacy.

**Verification boundary:** the signed UTXO assertion is checked against Bitcoin Core in the demo and against the live Bitcoin UTXO service in the browser, but the NEAR contract cannot independently prove Bitcoin ownership or balance. The relayer is a single trusted signer on testnet. The option claim uses a custom transfer method and is **not yet a complete NEP-171 NFT**. Mainnet USDC-to-BTC compounding and any-chain funding remain dry [1Click quote](https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/making-a-request) previews only. Do not treat this prototype as a collateralised production option. See [BLOCKED.md](BLOCKED.md).

### It earned: the live covered-call loop (2026-11-09)

Contract `hako-contract-mw984kpp.testnet`; writer `hako-seller-mw984kqa.testnet`; buyer `hako-buyer-mw984kqb.testnet`. Each box held 0.1001 BTC on Bitcoin Core regtest; each call sold 0.1 BTC. Strikes came from the Coinbase spot of $74,845.82 at write time. Settlement used the relayer-signed Coinbase trade of **$74,821.04** at 17:17:22 UTC, 2 s after expiry. Full record: [deployments/calls-live-testnet-2026-11-09-171226.json](deployments/calls-live-testnet-2026-11-09-171226.json).

| | ITM call `call-itm-mw9irlhd` | OTM call `call-otm-mw9is1x9` |
| --- | --- | --- |
| Strike | $73,348 | $77,092 |
| Write (ML-DSA) | [2fUWxg…](https://testnet.nearblocks.io/txns/2fUWxgkMiXCakivEEjjgXa13HfamxavMR7RAfESGYZAK) | [9PnXft…](https://testnet.nearblocks.io/txns/9PnXfthp1Xg7fMVqcWBd96T3nbA4srUu8pXzX6bgJkos) |
| Writer spends collateral while live | Rejected [A2FQof…](https://testnet.nearblocks.io/txns/A2FQof1ircJejob64sUrRHejyyhAPszGg4S4VDzcMTMN) | Rejected after sale [op4uf8…](https://testnet.nearblocks.io/txns/op4uf8MXsaBd3jqGd4Zz5khRnDcrbM3hpHeW1hksHrm) |
| Dutch-auction buy (premium → writer) | 0.010369 tUSDC [LEHEvV…](https://testnet.nearblocks.io/txns/LEHEvVvX9fSEY8u5ZU1adrXcSrvVdYXydJnkKJpBtbe) | 0.009178 tUSDC [GHbcAG…](https://testnet.nearblocks.io/txns/GHbcAGgtbJ4c1opJXJeMx539TgSYcPioKTtNvsU4KWV9) |
| Demo round duration | 238 s | 234 s |
| Relayer price posted at expiry | [ESEEWV…](https://testnet.nearblocks.io/txns/ESEEWVhwoH85JDvWGHCQ62VHkHT1enBQqnyfZSCkivsq) | same print |
| Settle | ITM [71gsno…](https://testnet.nearblocks.io/txns/71gsnoXgkW34ByRqNwwvNuUfikxh8aofGaAPixprnnyq) | OTM [DoRKjE…](https://testnet.nearblocks.io/txns/DoRKjEpsLwGhqnYdrnnWqAkeQKGh8p5S5D7QEjCpCzXq) |
| Buyer pays strike | 7,334.80 tUSDC [8ZKeBr…](https://testnet.nearblocks.io/txns/8ZKeBrXMYe6eSdenyoyXttwrTw9bw6XBPkT9aJeZ68KV) | n/a |
| MPC signature | Exercise to buyer [EXAL6x…](https://testnet.nearblocks.io/txns/EXAL6x2FCgETk2YoHqGqrxVL6aFhv1cLmjm8X5ccH8w2) | Release accepted [AuGzmi…](https://testnet.nearblocks.io/txns/AuGzmi72Evhn5He9gnRJ65GG6zkQp2Jg86T2yib2ZvgD), signed [9neZbT…](https://testnet.nearblocks.io/txns/9neZbTr3ccK8VkKToqcC32G7y9N28evWDPtAR2yri4DE) |
| Bitcoin Core regtest | Buyer received 10,000,000 sats in `eb9aa599cde89f606e4144cfa9c193c6ff618e16307c6e904e37ae543249f1b1`; 9,000 sats change to the next-epoch address | Writer got 10,009,000 sats back in `2f0063042853f33e33d2ae1ee4e8a15015d14931c15e487939876493ca7516fe` |

The writer earned **0.019547 tUSDC** in premium. These minute-long rounds are demos, not an annual yield history. The writer's tUSDC balance went from 0 to the two premiums plus the 7,334.80 tUSDC strike.

What went wrong on the way, kept in the record:
- FastNEAR returned HTTP 429, so the first `settle_call` landed more than 60 s after the print. The first relayer contract required settlement within 60 s, so it [rejected the settle](https://testnet.nearblocks.io/txns/65JCAniykkbS1wXhrF6rSmWyXpwbJPk8YH9hntj8wAhv).
- The contract was then [upgraded](https://testnet.nearblocks.io/txns/B2xv656hbBdzHPXpYNyD35nWqqogTdhDtELbBbn2hW9w) so that `settle_call` verifies the signed at-expiry print itself. Code SHA-256 `0de4a9d73a61572a001b1b9bc1aae2c7ec89f9a91fd8c9c386edff2673403897` was verified over RPC.
- Both calls were then settled with the print from `ESEEWV…`, read back from that transaction's on-chain arguments (`scripts/demo-calls-resume.mjs`).
- A [later post](https://testnet.nearblocks.io/txns/4ZQY1fVgdjAtqZBeRNymJA2cbS7q9TxbNB6Qprs2jQqj), made about 6 minutes after expiry, was not used.
- Two transactions, the strike payment and the exercise signature, reached the chain while the RPC returned HTTP 500. Their hashes were recovered from NearBlocks, and the script checked call state and balances before continuing.

| Setup (2026-11-09) | Result |
| --- | --- |
| [Create `husdc-3177b477.testnet`](https://testnet.nearblocks.io/txns/HdzEghGCsETiV9CLp1mLXjso9A8dArdx85oLcGtfibw8) | 2 NEAR from hako-seller. [Deploy and init](https://testnet.nearblocks.io/txns/5Mm6Pezd6CNCbn9638njtnZXPouYM5pGcSqXAQu1Cri); [mint 1,000,000 tUSDC to the buyer](https://testnet.nearblocks.io/txns/7AmCNT4rrM5ULSYBq2cMesXJ9zMK5JuupqVeBwwtRwnD). [Record](deployments/test-usdc-testnet-2026-11-09.json). |
| [Upgrade to relayer prices](https://testnet.nearblocks.io/txns/3xivDUZvDy6fLjufnyx6aseD9r8YVEJ4BEFhxvi4mjU6) | Code SHA-256 `3b425732…` matched; the earlier call `call-mw9c9f1x` kept its state. [Config](https://testnet.nearblocks.io/txns/4fVsnxjZPRFpnhsCfDm7Vx2L8osZSk5j7q7iUk1d5Yi6) set tUSDC and the relayer key. [Record](deployments/relayer-upgrade-2026-11-09.json). |
| [Upgrade to signed-print settlement](https://testnet.nearblocks.io/txns/B2xv656hbBdzHPXpYNyD35nWqqogTdhDtELbBbn2hW9w) | Code SHA-256 `0de4a9d7…` matched (current deployment). [Record](deployments/settle-upgrade-2026-11-09.json). |
| [1Click dry quote](deployments/oneclick-dry-2026-11-09.json) | Real ETH→native BTC response with correlation ID, amount, and provider signature; no deposit address or swap. |
| Earlier attempts | [Covered-call write without premium](deployments/calls-testnet-2026-11-09.json) and the [Pyth null read](deployments/pyth-testnet-2026-11-09.json) are kept as history. |

## Judge walkthrough

On macOS arm64 with Node 22+, pnpm 10.22, Rust 1.95, cargo-near 0.22, Foundry Anvil, and curl installed:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm test
scripts/demo.sh
scripts/demo-solana.sh
node scripts/demo-recovery.mjs
scripts/demo-calls.sh
```

`pnpm test` builds the workspace packages and both Rust contracts, runs unit and live signer/MCP/scanner checks, then starts and stops a real NEAR sandbox. `scripts/demo.sh` starts Bitcoin Core regtest and Anvil, performs the NFT sale, rejects attack spends, then broadcasts MPC-signed Bitcoin and Ethereum withdrawals. `scripts/demo-solana.sh` starts and stops a local Solana validator, upgrades the same NEAR testnet contract, and broadcasts a real Ed25519 MPC-signed SOL transfer. `node scripts/demo-recovery.mjs` proves a 2-of-3 ML-DSA key rotation after its two-minute timelock on NEAR testnet. It waits for the full timelock. The scripts use ignored `.near-credentials/` testnet keys; `demo.sh` creates them first. `node scripts/deploy-test-usdc.mjs` (once) deploys tUSDC, mints the buyer's test balance and creates the relayer key; `node scripts/setup-relayer-testnet.mjs` upgrades the contract, verifies its code hash and sets the premium token and relayer key. `scripts/demo-calls.sh` then starts Bitcoin Core regtest and runs the full loop: two regtest-funded boxes, an ITM and an OTM call with strikes set from the live Coinbase price, writer-spend rejections, Dutch-auction buys in tUSDC, a relayer-signed settlement price at expiry, the ITM strike payment and MPC-signed Bitcoin exercise to the buyer, and the OTM collateral release. It stops if the buyer has no tUSDC (`Setup required`). Each run writes `deployments/calls-live-testnet-YYYY-MM-DD-HHMMSS.json`; `node scripts/export-web-evidence.mjs` copies its transaction hashes into the web app. If FastNEAR rate-limits, set `NEAR_RPC=https://near-testnet.drpc.org` (dRPC returned HTTP 500 while waiting on MPC callbacks, so FastNEAR stays the default).

Do `scripts/demo.sh` → see a new `deployments/testnet-YYYY-MM-DD.json` with NEAR transaction links and local-chain transaction IDs. Do `pnpm web` after creating `packages/web/.env.local` from `.env.example` → see live boxes, addresses, balances, vault rules, pending countdowns, signing and sale controls at `http://127.0.0.1:5173`. The Bitcoin balance and broadcast controls need the local proxy: `node scripts/bitcoin-proxy.mjs`, with `VITE_BITCOIN_ESPLORA_URL=http://127.0.0.1:3007` in the web env file. The proxy reads the real Bitcoin Core regtest node; it is not a fixture service. `scripts/demo.sh` saves Anvil's state to ignored `.demo/anvil-state.json` on exit so local receipts can be reloaded.

The web wallet is [Meteor Wallet](https://wallet.meteorwallet.app) on testnet, through NEAR Wallet Selector 10.1.4. The demo's generated NEAR accounts are for the CLI flow; browser actions require a testnet wallet you control.

**Connecting a wallet.** You need a `.testnet` account in Meteor Wallet (create or import one there; NEAR's guide is [Create an account](https://docs.near.org/getting-started/create-account), and free testnet NEAR comes from [near-faucet.io](https://near-faucet.io)). **Connect wallet** opens Meteor in a pop-up (or its browser extension) at `wallet.meteorwallet.app/connect/testnet/login`, asking for a function-call key on `hako-contract-mw984kpp.testnet`; the result is posted back to the page, so there is no redirect. Calls with no deposit to the Otzar contract are then signed by that key; buying a round (a 1-yocto `ft_transfer_call`) opens Meteor for approval. A blocked pop-up or a closed wallet window shows a plain banner. MyNearWallet was removed on 2026-11-10: its testnet pop-up now answers "MyNearWallet can't connect to apps anymore" and points to Meteor. If a setting is missing, the interface reports `Setup required: <VAR>`.

## Architecture and NEAR features

| Package | Purpose |
| --- | --- |
| `packages/contract` | NFT ownership/sale, BTC/ETH/SOL checks, ML-DSA authorization, guardian recovery, inheritance, covered-call auction/payment/oracle state, and MPC calls. |
| `packages/sdk` | MPC derivation, BTC/ETH/SOL transaction assembly, scanner reads, ML-DSA signatures, live RPC helpers, and 1Click dry quotes. |
| `packages/web` | `/` landing (hero, live stats, quantum-safe section with the attacker panel, how it works, live vault table and chart, on-chain feed, FAQ), `/app` vaults, `/vault/<id>` vault page (strike-vs-BTC chart, buy box, quantum-lock card, owner tools for keys, rules, sends, rounds, recovery and sale), `/market` buy calls, `/write` write a call, `/positions`, `/activity`, `/security`, `/settings` and `/how` (with the exposure scanner). |
| `packages/mcp` | stdio `box_info`, `call_info`, `dry_deposit_quote`, `scan_exposure`, `request_spend`, and `list_box`; writes call the same contract checks as the UI. |

NEAR features used: **Chain Signatures** (ECDSA domain 0 for BTC/ETH, EdDSA domain 1 for SOL) to sign foreign transactions; **NEP-171 core ownership/enumeration methods** for the vault NFT; NEAR testnet transactions for sale and vault policy; **`env::ml_dsa_verify`** for owner and guardian authorization. **NEP-141** `ft_transfer_call` pays covered-call premiums and strikes in tUSDC, and **`env::ed25519_verify`** checks the testnet price relayer's signature. 1Click mainnet is used for `dry: true` quotes only; NEAR Intents has no testnet. Sub-accounts, NEP-245, meta transactions, OutLayer TEE, and Sputnik DAO are not used. The option claim is not yet NEP-171 conformant.

The MPC testnet signer is `v1.signer-prod.testnet`. Each box uses `hako/<token_id>/<epoch>` as its path. The SDK computes SHA3-256 epsilon according to the [NEAR MPC implementation](https://github.com/near/mpc/blob/main/crates/near-mpc-crypto-types/src/kdf.rs) and verifies the derived key against the signer's `derived_public_key` view. The contract sends `sign` a `payload_v2.Ecdsa` 32-byte digest, `path`, and `domain_id: 0` with one yoctoNEAR. The [NEAR Chain Signatures documentation](https://docs.near.org/chain-abstraction/chain-signatures/implementation) describes the network and signer; the [MPC repository](https://github.com/near/mpc) describes the request schema.

For Ethereum the contract accepts only simple unsigned EIP-1559 type-2 transfers on chain ID 31337 or 11155111 and hashes their typed bytes with Keccak-256. For Bitcoin it accepts one-input, one- or two-output, unsigned P2WPKH transfers and computes BIP143 SIGHASH_ALL itself. The caller never supplies the MPC payload. Bitcoin change must match the registered next-epoch script and wait two minutes after registration; the current-epoch script cannot receive change. Sale and transfer are blocked after any MPC signature is issued, preventing a seller from signing a withdrawal and then selling the still-funded NFT. A buyer must register their own ML-DSA key and policy after sale; the seller's guardian/recovery policy and Bitcoin registration are cleared.

### Deposit quote preview (not execution)

The “Deposit anything” panel gets supported ETH, SOL, and USDC origins from 1Click's live token list and requests `dry: true` quotes into the box's next-epoch native Bitcoin address. A dry quote returns pricing only: it issues no deposit address and sends no asset. `ONECLICK_JWT` is optional; unauthenticated quotes use the published fee schedule. Mainnet execution requires `NEAR_MAINNET_ACCOUNT` and funded assets and is not run by Otzar.

## Scanner, recovery, SOL, and inheritance

The scanner works without a wallet. Enter a BTC address or P2PK public key, or an ETH address, then press **Scan address**. For Bitcoin it reads address balances and paginated transactions through [mempool.space Esplora](https://mempool.space/docs/api/rest), falling back to [Blockstream Esplora](https://github.com/Blockstream/esplora/blob/master/API.md) when mempool.space is unavailable. It checks spent P2PKH/P2WPKH addresses, reused outputs, P2PK scripts, and Taproot addresses. Some public indexers do not index P2PK outputs; in that case Otzar reports exposure from the public key itself and marks the balance unavailable. For ETH it reads balance, nonce, and code from a public JSON-RPC. A zero nonce rules out a sent EOA transaction; a positive nonce is marked **unknown** because [EIP-7702 breaks the nonce-as-sent-count assumption](https://ethereum.github.io/execution-apis/api/methods/eth_getTransactionCount/). Contract accounts are also marked unknown for this EOA check. No exposure result is based on fabricated chain data.

Press **Move it into Otzar** in **Local demo** mode with a selected vault to build an unsigned sweep to that vault's fresh regtest or Anvil address. The source owner must sign and broadcast it. Public mainnet sweep preparation is [blocked](BLOCKED.md): Otzar refuses to build a mainnet spend in this prototype. A regtest source currently needs one UTXO; the builder uses a fixed 500-sat demo fee. The Anvil builder reads the source nonce, balance, and gas price live. The scanner itself requires no NEAR account.

Set 2–5 ML-DSA guardian public keys and a threshold of at least 2 with an owner ML-DSA signature. A guardian recovery requires distinct valid signatures over the vault, owner, recovery nonce, and new key; it waits 2 minutes to 30 days. The owner can cancel. After finalization the old authority key fails. This adapts the ML-DSA recovery pattern from the earlier October 2026 `near-qday-recovery` / Phylax library (disclosed prior work); **Phylax is folded into Otzar and is not another entry**. The NFT's heir policy names a NEAR account and visible deadline plus claim delay. Owner check-in extends the deadline; the owner can cancel; after the delay only the heir may claim. Claim clears the old authority and policies. A signed vault cannot transfer to an heir because an already issued foreign-chain signature could still spend after transfer.

The signer contract's [EdDSA domain 1](https://github.com/near/mpc/blob/main/crates/near-mpc-crypto-types/src/sign.rs) derives a Solana address per vault. Otzar accepts only a single legacy SystemProgram SOL transfer message, verifies its source and destination fields on NEAR, requires ML-DSA owner authorization, and requests an Ed25519 MPC signature. The SDK verifies the signature against the derived source key before broadcasting. Solana recent blockhashes expire quickly, so this prototype signs SOL immediately; the BTC/ETH delay and daily cap are **not** enforced for SOL. The local validator e2e confirms 0.1 SOL received. The MPC root and Solana Ed25519 signature remain classical.

| New live proof | NEAR transaction | Foreign chain result |
| --- | --- | --- |
| Solana address registration | [CtkHMADGR6E2vZmShh5tWLJDdf3Zc8r9ojkCrYZt26EG](https://testnet.nearblocks.io/txns/CtkHMADGR6E2vZmShh5tWLJDdf3Zc8r9ojkCrYZt26EG) | Derived Ed25519 address in [Solana evidence](deployments/solana-2026-11-09.json) |
| SOL message authorization | [AwwQn9dNKrNXgMZ3pMPn5Qtp7aqiZJmeNHvdaBHYDURJ](https://testnet.nearblocks.io/txns/AwwQn9dNKrNXgMZ3pMPn5Qtp7aqiZJmeNHvdaBHYDURJ) | 0.1 SOL transfer prepared |
| Ed25519 MPC signature | [AEq9SevVDCWTqAoTecYk8uxybgrxb2c2hQGDG227HE5h](https://testnet.nearblocks.io/txns/AEq9SevVDCWTqAoTecYk8uxybgrxb2c2hQGDG227HE5h) | Local validator signature `4HA5Awa6j9yXgDPDCmTKXf48z426jCcGaMuW1nvwhahhWZqg8cdx2RwzJeVvZtA5azWZwrS5d7xCTcDNpygArrcW` (confirmed) |
| 2-of-3 PQ recovery initiated | [AmUcTVtZVFRSssXgj7AXN7XzeqBDjNzhqBvUHtPbr83Y](https://testnet.nearblocks.io/txns/AmUcTVtZVFRSssXgj7AXN7XzeqBDjNzhqBvUHtPbr83Y) | One guardian rejected [on-chain](https://testnet.nearblocks.io/txns/C26pPNCi4RfYH9x2ZTMnzuyNKCHv1XNeo67pz29RHDzn) |
| PQ recovery finalized after timelock | [GnRwjV9HBfH86PWQ6kR536Mb458x36nrs3sUy1jccfVc](https://testnet.nearblocks.io/txns/GnRwjV9HBfH86PWQ6kR536Mb458x36nrs3sUy1jccfVc) | Early finalization rejected [on-chain](https://testnet.nearblocks.io/txns/5zrAxsiFqBehWMpJFZUbd61FDzZzxg5Fx87ckxFT4zAp) |

The earlier wallet release was [deployed](https://testnet.nearblocks.io/txns/5BnydYkviEXbDoY4exGWtzFmPR9y16Zwmvr8a3yK9Gx4); the [earlier covered-call upgrade](https://testnet.nearblocks.io/txns/2aDHEvai52YJyE5HXJBRAWGoBuFw15KbKVe8mTwozmA1) was superseded by the [signed-print settlement upgrade](deployments/settle-upgrade-2026-11-09.json), the latest deployment recorded here. Full records: [Solana](deployments/solana-2026-11-09.json), [PQ recovery](deployments/recovery-2026-11-09.json), [earlier upgrade](deployments/upgrade-2026-11-09.json), [wallet sandbox attacks](deployments/sandbox.json), and [covered-call sandbox attacks](deployments/calls-sandbox.json). The Solana signature is local-validator evidence, so it has no public explorer URL; reproduce it with `scripts/demo-solana.sh` and query the validator before the script stops.

## Deployment and evidence

The complete machine-readable record is [deployments/testnet-2026-11-09.json](deployments/testnet-2026-11-09.json). The table below is filled from the final demo run. Every NEAR link is a testnet transaction; Bitcoin IDs are for local regtest and Ethereum IDs are for local Anvil.

Contract: `hako-contract-mw984kpp.testnet`. Demo box: `box-mw99z867`.

| Action | Result | NEAR testnet transaction | Gas (Tgas) |
| --- | --- | --- | ---: |
| upgrade hako | Confirmed | [2zEtKTWUD2XmA9D3TRQZirGhaVnRkoogac9GtPuNJgLb](https://testnet.nearblocks.io/txns/2zEtKTWUD2XmA9D3TRQZirGhaVnRkoogac9GtPuNJgLb) | 19.61 |
| mint box | Confirmed | [8ANx1MSBEXHy6NzL93WaF4SCvWn4RotQgaf1EKpYuHm7](https://testnet.nearblocks.io/txns/8ANx1MSBEXHy6NzL93WaF4SCvWn4RotQgaf1EKpYuHm7) | 5.48 |
| list box | Confirmed | [HE8q9oXco98jEY4DDBcU2VkT7h5xAgr8CpBqKLKhJ2w2](https://testnet.nearblocks.io/txns/HE8q9oXco98jEY4DDBcU2VkT7h5xAgr8CpBqKLKhJ2w2) | 5.50 |
| buy box | Confirmed | [CuWRZuhbuMSiNWWAYBpQ79m9G1568iWbo2pwyNFUMsQ4](https://testnet.nearblocks.io/txns/CuWRZuhbuMSiNWWAYBpQ79m9G1568iWbo2pwyNFUMsQ4) | 6.28 |
| buyer quantum-locks | Confirmed | [Ge32nrCMLt69XGRyo7gBkYLjGG1W2Rxmm61BDSpX5NXV](https://testnet.nearblocks.io/txns/Ge32nrCMLt69XGRyo7gBkYLjGG1W2Rxmm61BDSpX5NXV) | 5.78 |
| buyer sets vault policy | Confirmed | [9dgdgsyqZNQ5xCYLNBYK5kjoo4gjn7MqYs4FbYenoGca](https://testnet.nearblocks.io/txns/9dgdgsyqZNQ5xCYLNBYK5kjoo4gjn7MqYs4FbYenoGca) | 6.78 |
| over-cap rejected | Rejected as expected | [5WGNSsxmC9Vqt55pZPi1osbyt5kiwFq4g8hSqhMg7c9E](https://testnet.nearblocks.io/txns/5WGNSsxmC9Vqt55pZPi1osbyt5kiwFq4g8hSqhMg7c9E) | 3.91 |
| wrong PQ key rejected | Rejected as expected | [9zUjXAW1nshyLvu1wmTP7drURp48Z4eKjKZwRDyuJBvi](https://testnet.nearblocks.io/txns/9zUjXAW1nshyLvu1wmTP7drURp48Z4eKjKZwRDyuJBvi) | 3.91 |
| seller front-run rejected | Rejected as expected | [H96BmoW8NrSsHzQzkghm1WH4LYeZtHZ6wHdPdTmB97pp](https://testnet.nearblocks.io/txns/H96BmoW8NrSsHzQzkghm1WH4LYeZtHZ6wHdPdTmB97pp) | 3.26 |
| request delayed ETH | Confirmed | [H67aQqArishsZiRodQxociLFMsNX62Swi89Kav2LhRSZ](https://testnet.nearblocks.io/txns/H67aQqArishsZiRodQxociLFMsNX62Swi89Kav2LhRSZ) | 6.90 |
| listing pending box rejected | Rejected as expected | [Gnf2cM1bR7YjVVDu29QRTGrX1GREE7dGeu6zD9fsj8XC](https://testnet.nearblocks.io/txns/Gnf2cM1bR7YjVVDu29QRTGrX1GREE7dGeu6zD9fsj8XC) | 2.76 |
| pending request replay rejected | Rejected as expected | [5uScxyHhZL2n93KwZ8iD4J5bhNJWYe3xvpjJUsSnBLzp](https://testnet.nearblocks.io/txns/5uScxyHhZL2n93KwZ8iD4J5bhNJWYe3xvpjJUsSnBLzp) | 3.26 |
| guardian diversion rejected | Rejected as expected | [8soUh8WnXyVwaY5uX2K19axp9bg22VZRenLsR8U5Xb9R](https://testnet.nearblocks.io/txns/8soUh8WnXyVwaY5uX2K19axp9bg22VZRenLsR8U5Xb9R) | 2.81 |
| guardian clawback | Confirmed | [37SuJys9pi4yDmEGLByEncU5srp1mbBVSvAD1nPwdoRg](https://testnet.nearblocks.io/txns/37SuJys9pi4yDmEGLByEncU5srp1mbBVSvAD1nPwdoRg) | 5.83 |
| MPC signs recovery | Confirmed | [2FuMNoARFBJpvMPmwCiHsQgM4pHhMjtiwEEeFDVWaV2Y](https://testnet.nearblocks.io/txns/2FuMNoARFBJpvMPmwCiHsQgM4pHhMjtiwEEeFDVWaV2Y) | 20.08 |
| nonce replay rejected | Rejected as expected | [9hFoYXyN8p6Y6WeeHV5DBNgCagEYwa4YmQskxUpeLoXt](https://testnet.nearblocks.io/txns/9hFoYXyN8p6Y6WeeHV5DBNgCagEYwa4YmQskxUpeLoXt) | 3.29 |
| request allowlisted ETH | Confirmed | [8i3pYX9vSqQAJhezW7yr7x5Pxn6g8kYRifgYRyz5EQ5f](https://testnet.nearblocks.io/txns/8i3pYX9vSqQAJhezW7yr7x5Pxn6g8kYRifgYRyz5EQ5f) | 7.00 |
| request MPC signature | Confirmed | [DfUUQ5tnZ5brTFbpRz59dKTfe3FBtnvwCUWEe1KncRp](https://testnet.nearblocks.io/txns/DfUUQ5tnZ5brTFbpRz59dKTfe3FBtnvwCUWEe1KncRp) | 20.20 |
| resale after signature rejected | Rejected as expected | [FjZ2MGw4UTGgksCus3CwRgLD1yVWrXPofRthGJyPz2wS](https://testnet.nearblocks.io/txns/FjZ2MGw4UTGgksCus3CwRgLD1yVWrXPofRthGJyPz2wS) | 2.88 |
| register BTC vault | Confirmed | [C69BqWbcBTZLpDKqV1Erro67E38UHGTchGVzwchZTLsG](https://testnet.nearblocks.io/txns/C69BqWbcBTZLpDKqV1Erro67E38UHGTchGVzwchZTLsG) | 7.27 |
| old BTC address reuse rejected | Rejected as expected | [2EuSKyrVUX7XUSjjg8zNyLmWvZHsCSdQu3kvqBdScCNP](https://testnet.nearblocks.io/txns/2EuSKyrVUX7XUSjjg8zNyLmWvZHsCSdQu3kvqBdScCNP) | 3.51 |
| BTC daily cap rejected | Rejected as expected | [EiBvj8JdUPYNwLfGJaUqnJUy2w2fyc8zsXkSeyNzcSmM](https://testnet.nearblocks.io/txns/EiBvj8JdUPYNwLfGJaUqnJUy2w2fyc8zsXkSeyNzcSmM) | 4.41 |
| request BTC withdrawal | Confirmed | [EFBzZB6XRNrjv2o3EdkHQfPSu2iSdtxZbr1BV6khKScG](https://testnet.nearblocks.io/txns/EFBzZB6XRNrjv2o3EdkHQfPSu2iSdtxZbr1BV6khKScG) | 7.58 |
| MPC signs Bitcoin | Confirmed | [AzLx5us7NyZ7uxMwnYwBJhZnQNVoxz38eEm67enLjSzL](https://testnet.nearblocks.io/txns/AzLx5us7NyZ7uxMwnYwBJhZnQNVoxz38eEm67enLjSzL) | 20.77 |

| Foreign chain | Funding transaction | MPC-signed withdrawal / recovery |
| --- | --- | --- |
| Bitcoin Core regtest | `f9037a1e9b7d133275dfc83098602dbdcc08c313c2032f3878f24567934cae83` | withdrawal `c345f439c35fd9acda20718923093701d8f87efcd1a03dad7951edf6113e0238` (1+ confirmation) |
| Anvil chain 31337 | `0x88b5f0c6821edea76af4fa5e413ef10d9aed84730735bc677fe2b79b9df301a6` | recovery `0x2cd417589c101a97721dd833534025f08f1889390999b050ce5c61f3179e8d3b`; withdrawal `0xcc73278811d0c1944adab29c0549ab52afefb85596cd581b9b5f52e30b0402e0` (status 1) |

## Run the UI and MCP server

```sh
cp .env.example packages/web/.env.local
# Set VITE_HAKO_CONTRACT to the contract account in deployments/testnet-2026-11-09.json.
# Set VITE_ANVIL_RPC_URL and VITE_BITCOIN_ESPLORA_URL for local balances.
anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --load-state "$PWD/.demo/anvil-state.json"
# In another terminal:
.tools/bitcoin-31.2/bin/bitcoind -regtest -datadir="$PWD/.demo/bitcoin" -server=1 -txindex=1 -rpcport=18443 -listen=0 -fallbackfee=0.0001 -daemon
# For a different web port, set HAKO_WEB_ORIGIN to that exact origin.
# HAKO_BITCOIN_PROXY_PORT changes the proxy port (default 3007).
# HAKO_BITCOIN_RPC_URL changes its local regtest RPC (default http://127.0.0.1:18443/).
node scripts/bitcoin-proxy.mjs
# In another terminal, reload the Solana demo ledger:
solana-test-validator --ledger "$PWD/.demo/solana" --rpc-port 8899 --faucet-port 9900 --quiet
# In another terminal, set VITE_HAKO_CONTRACT in packages/web/.env.local and run:
pnpm web
```

Run the proxy, validator, and web commands in separate terminals. Stop Anvil, the validator, the proxy, and Vite with Ctrl-C and Bitcoin Core with `.tools/bitcoin-31.2/bin/bitcoin-cli -regtest -datadir="$PWD/.demo/bitcoin" stop` when done.

For MCP, build first, then set `HAKO_CONTRACT_ID` and run `node packages/mcp/dist/main.js` as a stdio server. `box_info` and `call_info` read testnet state; `dry_deposit_quote` requests a real 1Click preview without initiating a swap. Write tools additionally require `NEAR_TESTNET_ACCOUNT`, `NEAR_TESTNET_KEY`, and `ML_DSA_KEY_FILE`; Bitcoin requests also require `BITCOIN_ESPLORA_URL`. The MCP server never receives an MPC signing capability directly. It only submits transactions to Otzar's policy checks.

## Tests

See [TESTING.md](TESTING.md) for commands, actual counts, gas, and negative cases. All chain/service tests use live NEAR sandbox or testnet RPC, NEAR MPC, Bitcoin Core regtest, and Anvil. There are no mocked chain or service responses.

## Limits and security boundaries

- Otzar protects **authority on NEAR** with ML-DSA-65, including the guardian quorum and heir policy. Bitcoin and Ethereum secp256k1 signatures, Solana Ed25519 signatures, and both MPC root keys remain classical. One-time addresses reduce Bitcoin public-key exposure to the mempool window on first spend. A future Bitcoin post-quantum output type would require migration; BIP-360 is a proposal, not an active Bitcoin feature. The policy carries an `emergency_migration` destination field, but automatic migration execution is not implemented.
- One Bitcoin UTXO per spend and simple ETH transfers are supported. Bitcoin next-epoch public keys are registered under an ML-DSA signature, but the contract does **not** prove that a registered key equals the MPC path derivation. The SDK verifies derivation against the signer; an independent client should verify it before sending change. The contract also does not advance epochs after broadcast. The original wallet demo sweeps the initial UTXO and creates no change; the later covered-call exercise sends change to the next-epoch address.
- Bitcoin/ETH balances are live reads from local nodes; a NEAR contract cannot independently verify those foreign balances at sale time. The buyer must inspect them and `0 pending requests` before paying. Once a signature is issued, sale is permanently disabled, including if broadcast later fails.
- An omitted policy delay defaults to 24 hours; the demo uses the minimum two minutes. The current web UI targets Anvil/regtest and testnet NEAR. Public Bitcoin testnet4 and Sepolia funding is [blocked](BLOCKED.md).
- SOL signs immediately due to recent-blockhash expiry. It does not inherit the ETH/BTC spending cap or delay. The contract checks only a simple SystemProgram transfer and a registered source; it does not independently prove that the registered Solana key matches the MPC derivation. The SDK checks derivation and signature. A direct caller must check the registered key before funding it.
- Guardian recovery finalization is live on NEAR testnet. An inheritance claim after a multiday deadline was unit-tested with a later NEAR block timestamp; the sandbox and testnet have not yet naturally advanced to a claim date. The on-chain sandbox rejected early and wrong-heir claims.
- The no-wallet scanner is an exposure indicator, not a complete cryptographic audit. Bitcoin histories over 500 transactions are marked incomplete. ETH positive nonce remains unknown because of EIP-7702. P2PK output balance is marked unavailable when the public Esplora indexer omits it.
- **The contract account's full-access key is classical.** `hako-contract-mw984kpp.testnet` holds one ed25519 full-access key (shown live on the app's Security page via `view_access_key_list`). Whoever holds or breaks it can redeploy the code that every vault trusts, and the contract is the MPC predecessor for every vault's Bitcoin path. It is not removed: this testnet build still needs it for upgrades and for the contract-only `set_call_config`, and deleting it is irreversible. A production deployment would lock the account (delete the key in the deploy transaction) or rotate it to a native NEP-645 ML-DSA-65 key after the code is final.
- A vault is quantum-locked only after its owner registers an ML-DSA key (`register_pq_key`, a one-time classical-key action). Until then the classical NEAR key alone controls it, and the app shows it as "Not locked".
- This prototype has not had an external security audit. It should not custody valuable funds.

## Hackathon disclosures

Built for NEAR HACKATHON 2026 (Nov 1–14).

**Prior work (Q-001–Q-004).** We treat code written before November 1, 2026 as baseline. Nick's MIT-licensed `near-qday-recovery` (renamed Phylax) already had ML-DSA-65 recovery, a TypeScript signing toolchain, and NEAR sandbox tooling in October. Its git history records the recovery contract on October 20 (`a4437ba`) and SDK/sandbox tooling that day (`88f4282`). Otzar adapts that recovery pattern and toolchain; those are prior work, not new hackathon work.

This repo's history begins on November 9, 2026 with the MIT scaffold (`1a17fb0`); it has no commits dated before November 1. Work recorded here on November 9–10 adds the NEAR vault ownership/sale and policy contract, Chain Signatures paths for BTC/ETH/SOL, guardian quorum and heir policies, exposure scanner, SDK/web/MCP clients, and covered-call auction, tUSDC payments, signed-price settlement, and regtest exercise/release. See [TESTING.md](TESTING.md) and [deployments/](deployments/). Review the implementation through the pre-submission commit with `git log --reverse 1a17fb0..494430a` and `git diff 1a17fb0 494430a`. The inherited recovery pattern remains baseline despite appearing in these commits.

Otzar was formerly Hako. The Phylax recovery, Athanatos wallet, and Tsuna covered-call concepts are folded into this one product and entry; they are not separate entries. Their names do not imply that their prior work is new Otzar work.

**AI-assisted code (Q-005).** Built with AI coding agents (Claude Code, Codex) under human direction; all code reviewed and tested by the team.

**Art.** 3D art generated with ChatGPT (the polished jade and gold objects in `packages/web/public/art/3d`; kit in [docs/ART-3D.md](docs/ART-3D.md)). The other illustrations in `packages/web/public/art` were also generated with ChatGPT ([docs/ART.md](docs/ART.md)).

**Other projects by the same team in this hackathon (Q-015)**

Lead: <TBD by Nick>

**License:** [MIT](LICENSE), © 2026 Nivesh Gajengi. This repo has no separate NOTICE file. Runtime/build libraries are declared in the package manifests, Cargo manifests, and lockfiles.

## Submission

Proposed tracks, best first: `defi`, `security`, `nfts`. Reasons and the exact form fields are in [HACKATHON_SUBMISSION_FORM.md](HACKATHON_SUBMISSION_FORM.md). Nick must fill the human fields and the Q-015 disclosure before submission. The [official rules](https://nearhackathon.com/HACKATHON.md) require a public repository by November 14, 2026 at 23:59 UTC. This local-only demo also needs a video attached to Nick's public X post. The repository must stay public through judging. This pack does not publish or submit anything.
