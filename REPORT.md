# Otzar follow-up 3 report: "it earned" (2026-11-09)

## What works live

- Otzar's earlier BTC, ETH and SOL vault, ML-DSA guardian recovery, inheritance, scanner, wallet and MCP flows are unchanged. Their testnet hashes and local-chain receipts remain in [README.md](README.md) and `deployments/`; the original 47-transaction sandbox suite was rerun on the new contract and passed.
- **Premium token:** tUSDC is a labelled, no-value NEP-141 at [`husdc-3177b477.testnet`](https://testnet.nearblocks.io/address/husdc-3177b477.testnet), with source in `packages/test-usdc`. The buyer was minted 1,000,000 tUSDC. Calls now fix their premium token at write time; the contract-only `set_call_config` points new calls at tUSDC.
- **Price:** a signed relayer price replaces the dead Pyth read.
  - The relayer is `scripts/price-relayer.mjs`: it signs the last Coinbase BTC-USD trade (price, trade time, source URL) with an ed25519 key.
  - The contract verifies the signature, an allow-listed source, 60 s freshness and monotonic time for `post_relayer_price`.
  - For `settle_call` it requires a signed print observed in the first five minutes after expiry.
  - It is labelled "relayer price (testnet)". The mainnet design note points at Rhea `priceoracle.near`, whose BTC price read `null` on Nov 9.
- **Full loop on NEAR testnet with Bitcoin Core regtest** ([record](deployments/calls-live-testnet-2026-11-09-171226.json)). Strikes were set from the real $74,845.82 spot; settlement used the $74,821.04 print taken 2 s after expiry.
  - **ITM call** (strike $73,348):
    - [written](https://testnet.nearblocks.io/txns/2fUWxgkMiXCakivEEjjgXa13HfamxavMR7RAfESGYZAK);
    - [writer spend rejected](https://testnet.nearblocks.io/txns/A2FQof1ircJejob64sUrRHejyyhAPszGg4S4VDzcMTMN);
    - [bought for 0.010369 tUSDC](https://testnet.nearblocks.io/txns/LEHEvVvX9fSEY8u5ZU1adrXcSrvVdYXydJnkKJpBtbe);
    - [settled ITM](https://testnet.nearblocks.io/txns/71gsnoXgkW34ByRqNwwvNuUfikxh8aofGaAPixprnnyq);
    - [strike 7,334.80 tUSDC paid](https://testnet.nearblocks.io/txns/8ZKeBrXMYe6eSdenyoyXttwrTw9bw6XBPkT9aJeZ68KV);
    - [MPC-signed exercise](https://testnet.nearblocks.io/txns/EXAL6x2FCgETk2YoHqGqrxVL6aFhv1cLmjm8X5ccH8w2);
    - the buyer received 0.1 regtest BTC in `eb9aa599cde89f606e4144cfa9c193c6ff618e16307c6e904e37ae543249f1b1`.
  - **OTM call** (strike $77,092):
    - [bought for 0.009178 tUSDC](https://testnet.nearblocks.io/txns/GHbcAGgtbJ4c1opJXJeMx539TgSYcPioKTtNvsU4KWV9);
    - [settled OTM](https://testnet.nearblocks.io/txns/DoRKjEpsLwGhqnYdrnnWqAkeQKGh8p5S5D7QEjCpCzXq);
    - the same owner spend that was rejected while sold was [accepted](https://testnet.nearblocks.io/txns/AuGzmi72Evhn5He9gnRJ65GG6zkQp2Jg86T2yib2ZvgD) and [MPC-signed](https://testnet.nearblocks.io/txns/9neZbTr3ccK8VkKToqcC32G7y9N28evWDPtAR2yri4DE);
    - the collateral returned to the writer in `2f0063042853f33e33d2ae1ee4e8a15015d14931c15e487939876493ca7516fe`.
  - **Earned:** 0.019547 tUSDC premium. That is 17.37% annualised on strike notional (ITM 18.73%, OTM 16.04%) over four-minute tenors from a 20%→5% APR auction. These are demo terms, not an options-model price.
- **What broke and how it was handled (kept in the record):**
  - FastNEAR HTTP 429 delayed the first settle beyond the first contract's 60 s rule, and it was [rejected](https://testnet.nearblocks.io/txns/65JCAniykkbS1wXhrF6rSmWyXpwbJPk8YH9hntj8wAhv).
  - The contract was [upgraded](https://testnet.nearblocks.io/txns/B2xv656hbBdzHPXpYNyD35nWqqogTdhDtELbBbn2hW9w) to verify the signed at-expiry print in `settle_call`, with a 24 h grace and an `expire_unsettled_call` escape. Code SHA-256 `0de4a9d73a61572a001b1b9bc1aae2c7ec89f9a91fd8c9c386edff2673403897` was verified over RPC.
  - Both calls were then settled with the print posted at expiry in [ESEEWV…](https://testnet.nearblocks.io/txns/ESEEWVhwoH85JDvWGHCQ62VHkHT1enBQqnyfZSCkivsq), read back from chain.
  - Two transactions (strike, exercise) landed while the RPC returned HTTP 500. Their hashes were recovered from NearBlocks after the script checked state and balances.
- **Web:** the landing yield section has an "It earned" block. The Earn tab reads the call's token and the relayer price. Both read every number live from the contract. QA: `vite build` passed; at 1440 and 390 there was no overflow and no page errors.

## Verification counts

- Rust: **11** contract unit tests and **2** tUSDC unit tests.
- SDK: **11** tests (live signer, scanner, 1Click, Coinbase).
- MCP: **1** test.
- Web: type check and production build.
- NEAR sandbox: **47** original transactions (16 rejections) and **30** covered-call transactions (13 rejections, including relayer and premium-token attacks).
- Testnet live loop: **22** transactions (18 confirmed, 3 expected rejections, 1 failed settle explained above), plus 5 tUSDC setup transactions and 2 verified upgrades. 0 skipped.

## Testnet NEAR spent

- 2 NEAR from `hako-seller-mw984kqa.testnet` to create the tUSDC account, plus storage deposits of about 0.004 NEAR.
- Gas for every transaction, paid by the Otzar accounts that signed them.
- No other funders were used. hako-seller and hako-guardian stay above 2 NEAR.

## BLOCKED / needs mainnet

- **Mainnet oracle:** Rhea `priceoracle.near` returned `null` BTC prices on Nov 9, so a mainnet price source still needs verifying.
- **Real USDC and mainnet deployment review.**
- **Multi-signer price relayer** for production.
- **`NEAR_MAINNET_ACCOUNT`** for the 1Click auto-compound and any-chain deposits (dry quotes only today).
- **Public Bitcoin testnet4 funding**, via `BITCOIN_TESTNET4_FUNDED_ADDRESS`.
- **Untested here:**
  - the exercise-window lapse (needs 24 h);
  - option transfer before exercise;
  - full NEP-171 options;
  - contract-proven Bitcoin collateral.

See [BLOCKED.md](BLOCKED.md). Nick must publish this local-only repository and supply the human submission fields. Nothing was pushed.

## Exact demo commands

```sh
corepack pnpm install --frozen-lockfile && corepack pnpm test
node scripts/deploy-test-usdc.mjs        # once: tUSDC + buyer balance + relayer key
node scripts/setup-relayer-testnet.mjs   # upgrade + verify code hash + config + one price
scripts/demo-calls.sh                    # full ITM + OTM loop with Bitcoin Core regtest
node scripts/export-web-evidence.mjs     # point the web "It earned" block at the newest run
```
