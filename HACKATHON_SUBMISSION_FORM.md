# NEAR HACKATHON submission draft

Source: [HACKATHON.md](https://nearhackathon.com/HACKATHON.md), “What the human decides.” This file is a review aid, not a submitted application. Human fields are deliberately left for Nick.

| Field | Draft value |
| --- | --- |
| Project name | TBD by Nick (suggested name: Hako) |
| Team lead's name | TBD by Nick |
| Contact email | TBD by Nick |
| Team size | TBD by Nick (`1`, `2 - 4`, `4 - 6`, `6 - 8`, or `8+`) |
| Tracks | TBD by Nick; recommended `defi`, `nfts`, `security` |
| NEAR mainnet payout account | TBD by Nick |
| Public repository URL | TBD by Nick |
| Public demo post URL | TBD by Nick |
| Consent | TBD by Nick. Notice: “I agree that the organizers may use these details to review our submission and contact us about this hackathon.” |

## What they built (20–2000 characters; draft for Nick to approve)

Hako is a native-BTC vault wallet controlled by ML-DSA-65 authorization on NEAR. Exposed classical public keys face quantum risk, and Bitcoin script cannot enforce its vault rules. Hako derives one-time Bitcoin addresses through NEAR Chain Signatures, with guardian recovery and inheritance on NEAR. The new DeFi flow lets an owner write a covered call on a Bitcoin box: a buyer pays a testnet USDC premium in a Dutch auction, and the contract blocks owner BTC spends while the call is active. The Earn panel reads live call state and shows a 1Click `dry: true` any-chain-to-BTC quote. Bitcoin collateral is independently checked by the demo but not proven to NEAR. Pyth testnet BTC/USD settlement and ITM BTC delivery remain blocked until a fresh signed oracle update is available. Foreign signatures and the MPC root remain classical. This is a testnet/local-chain prototype, not a mainnet custody claim.

Nick must review the exact application payload and explicitly confirm it before one submission. The repository must be public by 2026-11-14 23:59 UTC. Nick posts the demo with @NEARProtocol and #NEARHackathon. Phylax, Athanatos, and Tsuna are folded into Hako and are not separate entries. If Nick submits another independent project, each README must disclose the other (Q-015).
