# Verification record — 2026-11-09

Run `corepack pnpm install --frozen-lockfile && corepack pnpm test` on macOS arm64 with the toolchain listed in [README.md](README.md). Then run `scripts/demo.sh`, `scripts/demo-solana.sh`, and `node scripts/demo-recovery.mjs`. These use real local nodes and NEAR testnet; the recovery script waits for its two-minute timelock. `scripts/verify-evidence.mjs` independently re-queries the original BTC/ETH demo record.

| Check | Actual result | Source |
| --- | ---: | --- |
| Rust contract unit tests | 11 passed, 0 failed, 0 ignored (includes relayer freshness, at-expiry settlement print, and signed-message binding) | `cargo test --manifest-path packages/contract/Cargo.toml` |
| tUSDC NEP-141 unit tests | 2 passed: labelled metadata and owner mint, outsider mint rejected | `cargo test --manifest-path packages/test-usdc/Cargo.toml` |
| SDK tests, including live chain scanner reads, EdDSA derivation, live 1Click asset discovery, relayer message/signature and a live Coinbase BTC-USD read | 11 passed, 0 failed, 0 skipped | `pnpm --filter @hako/sdk test` |
| Live MCP stdio tool and testnet box read | 1 passed, 0 failed, 0 skipped | `pnpm --filter @hako/mcp test` |
| Web type check | passed; no test cases counted | `pnpm --filter @hako/web test` |
| NEAR protocol-88 sandbox transactions | 55 passed, including 21 expected on-chain rejections (Nov 13: +8 for quantum-locked transfer and listing) | [sandbox.json](deployments/sandbox.json) |
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
| Transfer or list a quantum-locked vault with the classical NEAR key only | sandbox and testnet (Nov 13), on NEAR |
| Transfer with a forged ML-DSA signature | sandbox and testnet (Nov 13), on NEAR |
| Transfer signature replayed to another receiver; listing signature for another price | sandbox, on NEAR |
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


## Real browser transactions with the QA signer

Run `pnpm install --frozen-lockfile`, then **`pnpm test:e2e`** from the repo root. This is an opt-in spending test, separate from `pnpm test`. It needs installed Google Chrome, the existing funded Otzar testnet demo accounts in `.near-credentials/`, the existing Bitcoin regtest miner wallet/ledger, and the Bitcoin Core binary installed by the demo setup. See README's judge walkthrough for that setup. It never provisions or funds an account from another project.

The test builds the SDK, checks web types, verifies a production bundle, then builds a separate QA preview. The adapter requires **both** Vite mode `qa` and `VITE_QA_SIGNER=1`. Production mode excludes it even with that flag set: the test scans every emitted JavaScript asset and its filename for `qa-signer`, `setupQaSelector`, the injection globals and signer messages. Ordinary builds continue to use Meteor.

`e2e/qa-signer.mjs` uses installed Chrome (`channel: 'chrome'`) inside the shared `withChromeLock`. The default lock module is the shared scratchpad path used for these judging runs; `CHROME_LOCK_MODULE` may point at the equivalent shared module on another machine. Web, proxy and Bitcoin RPC ports are selected from 5760–5999. The script checks swap before builds and browser launch, waits two minutes if free swap is below 500 MB, and stops its own processes.

The test reads the existing seller and buyer NEAR credentials **in Node**, injects them using `addInitScript`, and signs real testnet transactions through the same `getAccounts`, `signIn`, `signOut`, `signAndSendTransaction(s)` interface used by the app. NEAR private keys stay in Node/page memory; they are never logged, copied into source, put in browser storage, or written elsewhere. Only the public selected account is retained in session storage for reloads. The product's separately generated ML-DSA backup is downloaded into the repo's ignored `.near-credentials/` directory and uploaded through its real key-file input. No traces, HAR files or videos are recorded.

The signer rejects non-`.testnet` accounts, non-testnet receivers, RPCs outside its explicit testnet allow-list, transfers/key-management actions, excessive gas, negative amounts and deposits above 0.001 NEAR. Before each write, the Node guard checks actual balances and the cumulative 0.3 NEAR cap, including gas, added contract storage and conservatively counted internal NEAR payments. The baseline includes the earlier full-flow QA in `deployments/flow-qa-2026-11-11.json`; repeated runs cannot silently reset it. A new run stops before writes if less than 0.06 NEAR remains. Do not delete evidence to bypass that limit.

The verified browser path is connect → mint → generate/register and load the ML-DSA key → register Bitcoin rules → show a real regtest deposit → write a covered call → buyer pays the premium → receipt and buyer portfolio. It also lists/buys the existing empty QA vault NFT and verifies ownership in the portfolio. After real expiry, the existing relayer script posts a signed Coinbase print and submits settlement: these are operator actions, since the product has no browser settlement control. The owner then requests a Bitcoin withdrawal, asks NEAR MPC to sign, broadcasts it to regtest, checks the confirmed output, and signs out. No settlement price or receipt is fabricated.

Every NEAR hash is recorded in `deployments/qa-browser-YYYY-MM-DD.json` and independently queried with `wait_until: FINAL`. Each state is captured at 1440×1000 and 375×900 under the shared `scratchpad/flow-qa/hako/qa-signer/` directory. A single funded flow switches viewport between screenshots; it does not duplicate storage spending just to obtain the second size. `FLOW-QA.md` records the actual outcome and remaining limits. Human approval in **Meteor itself** remains a separate manual integration check; QA-signer approval does not claim to test Meteor's UI.

### Recorded result and resuming an interrupted run

**PASS:** run `mwcfqfc2`, completed 2026-11-11 18:43:30 UTC through `pnpm test:e2e` with `QA_RESUME_RUN=mwcfqfc2`. See [FLOW-QA.md](FLOW-QA.md) and [all 16 final receipts](deployments/qa-browser-2026-11-11.json). Fourteen transactions came from browser controls; two were relayer operator calls. The browser completed purchase/position, NFT sale/ownership, OTM unlock, withdrawal request, MPC signing and Bitcoin broadcast. Bitcoin Core confirmed the 100,000-sat regtest destination output. Total conservative spending including prior QA was 0.2784388943878851 NEAR, below 0.3.

For an **interrupted, incomplete** run, use `QA_RESUME_RUN=<id> pnpm test:e2e` with an ID from the receipt file for the current UTC date. Resume reuses saved keys and on-chain registration/funding, and skips already bought or settled rounds. It requires at least 0.02 NEAR remaining plus per-action budget checks. Completed PASS runs refuse replay before mutation because the withdrawal consumes their regtest fixture. Current remaining headroom (about 0.021561 NEAR) cannot fund a new run, whose preflight requires 0.06; that is an intentional stop, not permission to reset the evidence.

A transport timeout may happen after NEAR accepted a transaction. The QA adapter records the signed hash and polls finality across allow-listed testnet RPCs without resubmitting it. The receipt recorder queries final status independently. Stopped attempts and earlier recovered transactions remain in the evidence file; the completed flow used resumption after real RPC and overflow failures.

The pinned `@meteorwallet/sdk@1.0.24` package patch removes the access-key console print from both distributed ESM and CJS files. `e2e/check-qa-signer.mjs` checks both installed files as part of `pnpm test:e2e`, alongside native/legacy wallet actions, caps, public-account reload persistence and mainnet rejection. Its adapter checks stop at a budget hook before signing and spend zero NEAR. Production exclusion is checked with the QA flag deliberately enabled in production mode.

The final funded pass preceded test-only screenshot naming/wait improvements and the completed-run replay guard; those changes received syntax and read-only checks. There was no extra funded rerun after those changes. Authenticated pages had no JavaScript page errors, but provider CORS/rate-limit and HTTP 408/500 console errors were recovered; do not interpret PASS as zero external RPC errors.

## Judge display regression checks (2026-11-12)

Run `node e2e/check-judge-display.mjs` from the repo root. This zero-spend check needs installed workspace dependencies, no credentials or local chain nodes. It verifies duration boundaries below/exactly/above 24 hours, exclusion of demo premiums from blended APY while retaining actual earned amounts, public QA filtering and owner visibility, actual-premium demo charts/bands, and expired-round wording.

Typecheck and production/QA builds passed. Real read-only browser checks passed at 1440 and 375; screenshots, diagnostics and the unchanged-design audit are in [docs/JUDGE-R2-FIXES.md](docs/JUDGE-R2-FIXES.md). No new funded e2e run was needed for these display changes.

## R3 read-only vault checks (2026-11-12)

Executed `pnpm --filter @hako/web test` twice, two production builds (before and after, all optional RPC variables unset), `node e2e/check-local-chain-panels.mjs`, and `node e2e/check-judge-display.mjs`: **PASS**. The local-panel test compiles the actual gate under unset / Ethereum-only / Solana-only / both RPC settings and runs twelve server-render checks per invocation. Both invocations passed (24 render checks total). It makes no network request and does not claim that a local node is running.

Installed Chrome under the shared orchestration lock captured eight before and eight after states on `/vault/call-itm-mw9irlhd`: default, overview, rules and Bitcoin send, each at 1440 and 375. Console errors, page errors, failed requests and overflow: **0**. The eight NEAR-data comparisons were identical. No response was mocked, no wallet connected, no key loaded and no transaction sent. Runtime balances/broadcast against configured local nodes were not retested in this read-only brief.

The first 60 README lines contain one optional-chain note; the submission idea is 895 characters and describes Bitcoin controlled from NEAR. The dead-link grep is empty. Five unused images were moved outside Git, with their hashes recorded in `deployments/r3-2026-11-12.json`. No films or sealed deployment evidence were changed.
