# Otzar UI judge (v3 overhaul, Nov 13 2026)

Strict pass, scored against the captured category leaders (Aevo strategies table and status line, Babylon staking
stats and order box, Lombard landing with its live stat strip) and the Dribbble picks logged in
`design-references/picks/otzar-near-v3.md` (LendFlow KPI strip + activity column; DeFi mobile strategy cards and
floating tab bar). Every number on every screen is a live read: Coinbase BTC-USD, NEAR testnet RPC, NearBlocks.
Screenshots: `orchestration/shots/otzar-v3/r1` (first pass) and `r2` (after fixes), 1440 and 390 for every route.

| Screen | Route | Pass 1 | Problems found | Pass 2 |
| --- | --- | --- | --- | --- |
| Landing | `/` | 8.5 | Quantum-step list broke into a one-word column (text node in a grid). | 9 |
| Vaults | `/app` | 8.5 | — (Aevo table, KPI strip, live feed column, ML-DSA badge per row). | 8.5 |
| Vault detail | `/vault/<id>` | 7.5 | Round sentence at 28 px dominated the card; strike tags overlapped price ticks; on phones the side panels came before the chart. | 8.5 |
| Buy calls | `/market` | 8 | Recent fills listed a QA vault. | 8.5 |
| Write call | `/write` | 8 | Only verifiable connected (QA signer); disconnected state is a clean art prompt. | 8.5 |
| Positions | `/positions` | 8 | Disconnected prompt only without a wallet; connected tabs verified in the film run. | 8.5 |
| Activity | `/activity` | 8.5 | — | 8.5 |
| Quantum security | `/security` | 9 | "audited upgrade" wording implied an audit; changed to "verified". | 9 |
| Settings | `/settings` | 8 | — | 8 |
| How it works | `/how` | 7.5 | Older layout kept (approved earlier); new nav and footer. | 7.5 |

Phone (390): zero horizontal overflow on all eleven routes; floating five-tab bar (Vaults, Buy, Write, Positions,
Security); tables collapse into labelled cards. Console noise in pass 1 was FastNEAR HTTP 429 during the
burst of per-vault `call_history` reads (the app fails over to dRPC and still renders); the burst was reduced.
