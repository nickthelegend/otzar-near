# NEAR HACKATHON submission draft

Source: [HACKATHON.md](https://nearhackathon.com/HACKATHON.md), “What the human decides.” This file is a review aid, not a submitted application. Human fields are deliberately left for Nick.

| Field | Draft value |
| --- | --- |
| Project name | TBD by Nick (suggested name: Hako) |
| Team lead's name | TBD by Nick |
| Contact email | TBD by Nick |
| Team size | TBD by Nick (`1`, `2 - 4`, `4 - 6`, `6 - 8`, or `8+`) |
| Tracks | TBD by Nick; recommended `nfts`, `security`, `open` |
| NEAR mainnet payout account | TBD by Nick |
| Public repository URL | TBD by Nick |
| Public demo post URL | TBD by Nick |
| Consent | TBD by Nick. Notice: “I agree that the organizers may use these details to review our submission and contact us about this hackathon.” |

## What they built (20–2000 characters; draft for Nick to approve)

Hako makes a NEAR NFT the owner of Bitcoin and Ethereum addresses derived from NEAR Chain Signatures. A funded box can be sold atomically on NEAR without moving its BTC or ETH at sale time. The testnet contract enforces an ML-DSA-65 signature, per-asset daily cap, allowlist, withdrawal delay, and guardian recovery before asking the MPC network to sign a transaction. A buyer must register a new post-quantum key and vault policy. The reproducible demo funds the addresses on Bitcoin Core regtest and Anvil, transfers the NFT on NEAR testnet, rejects attack spends on-chain, and broadcasts MPC-signed withdrawals to both local chains. It is a testnet/local-chain prototype, with no mainnet custody claim.

Nick must review the exact application payload and explicitly confirm it before one submission. The repository must be public by 2026-11-14 23:59 UTC. Nick posts the demo with @NEARProtocol and #NEARHackathon. If Nick submits another independent project, each README must disclose the other (Q-015).
