# Verification record — 2026-11-09

Run `corepack pnpm install --frozen-lockfile && corepack pnpm test` on macOS arm64 with the toolchain listed in [README.md](README.md). Then run `scripts/demo.sh`, `scripts/demo-solana.sh`, and `node scripts/demo-recovery.mjs`. These use real local nodes and NEAR testnet; the recovery script waits for its two-minute timelock. `scripts/verify-evidence.mjs` independently re-queries the original BTC/ETH demo record.

| Check | Actual result | Source |
| --- | ---: | --- |
| Rust contract unit tests | 11 passed, 0 failed, 0 ignored (includes relayer freshness, at-expiry settlement print, and signed-message binding) | `cargo test --manifest-path packages/contract/Cargo.toml` |
| tUSDC NEP-141 unit tests | 2 passed: labelled metadata and owner mint, outsider mint rejected | `cargo test --manifest-path packages/test-usdc/Cargo.toml` |
| SDK tests, including live chain scanner reads, EdDSA derivation, live 1Click asset discovery, relayer message/signature and a live Coinbase BTC-USD read | 11 passed, 0 failed, 0 skipped | `pnpm --filter @hako/sdk test` |
| Live MCP stdio tool and testnet box read | 1 passed, 0 failed, 0 skipped | `pnpm --filter @hako/mcp test` |
| Web type check | passed; no test cases counted | `pnpm --filter @hako/web test` |
| NEAR protocol-88 sandbox transactions | 47 passed, including 16 expected on-chain rejections | [sandbox.json](deployments/sandbox.json) |
| Covered-call sandbox plus Bitcoin Core regtest transactions | 30 passed, including 13 expected on-chain rejections; 1 real regtest funding transaction; local tUSDC deployment, a real tUSDC premium purchase and a live Coinbase print signed by a fresh relayer key | [calls-sandbox.json](deployments/calls-sandbox.json) |
| NEAR testnet transactions in demo | 24 independently re-queried, including 10 expected on-chain rejections | [testnet-2026-11-09.json](deployments/testnet-2026-11-09.json) |
| Anvil receipts | 3 successful: funding, guardian recovery, withdrawal | `scripts/verify-evidence.mjs` |
| Bitcoin Core regtest transactions | 2 confirmed: funding, MPC-signed withdrawal | `scripts/verify-evidence.mjs` |
| Solana follow-up NEAR testnet transactions | 6 confirmed, 0 rejected | [solana-2026-11-09.json](deployments/solana-2026-11-09.json) |
| Local Solana validator | 1 funded source and 1 confirmed MPC-signed 0.1 SOL transfer | [solana-2026-11-09.json](deployments/solana-2026-11-09.json) |
| Guardian recovery NEAR testnet transactions | 8 total: 5 confirmed, 3 expected rejections | [recovery-2026-11-09.json](deployments/recovery-2026-11-09.json) |
| Earlier tested wallet wasm upgrade | 1 NEAR testnet deployment; RPC code SHA-256 matched the local wasm at the time | [upgrade-2026-11-09.json](deployments/upgrade-2026-11-09.json) |
| Earlier covered-call wasm upgrade | 1 NEAR testnet deployment; RPC code SHA-256 matched the passing build `badb2268140fb213af9056a6aa626596020353466f08e0fed41694fdc8519171` | [calls-upgrade-2026-11-09.json](deployments/calls-upgrade-2026-11-09.json) |
| **Live covered-call loop on testnet** | 22 NEAR testnet transactions: 18 confirmed, 3 expected rejections (writer spends of live collateral), 1 failed settle under the first relayer contract (kept; see README). ITM exercised: buyer received 10,000,000 regtest sats in `eb9aa599…`; OTM released: writer got 10,009,000 sats back in `2f006304…`. Premium earned 0.019547 tUSDC | [calls-live-testnet-2026-11-09-171226.json](deployments/calls-live-testnet-2026-11-09-171226.json) |
| tUSDC deployment and contract upgrades | 6 token transactions; 2 contract upgrades with RPC code SHA-256 matched (`3b425732…`, then current `0de4a9d7…`), each followed by `set_call_config` and a relayer price post | [test-usdc](deployments/test-usdc-testnet-2026-11-09.json), [relayer-upgrade](deployments/relayer-upgrade-2026-11-09.json), [settle-upgrade](deployments/settle-upgrade-2026-11-09.json) |
| Earlier covered-call testnet attempt (history) | 9 NEAR testnet transactions recorded: 8 successful and 1 rejected owner front-run spend; premium purchase not run because buyer USDC balance was zero | [calls-testnet-2026-11-09.json](deployments/calls-testnet-2026-11-09.json) |
| Mainnet 1Click quote | 1 successful `dry: true` ETH→native BTC quote, no deposit address; separate live request, not counted as a test case | [oneclick-dry-2026-11-09.json](deployments/oneclick-dry-2026-11-09.json) |
| Pyth testnet feed (history) | 1 live view returned `null`; Hermes returned HTTP 401 without an API key; replaced by the signed relayer price | [pyth-testnet-2026-11-09.json](deployments/pyth-testnet-2026-11-09.json) |

No tests were skipped. Sandbox uses a real local nearcore node, not a mocked RPC. The SDK reads the real testnet signer, public Ethereum RPC, and live Bitcoin Esplora. This machine could not reach mempool.space, so the scanner used Blockstream's real Esplora fallback. MCP testing launches the actual stdio server and reads the deployed testnet box plus public ETH exposure. The BTC/ETH demo invokes testnet MPC and broadcasts to Anvil and bitcoind; the SOL demo invokes EdDSA MPC and broadcasts to a local Solana validator. `scripts/verify-evidence.mjs` calls NEAR RPC `tx`, Anvil `eth_getTransactionReceipt`, and Bitcoin Core `getrawtransaction` for every original demo hash. The local nodes are stopped by their demo scripts.

The live 1Click quote service intermittently returned HTTP 500 timeouts during SDK verification, then a separate `node scripts/verify-oneclick.mjs` request succeeded and saved the returned amount, correlation ID, and signature. The mandatory SDK suite tests its live token list and real MPC-derived Bitcoin recipient; the separate quote command must be run to check quote availability. It never converts an error into success or a fabricated quote.

## Covered-call checks

| Requested case | Observed status |
| --- | --- |
| ML-DSA write and encumbered spend rejection | Passed on sandbox + regtest and on NEAR testnet (ITM box before sale, OTM box after sale). |
| Dutch auction price decay | Unit test passed; on testnet both buys paid the live `auction_price` between the 20% and 5% APR bounds (0.010369 and 0.009178 tUSDC). |
| Premium paid directly to writer | Passed on sandbox and testnet: the writer's tUSDC balance rose by exactly the asking premium in the same transaction's callback. |
| Wrong premium token | Sandbox: calling `ft_on_transfer` directly (not from the call's token) rejected. |
| Relayer price attacks | Sandbox: foreign key, stale (120 s old) print, unlisted source URL, and replay of the same print all rejected; the real Coinbase print signed by the relayer key accepted. |
| Settlement timing | Sandbox: settle before expiry rejected; `expire_unsettled_call` before the 24 h grace rejected. Testnet: settled with a print observed 2 s after expiry. Unit test: pre-expiry, more than 5 minutes after expiry, and future prints rejected. |
| ITM exercise and real MPC-signed regtest receipt | **Passed on testnet + regtest**: strike 7,334.80 tUSDC paid to the writer, contract checked the raw transaction (exact 0.1 BTC to the buyer's script, change to the next epoch) and MPC-signed it; Bitcoin Core confirmed it and the buyer wallet received 10,000,000 sats. |
| OTM release | **Passed on testnet + regtest**: after the OTM settlement, the same owner spend that was rejected while the call was live was accepted, MPC-signed and confirmed on regtest. |
| Exercise-window lapse | Not run: it needs 24 h after an ITM settlement. `lapse_call` is unchanged. |
| Option transfer and new-holder exercise | Not rerun in this loop; the buyer exercised directly. `option_transfer` is unchanged; full NEP-171 option conformance is pending. |

The older Pyth evidence in [pyth-testnet-2026-11-09.json](deployments/pyth-testnet-2026-11-09.json) is kept as history.

### Web QA (2026-11-09, earned block)

`vite build` passed. Headless Chrome against `vite preview` on port 5192: `/` (with the yield section and its new "It earned" block) and `/app` → `call-itm-mw9irlhd` → Earn, at 1440×900 and 390×844 (plus the full-page 375 check): horizontal overflow 0, no page errors. The block read live `call_state` for both demo calls: 0.019547 tUSDC earned, 17.4% blended annualised, ITM 18.7% / OTM 16.0%, settled at $74,821.04. One earlier run hit FastNEAR HTTP 429, which browsers report as a CORS failure. `rpcQuery` now retries that case, and the rerun was clean.

### Web QA (2026-11-10, vault-app rebuild)

`vite build` passed. Headless Chrome (playwright-core, `channel: 'chrome'`) against the Vite dev server on port 5202 with the testnet contract: `/`, `/app`, `/you`, `/vault/call-itm-mw9irlhd` and `/vault/box-mw984t1q` at 1440×900, 390×844 and 375×812, plus the round-details sheet, the Withdraw panel and the mint sheet at each width: horizontal overflow 0, no page errors. Every figure is a live read (`nft_tokens`, `call_history` per vault, `relayer_price`, `ft_balance_of`, NearBlocks v3 transactions); the recorded-run JSON only supplies transaction hashes. Console errors were FastNEAR HTTP 429s, which browsers report as CORS failures; reads now fail over to dRPC and every page rendered its data. The vault pages also log `ERR_CONNECTION_REFUSED` from the local Anvil and Solana nodes, shown in the UI as `Setup required`.

### Web QA (2026-11-10, Otzar retheme)

`vite build` passed. Headless Chrome against the dev server on port 5202: `/`, `/app`, `/you`, `/vault/call-itm-mw9irlhd` and `/vault/box-mw984t1q` at 1440×900, 390×844 and 375×812, plus the round sheet, the Withdraw panel and the mint sheet at each width: horizontal overflow 0, no page errors. The only console errors were FastNEAR 429s (reads fail over to dRPC) and the offline local Anvil/Solana nodes, which the UI labels `Setup required`. The realised-APY counter, the live tape and the highlight cards all read live contract state. Stickers render as drawn jade and gold tiles until the generated `otzar-*` art is added to `packages/web/public/art/`.

### Web QA (2026-11-10, four-colour blocking)

`vite build` passed. Same harness on port 5202: `/`, `/app`, `/you`, `/vault/call-itm-mw9irlhd` (covered-call colour) and `/vault/sol-mw9amrrr` (any-chain colour) at 1440, 390 and 375, plus the round, withdraw and mint sheets: horizontal overflow 0, no page errors. Body-text contrast was computed for every band: ink on jade 5.8:1, ink on gold 10.1:1, ink on blush 9.7:1, ivory on forest 7.1:1, and the muted tints 4.7:1 or more.

### Web QA (2026-11-10, restrained Otzar with generated art)

`vite build` passed. Same harness on port 5202 with the hero render, logo B and the vault, coins, key and hourglass stickers in place: `/`, `/app`, `/you`, `/vault/call-itm-mw9irlhd` and `/vault/sol-mw9amrrr` at 1440, 390 and 375, plus the round, withdraw and mint sheets: horizontal overflow 0, no page errors. Gold yield numbers use #a06a00 on light surfaces (4.2:1) and #f2b33d on deep forest; body text on the forest band is ivory (7.1:1) and on the soft blush band ink (15.6:1).

### Web QA (2026-11-10, simplified Otzar)

`vite build` passed. Headless Chrome (shared lock) against `vite preview` on port 5733: `/`, `/how`, `/app`, `/vault/call-itm-mw9irlhd` and `/you` at 1440×900 and 375×812: horizontal overflow 0 on every route (including the vault page with Owner tools open and a term tooltip showing), no page errors. Console errors were FastNEAR and NearBlocks HTTP 429s (reads fail over to dRPC; NearBlocks now retries twice, then shows "rate-limiting" in the activity table) and the offline local Anvil and Solana nodes, which the vault page labels `Setup required`. With `prefers-reduced-motion: reduce` the hero and count-up animations are off. Tab reaches a visible 3px focus ring on every route. Controls are 44px or taller except inline links inside sentences and the skip link. On the vault page the Deposit/Withdraw switch, the Owner tools disclosure (all six tabs: Overview, Rules, Send, Rounds, Recovery, Sell) and the term tooltips work. Every figure is a live read: `nft_tokens`, `call_history`, `relayer_price`, `ft_balance_of`, the MPC root and NearBlocks v3.

## Negative checks

| Attack or invariant | Where rejected |
| --- | --- |
| Spend before buyer installs a new policy | sandbox, on NEAR |
| Wrong ML-DSA key | sandbox and testnet, on NEAR |
| ETH or BTC amount over daily cap | sandbox ETH and testnet ETH/BTC, on NEAR |
| Seller calls spend after the sale | sandbox and testnet, on NEAR |
| Listing while a spend is pending | sandbox and testnet, on NEAR |
| Guardian diverts recovery to another destination | sandbox and testnet, on NEAR |
| Transfer during guardian recovery | sandbox, on NEAR |
| Reuse of a pending request or consumed nonce | testnet, on NEAR |
| Change to the current Bitcoin epoch address | contract unit and testnet, on NEAR |
| Resale after MPC signature issued | testnet, on NEAR |
| Old owner ML-DSA key after transfer | sandbox, on NEAR |
| Guardian collusion below configured threshold | sandbox and testnet, on NEAR |
| Guardian recovery before timelock | sandbox and testnet, on NEAR |
| Recovery replay while pending | sandbox, on NEAR |
| Wrong heir or claim before deadline | sandbox, on NEAR |
| Unregistered Solana source or tampered transfer | sandbox, on NEAR |
| Listing a vault with a pending SOL spend | sandbox, on NEAR |
| Old PQ authority after guardian rotation | testnet, on NEAR |

The sandbox also reads back the transferred box and confirms the earlier request is cancelled and its PQ key cleared. The live demo compares the on-chain Bitcoin BIP143 digest with the SDK's independent BIP143 computation, then confirms the signed transaction in Bitcoin Core. The ETH digest matches a viem EIP-1559 fixture in the Rust unit test, and Anvil accepts two MPC-signed ETH transactions.

An existing Rust test advances the NEAR block timestamp beyond an heir's deadline and delay, then confirms the claim transfers the NFT, clears the old PQ key and policy, and cancels a pending spend. A multiday positive claim on live testnet has not yet elapsed.

## Gas measured on NEAR testnet

From [the final evidence](deployments/testnet-2026-11-09.json), including transaction and receipt gas:

| Action | Gas (Tgas) |
| --- | ---: |
| Buyer ML-DSA-65 policy update | 6.78 |
| ETH request with ML-DSA and EIP-1559 hash | 7.00 (allowlisted), 6.90 (delayed) |
| ETH MPC signing and callback | 20.20 (withdrawal), 20.08 (recovery) |
| Bitcoin policy/public-key registration | 7.27 |
| Bitcoin request with ML-DSA and on-chain BIP143 | 7.58 |
| Bitcoin MPC signing and callback | 20.77 |

The SDK performs MPC epsilon derivation and verifies it against the signer view. **On-chain address derivation was not implemented**, so it has no measured gas figure. The contract checks a registered next-epoch P2WPKH script and enforces a two-minute registration delay for change instead. The web and MCP clients compare registered keys with SDK-derived keys before building a Bitcoin spend; direct callers must make that comparison themselves.

## Known verification limits

No public testnet4 or Sepolia funds were provided. The public scanner cannot prove ETH outgoing signatures from nonce alone after EIP-7702; the UI marks positive-nonce exposure unknown. Full NEP-171 approval/event conformance and post-signature Bitcoin epoch advancement remain unimplemented.

## Web browser check (2026-11-09)

Headless Chrome (playwright-core, `channel: 'chrome'`) against the Vite app with `VITE_HAKO_CONTRACT=hako-contract-mw984kpp.testnet`:

| Route | 1440×900 | 390×844 |
| --- | --- | --- |
| `/` landing | root rendered, `scrollWidth - innerWidth = 0`, no page errors | same |
| `/app` (Overview, Rules, Send, Earn, Recovery, Sell tabs) | root rendered, overflow 0 on every tab, no page errors | same |

The only console errors on `/app` are `ERR_CONNECTION_REFUSED` from the local Anvil and Solana nodes, which were not running; the UI shows them as `Setup required: VITE_ANVIL_RPC_URL` / `VITE_SOLANA_RPC_URL`. The landing proof strip read 16 vault NFTs from `nft_tokens` and the contract's recent transactions from the NearBlocks v3 API. A scanner run on a public mainnet Bitcoin address returned live Blockstream data. `vite build` passed.

## Wallet: Meteor Wallet replaces MyNearWallet (2026-11-10)

MyNearWallet's testnet pop-up now refuses every app ("MyNearWallet can't connect to apps anymore … no longer accepts new app connections"), so the old **Connect** dead-ended. The web app now uses `@near-wallet-selector/core` 10.1.4 with `@near-wallet-selector/meteor-wallet` 10.1.4; MyNearWallet is removed. `pnpm-workspace.yaml` gives the wallet packages their own near-api-js 6.2.5 (Meteor's SDK peer) and `@near-js/utils` 2.5.1 (the `@near-js` 2.x peer); `packages/web` keeps near-api-js 5.0.0.

Checked against `vite build && vite preview` in headless Chrome at 1440×900 and 375×812:

- `/app` → **Connect** opens a pop-up at `https://wallet.meteorwallet.app/connect/testnet/login?…`. The request the app posts into it reads `actionType: login`, `network: testnet`, `contract_id: hako-contract-mw984kpp.testnet`, `type: ALL_METHODS` with a fresh public key.
- Closing the pop-up shows the banner "The wallet closed before you signed in." With pop-ups blocked (`window.open` returning null) it reads "Your browser blocked the wallet window. Allow pop-ups for this site, then try again."
- 0 console errors, no horizontal overflow at 375. The portfolio's connect card says it connects with Meteor Wallet.

Not done: a full Meteor sign-in and approval. Meteor's site sits behind Cloudflare, which shows headless Chrome "Sorry, you have been blocked", and signing in needs a person with a Meteor testnet account.

