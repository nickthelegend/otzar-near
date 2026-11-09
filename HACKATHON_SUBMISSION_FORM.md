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

Hako is a BTC, ETH, and SOL vault wallet represented by a NEAR NFT. The problem is that exposed classical public keys become quantum targets, while foreign-chain scripts cannot enforce the vault's recovery or inheritance policy. A no-wallet scanner reads public Bitcoin and Ethereum chain data to show exposure and balance. On NEAR testnet, ML-DSA-65 authorizes vault changes and spends; M-of-N ML-DSA guardians can rotate a lost authority key after a timelock; an heir can claim the NFT after a dead-man delay. NEAR Chain Signatures signs Bitcoin and Ethereum on local regtest/Anvil and Ed25519 SOL on a local Solana validator. The demo shows on-chain attack rejections and confirmed foreign-chain transactions. Foreign signatures and the MPC root remain classical. This is a testnet/local-chain prototype, not a mainnet custody claim.

Nick must review the exact application payload and explicitly confirm it before one submission. The repository must be public by 2026-11-14 23:59 UTC. Nick posts the demo with @NEARProtocol and #NEARHackathon. Phylax and Athanatos are folded into Hako and are not separate entries. If Nick submits another independent project, each README must disclose the other (Q-015).
