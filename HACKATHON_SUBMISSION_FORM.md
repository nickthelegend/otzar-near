# NEAR HACKATHON submission pack — Otzar

Draft only. Field names and constraints follow the [official form and submission contract](https://nearhackathon.com/HACKATHON.md), checked November 11, 2026. Nick reviews the values before submitting once. Deadline: November 14, 2026 at 23:59 UTC.

| Field | Draft value / rule |
| --- | --- |
| projectName | Otzar (5 characters; allowed: 2–80) |
| leadName | TBD Nick (2–80 characters) |
| email | TBD Nick (valid email, max 160 characters; max 2 submissions per email, for independent disclosed projects) |
| size | TBD Nick: one of `1`, `2 - 4`, `4 - 6`, `6 - 8`, `8+` |
| tracks | Proposed, best first: `defi` — covered-call auctions, premium payments, settlement, and Bitcoin exercise.<br>`security` — ML-DSA authorization, spending policies, delays, and guardian recovery.<br>`nfts` — the vault NFT owns the policy-controlled cross-chain addresses and transfers control; interoperability is incomplete. |
| nearAddress | TBD Nick: NEAR MAINNET payout account (2–64 characters; lowercase NEAR account syntax). Do not use the testnet contract account. |
| projectUrl | TBD: public GitHub repo URL after push (HTTP(S), max 300 characters; each repo can be submitted only once) |
| demoUrl | TBD: the public X post URL (HTTP(S), max 300 characters) |
| idea | Bitcoin holders need spending limits and recovery rules as well as a way to earn option premiums. Otzar is a vault wallet that checks ML-DSA-65 owner authorization and vault policies on NEAR before requesting Chain Signatures for Bitcoin, Ethereum, or Solana. Its covered-call flow auctions a premium in a no-value testnet token, blocks owner Bitcoin spends while the call is active, and settles against a signed price from a trusted relayer. Recorded runs on NEAR testnet and Bitcoin Core regtest show premium payment, in-the-money exercise to the buyer, and out-of-the-money collateral release. The vault NFT carries ownership and recovery policies, but NFT interoperability is incomplete. Bitcoin collateral is checked off-chain, not proven to NEAR. Foreign-chain signatures and MPC root keys remain classical. This is a testnet/local-chain prototype; 1Click deposits and compounding are dry quotes only. |
| consent | Nick ticks after agreeing verbatim: “I agree that the organizers may use these details to review our submission and contact us about this hackathon.” Submit as boolean `true` only after agreement. |

Idea character count: **907** (plain text in the `idea` cell; allowed: 20–2000).

The form fields above exclude the API-only `requestId`. If using the API, generate that UUID once at submission time and reuse it on retries. Do not commit the final payload containing personal data. Nick must confirm the complete payload before it is sent; this document does not send it. A correction to an existing submission goes through the organizers' request-changes process, not a second submission.

## X post draft

The human posts this text with the video attached. The local-only demo requires a video under Q-012.

```text
bitcoin vault rules + covered-call premiums, checked on NEAR. Otzar was built at NEAR HACKATHON: testnet payments and settlement, Bitcoin delivery on regtest. @NEARProtocol #NEARHackathon
```

Post character count: **187** (limit: 280; attachment note excluded).

attach: video TBD

Neither `/Volumes/Extreme SSD/Projects/grokbot/videos/hako-near/` nor `/Volumes/Extreme SSD/Projects/grokbot/videos/otzar-near/` exists at this check. Add the video before publishing and replace `demoUrl` with the resulting X post URL. Nick must also fill the other-project disclosure in [README.md](README.md#hackathon-disclosures).
