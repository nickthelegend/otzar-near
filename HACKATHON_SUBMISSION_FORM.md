# NEAR HACKATHON submission pack — Otzar

Draft only. Field names and constraints follow the [official form and submission contract](https://nearhackathon.com/HACKATHON.md), checked November 11, 2026. Nick reviews the values before submitting once. Deadline: November 14, 2026 at 23:59 UTC.

| Field | Draft value / rule |
| --- | --- |
| projectName | Otzar (5 characters; allowed: 2–80) |
| leadName | TBD Nick (2–80 characters) |
| email | TBD Nick (valid email, max 160 characters; max 2 submissions per email, for independent disclosed projects) |
| size | TBD Nick: one of `1`, `2 - 4`, `4 - 6`, `6 - 8`, `8+` |
| tracks | Proposed, best first: `defi` — covered-call auctions, premium payments, settlement, and Bitcoin exercise.<br>`security` — ML-DSA-65 verified on chain for every spend, transfer, listing and rule change; spending policies, delays, and guardian recovery.<br>`nfts` — the vault NFT owns the policy-controlled cross-chain addresses and transfers control; interoperability is incomplete. |
| nearAddress | TBD Nick: NEAR MAINNET payout account (2–64 characters; lowercase NEAR account syntax). Do not use the testnet contract account. |
| projectUrl | TBD: public GitHub repo URL after push (HTTP(S), max 300 characters; each repo can be submitted only once) |
| demoUrl | TBD: the public X post URL (HTTP(S), max 300 characters) |
| idea | Otzar makes Bitcoin quantum-safe and lets it earn, on NEAR. Real Bitcoin testnet coins cross to NEAR through the live Omni BTC connector: a deposit address derived for the user's account, a Bitcoin light-client proof (verify_deposit_v2), and nBTC minted on NEAR. The owner locks that nBTC into an Otzar vault, an NFT whose authority key is ML-DSA-65 (NIST FIPS 204, post-quantum). The Otzar contract verifies that signature on chain with env::ml_dsa_verify before the coins can leave, before the vault can be transferred or listed, and before any covered call is written. The vault earns by selling covered calls on the locked BTC: a buyer pays a premium on NEAR, straight to the owner, and the app shows the APY from that real payment. A forged quantum signature is refused on chain. Bitcoin's own signatures, the bridge's MPC key and NEAR account keys are still classical; premiums are paid in tUSDC, a no-value test token. Everything runs live on NEAR testnet and Bitcoin testnet3. |
| consent | Nick ticks after agreeing verbatim: “I agree that the organizers may use these details to review our submission and contact us about this hackathon.” Submit as boolean `true` only after agreement. |

Idea character count: **984** (plain text in the `idea` cell; allowed: 20–2000).

The form fields above exclude the API-only `requestId`. If using the API, generate that UUID once at submission time and reuse it on retries. Do not commit the final payload containing personal data. Nick must confirm the complete payload before it is sent; this document does not send it. A correction to an existing submission goes through the organizers' request-changes process, not a second submission.

## X post draft

The human posts this text with the video attached. The local-only demo requires a video under Q-012.

```text
real testnet bitcoin bridged to NEAR, locked in a vault only a post-quantum key can open, earning covered-call premium. a forged signature, refused on chain. Otzar, built at NEAR HACKATHON @NEARProtocol #NEARHackathon
```

Post character count: **217** (limit: 280; attachment note excluded).

attach: otzar-near-film-share.mp4

The 1280×720 share video is ready at the path above. The 1920×1080 master is beside it as `otzar-near-film.mp4`; the film's live transactions and judge notes are in `videos/otzar-near/film-v3/` (JUDGE-v*.md). Attach the video when publishing and replace `demoUrl` with the resulting X post URL. Nick must also fill the other-project disclosure in [README.md](README.md#hackathon-disclosures).
