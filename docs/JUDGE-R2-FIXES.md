# Otzar judging round 2 fixes — 2026-11-12

Read `orchestration/RULES.md` and the Otzar section of `research/near/JUDGING-R2.md`. These are functional data/copy fixes in the approved design. No CSS, fonts, colors, layout rules or art changed. No contract deployment or transaction was needed.

## Result

- **PASS:** `qa-` vaults are omitted from the public landing/catalog, counts, premium chart, aggregate yield and How example. Their direct `/vault/<id>` routes still resolve. Connected owners retain QA vaults and positions under Yours / Portfolio. The filter does not imply on-chain privacy.
- **PASS:** every round shorter than 86,400 seconds is labelled `Demo round (<minutes> min)` rather than an annualised percentage. Summaries show a demo label and a dash when no day-long paid rounds qualify. Actual premiums remain visible. Demo rounds contribute no numerator or denominator to blended APY. Mixed histories annualise eligible day-long rounds only.
- **PASS:** charts containing demo rounds plot actual tUSDC premiums; demo auction bands show actual token prices. Drawers, individual round rows, owner controls and private portfolios follow the same duration rule.
- **FIXED:** expired sold rounds say awaiting settlement in the status and sentence. They no longer say running.
- **FIXED:** How explains that settlement needs a signed trade from the first five minutes after expiry. This is distinct from the live-feed freshness check.
- **FIXED:** README leads with the Bitcoin call → premium → NEAR signature moment, distinguishes read-only setup from optional chain nodes, and calls Phylax earlier October work rather than pre-hackathon work. The conservative baseline disclosure remains.

## Verification

`pnpm --filter @hako/web test` and production / flagged-QA builds pass. A production-mode build with `VITE_QA_SIGNER=1` still contains no QA module filename, injection global or signer marker.

`node e2e/check-judge-display.mjs` passes without a browser, credentials or transactions. It checks the 24-hour boundary, demo exclusion from a mixed blended rate, retained premiums, public/private catalog visibility, demo chart and auction amounts, and expired-round copy. Clock-boundary fixtures are explicitly synthetic unit inputs derived from a recorded real call; no app network response was mocked.

Installed headless Chrome, under the required orchestration lock, captured **13 states at two widths: 26 before and 26 after**. All reads came from real NEAR testnet. The QA signer was used for read-only owner views; its signing hooks reject every transaction. After-state results: **zero page errors, console errors, failed requests, raw undefined/NaN values or horizontal overflow**. This is the result of this run, not a promise that public RPCs never rate-limit. Core read-only screens intentionally show named setup gates for optional local nodes.

Machine free memory was checked before builds / browsers and stayed above the 30% launch gate. One app preview server on free port 5771 and one browser at a time. Every process started for these checks was stopped. Nothing pushed.

Before/after screenshot attachments (exact 1440×1000 and 375×900 viewports; files remain outside Git):

| State | Before 1440 / 375 | After 1440 / 375 |
| --- | --- | --- |
| Landing | [1440](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/before/1440-landing.png>) / [375](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/before/375-landing.png>) | [1440](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/after/1440-landing.png>) / [375](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/after/375-landing.png>) |
| Earning catalog and chart | [1440](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/before/1440-earning.png>) / [375](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/before/375-earning.png>) | [1440](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/after/1440-earning.png>) / [375](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/after/375-earning.png>) |
| All public vaults | [1440](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/before/1440-all.png>) / [375](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/before/375-all.png>) | [1440](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/after/1440-all.png>) / [375](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/after/375-all.png>) |
| Direct QA vault URL | [1440](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/before/1440-qa-direct.png>) / [375](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/before/375-qa-direct.png>) | [1440](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/after/1440-qa-direct.png>) / [375](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/after/375-qa-direct.png>) |
| QA round drawer | [1440](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/before/1440-qa-round-drawer.png>) / [375](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/before/375-qa-round-drawer.png>) | [1440](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/after/1440-qa-round-drawer.png>) / [375](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/after/375-qa-round-drawer.png>) |
| Public completed vault | [1440](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/before/1440-public-vault.png>) / [375](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/before/375-public-vault.png>) | [1440](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/after/1440-public-vault.png>) / [375](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/after/375-public-vault.png>) |
| Public round drawer | [1440](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/before/1440-public-round-drawer.png>) / [375](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/before/375-public-round-drawer.png>) | [1440](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/after/1440-public-round-drawer.png>) / [375](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/after/375-public-round-drawer.png>) |
| Expired sold round | [1440](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/before/1440-expired-sold.png>) / [375](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/before/375-expired-sold.png>) | [1440](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/after/1440-expired-sold.png>) / [375](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/after/375-expired-sold.png>) |
| How it works | [1440](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/before/1440-how.png>) / [375](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/before/375-how.png>) | [1440](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/after/1440-how.png>) / [375](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/after/375-how.png>) |
| NEAR settlement rules | [1440](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/before/1440-near-rules.png>) / [375](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/before/375-near-rules.png>) | [1440](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/after/1440-near-rules.png>) / [375](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/after/375-near-rules.png>) |
| APY FAQ | [1440](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/before/1440-apy-faq.png>) / [375](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/before/375-apy-faq.png>) | [1440](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/after/1440-apy-faq.png>) / [375](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/after/375-apy-faq.png>) |
| Connected owner portfolio | [1440](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/before/1440-owner-portfolio.png>) / [375](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/before/375-owner-portfolio.png>) | [1440](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/after/1440-owner-portfolio.png>) / [375](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/after/375-owner-portfolio.png>) |
| Owner round controls | [1440](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/before/1440-owner-rounds.png>) / [375](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/before/375-owner-rounds.png>) | [1440](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/after/1440-owner-rounds.png>) / [375](</Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/hako/r2/after/375-owner-rounds.png>) |

Machine-readable diagnostics: `orchestration/shots/hako/r2/{before,after}/metrics.json`. The capture helper is beside them. Public snapshots showed one QA entry in Earning and two in All before; both public lists now show zero. The owner portfolio still has both QA vaults.

## Art and remaining boundaries

These five unused files remain untracked and untouched; none was added to `.gitignore`:

- `packages/web/public/art/otzar2-card-anychain.webp`
- `packages/web/public/art/otzar2-card-call.webp`
- `packages/web/public/art/otzar2-card-qsafe.webp`
- `packages/web/public/art/otzar2-cta.webp`
- `packages/web/public/art/otzar2-security.webp`

A public Bitcoin testnet4 exercise is the M-effort R2 item and still needs funded testnet4 UTXOs. No mainnet or other project's account was used. Human Meteor approval and publication/lead fields remain the existing manual items. The in-progress film cut contains pre-fix UI footage and must be refreshed before being represented as the current app; its already final transaction receipts should be reused, not resubmitted.
