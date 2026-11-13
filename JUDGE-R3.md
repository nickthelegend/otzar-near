# Otzar — strict R3 self-judge (Nov 13 2026, after the quantum-safe overhaul)

Rubric weights from https://nearhackathon.com/HACKATHON.md as used in our R5 sheet: clarity 15, NEAR depth 20,
live proof 15, completeness 15, reproducibility 15, UI/demo 10, originality 10. Judged as a strict, non-crypto judge.

| Criterion | Score | Why |
| --- | ---: | --- |
| Clarity | 8.5 | The front door now says the product in one line: "A Bitcoin vault only your quantum-safe key can move, and it earns covered-call premium while it waits." The guarantee's edge sits directly under the hero, not in a fold. README's first paragraph matches. |
| NEAR depth | 9.5 | `env::ml_dsa_verify` gates every spend, rule change, call write, and now ownership (`nft_transfer`, `list`); Chain Signatures with two domains (BTC/ETH ECDSA, SOL EdDSA); BIP143 sighash computed in the contract; NEP-141 `ft_transfer_call` premiums; `ed25519_verify` for the price relayer. |
| Live proof | 8.5 | Nov 13 upgrade with verified code hash; classical-key transfer, forged ML-DSA transfer and classical-key listing refused on testnet; ML-DSA-signed listing accepted; a fresh vault minted, ML-DSA-locked and given ML-DSA-signed Bitcoin rules, then a covered call written and its premium paid from the app on camera. Bitcoin stays on regtest. |
| Completeness | 7 | Landing plus nine app screens with designed empty, loading and error states; buy, write, positions, activity, security, settings. Settlement and exercise remain CLI/relayer actions; real USDC and public Bitcoin are BLOCKED (BLOCKED.md). |
| Reproducibility | 6 | Testnet contract and a local web build; Bitcoin needs a local regtest node. No hosted URL in this repo. |
| UI / demo | 8.5 | Category structure (Aevo table + status line, Babylon order box, Lombard stat strip) in the approved jade/gold finish with the Nov 13 art; live BTC ticks, falling asks, NEAR block heartbeat, on-chain feed. Film opens on the landing and goes straight into a live call write. |
| Originality | 7.5 | A post-quantum-locked Bitcoin vault NFT that earns yield is unusual; covered calls themselves are a known category. |

Weighted: (8.5·15 + 9.5·20 + 8.5·15 + 7·15 + 6·15 + 8.5·10 + 7.5·10) / 100 = **8.03**.

Open holes, stated in README Limits and on the Security page: the contract account's ed25519 full-access key
(not removed: upgrades and `set_call_config` still need it, and removal is irreversible), Bitcoin's own ECDSA,
NEAR's MPC root key, off-chain Bitcoin collateral checks, a single trusted price relayer on testnet.
