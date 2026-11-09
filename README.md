# Hako (箱)

Hako is a NEAR testnet NFT whose owner controls a Bitcoin regtest P2WPKH address and an Ethereum Anvil address. The NEAR contract holds the ownership, sale, spending rules, and authorization state. NEAR Chain Signatures supplies real secp256k1 signatures for the foreign chains. A buyer can acquire a funded box on NEAR without a Bitcoin or Ethereum transfer at sale time.

The problem: selling a funded wallet normally requires moving its coins or trusting the seller; Bitcoin script cannot enforce a daily cap, delay, and guardian recovery on these outputs; and classical public keys become visible when used. Hako applies those rules before its MPC signer can sign. It requires ML-DSA-65 authorization for every ordinary spend and policy change.

This is a **testnet and local-chain prototype**, not a mainnet vault. The NFT implements NEP-171 ownership and enumeration views used here; approval, metadata events, and full marketplace interoperability are not implemented. See [Limits](#limits-and-security-boundaries).

## Judge walkthrough

On macOS arm64 with Node 22+, pnpm 10.22, Rust 1.95, cargo-near 0.22, Foundry Anvil, and curl installed:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm test
scripts/demo.sh
```

`pnpm test` builds the four packages, runs unit and live signer/MCP checks, then starts and stops a real NEAR sandbox. `scripts/demo.sh` starts and stops Bitcoin Core regtest and Anvil, deploys to NEAR testnet, mints and funds a box, sells it, registers the buyer's ML-DSA key and policy, rejects attack spends, handles a delayed request through guardian recovery, then broadcasts clean MPC-signed Bitcoin and Ethereum withdrawals. It downloads verified Bitcoin Core 31.2 into ignored `.tools/` if absent. The NEAR testnet helper creates demo accounts and writes keys only to ignored `.near-credentials/`.

Do `scripts/demo.sh` → see a new `deployments/testnet-YYYY-MM-DD.json` with NEAR transaction links and local-chain transaction IDs. Do `pnpm web` after creating `packages/web/.env.local` from `.env.example` → see live boxes, addresses, balances, vault rules, pending countdowns, signing and sale controls at `http://127.0.0.1:5173`. The Bitcoin balance and broadcast controls need the local proxy: `node scripts/bitcoin-proxy.mjs`, with `VITE_BITCOIN_ESPLORA_URL=http://127.0.0.1:3007` in the web env file. The proxy reads the real Bitcoin Core regtest node; it is not a fixture service.

The web wallet uses MyNearWallet on testnet. The demo's generated NEAR accounts are for the CLI flow; browser actions require a testnet wallet you control. If a setting is missing, the interface reports `Setup required: <VAR>`.

## Architecture and NEAR features

| Package | Purpose |
| --- | --- |
| `packages/contract` | Rust contract: NFT ownership and enumeration, atomic NEAR-denominated sale, EIP-1559 and BIP143 parsing/hashing, daily caps, delay/allowlist, guardian recovery, ML-DSA verification, MPC calls. |
| `packages/sdk` | Exact MPC epsilon derivation from the signer root, BTC/ETH address and transaction assembly, ML-DSA signing, live RPC helpers. |
| `packages/web` | Responsive box gallery and detail, wallet actions, live BTC/ETH state and pending requests. |
| `packages/mcp` | stdio tools `box_info`, `request_spend`, `list_box`; writes call the same contract checks as the UI. |

NEAR features used: **Chain Signatures** to sign real Bitcoin and Ethereum transactions; **NEP-171 core ownership/enumeration methods** for the box; NEAR testnet transactions for sale and vault policy; **`env::ml_dsa_verify`** for post-quantum authorization. Intents, Chain Signatures on mainnet, sub-accounts, NEP-141/245, meta transactions, OutLayer TEE, and Sputnik DAO are not used. NEAR Intents has no testnet; Hako does not claim a live Intents integration.

The MPC testnet signer is `v1.signer-prod.testnet`. Each box uses `hako/<token_id>/<epoch>` as its path. The SDK computes SHA3-256 epsilon according to the [NEAR MPC implementation](https://github.com/near/mpc/blob/main/crates/near-mpc-crypto-types/src/kdf.rs) and verifies the derived key against the signer's `derived_public_key` view. The contract sends `sign` a `payload_v2.Ecdsa` 32-byte digest, `path`, and `domain_id: 0` with one yoctoNEAR. The [NEAR Chain Signatures documentation](https://docs.near.org/chain-abstraction/chain-signatures/implementation) describes the network and signer; the [MPC repository](https://github.com/near/mpc) describes the request schema.

For Ethereum the contract accepts only simple unsigned EIP-1559 type-2 transfers on chain ID 31337 or 11155111 and hashes their typed bytes with Keccak-256. For Bitcoin it accepts one-input, one- or two-output, unsigned P2WPKH transfers and computes BIP143 SIGHASH_ALL itself. The caller never supplies the MPC payload. Bitcoin change must match the registered next-epoch script and wait two minutes after registration; the current-epoch script cannot receive change. Sale and transfer are blocked after any MPC signature is issued, preventing a seller from signing a withdrawal and then selling the still-funded NFT. A buyer must register their own ML-DSA key and policy after sale; the seller's guardian/recovery policy and Bitcoin registration are cleared.

## Deployment and evidence

The complete machine-readable record is [deployments/testnet-2026-11-09.json](deployments/testnet-2026-11-09.json). The table below is filled from the final demo run. Every NEAR link is a testnet transaction; Bitcoin IDs are for local regtest and Ethereum IDs are for local Anvil.

Contract: `hako-contract-mw984kpp.testnet`. Demo box: `box-mw99g8nx`.

| Action | Result | NEAR testnet transaction | Gas (Tgas) |
| --- | --- | --- | ---: |
| upgrade hako | Confirmed | [HtVgZSMejybL7VAQGTBWisrjBdttuV11u7sbKf8TiNPm](https://testnet.nearblocks.io/txns/HtVgZSMejybL7VAQGTBWisrjBdttuV11u7sbKf8TiNPm) | 19.61 |
| mint box | Confirmed | [FmohRDRtTFDgx76gDbizAmux3epVeZfaQHWmyVurjg1u](https://testnet.nearblocks.io/txns/FmohRDRtTFDgx76gDbizAmux3epVeZfaQHWmyVurjg1u) | 4.39 |
| list box | Confirmed | [B8EHQynjLCHbbN5eWiWCGMkaFNEh6TMsj34UH6PXJ8wZ](https://testnet.nearblocks.io/txns/B8EHQynjLCHbbN5eWiWCGMkaFNEh6TMsj34UH6PXJ8wZ) | 4.40 |
| buy box | Confirmed | [FAHruS4wfEu1RfeaHEVg3k2xFgXud7fqnQVnZhJqvLvH](https://testnet.nearblocks.io/txns/FAHruS4wfEu1RfeaHEVg3k2xFgXud7fqnQVnZhJqvLvH) | 5.18 |
| buyer quantum-locks | Confirmed | [G7x8moquFubihG3z29V2gAXRvJVtJ4QyQP9Mof9mumwz](https://testnet.nearblocks.io/txns/G7x8moquFubihG3z29V2gAXRvJVtJ4QyQP9Mof9mumwz) | 4.66 |
| buyer sets vault policy | Confirmed | [EqXSKzsxMmJJqw9EtTpFptspTaPmgk7MX1YzL5ZgBywe](https://testnet.nearblocks.io/txns/EqXSKzsxMmJJqw9EtTpFptspTaPmgk7MX1YzL5ZgBywe) | 5.66 |
| over-cap rejected | Rejected as expected | [2dFhKXyaw1Drujzx2uBNZNSKNqMcTrjQ5z33xpqZW6kR](https://testnet.nearblocks.io/txns/2dFhKXyaw1Drujzx2uBNZNSKNqMcTrjQ5z33xpqZW6kR) | 3.62 |
| wrong PQ key rejected | Rejected as expected | [9dyc8usCCfYNyhmWe57BfnY26Pxchox8YrUdTeZAKYHF](https://testnet.nearblocks.io/txns/9dyc8usCCfYNyhmWe57BfnY26Pxchox8YrUdTeZAKYHF) | 3.62 |
| seller front-run rejected | Rejected as expected | [5pEimesid7MceDiK66Wn9g3RMzEACm35m4aYXYo5Yc4N](https://testnet.nearblocks.io/txns/5pEimesid7MceDiK66Wn9g3RMzEACm35m4aYXYo5Yc4N) | 2.97 |
| request delayed ETH | Confirmed | [Av95Lhi4USBRJWppSKqDKFYnAmnt5WjpR3aooBj4YYMT](https://testnet.nearblocks.io/txns/Av95Lhi4USBRJWppSKqDKFYnAmnt5WjpR3aooBj4YYMT) | 5.78 |
| listing pending box rejected | Rejected as expected | [8HeFg5fcccByjJNSBbYTqqatLWruCcdF4hxzXWjFsCot](https://testnet.nearblocks.io/txns/8HeFg5fcccByjJNSBbYTqqatLWruCcdF4hxzXWjFsCot) | 2.47 |
| pending request replay rejected | Rejected as expected | [Higa5Stq6AY7Fquv49EvUjqrz75G71fFTPAEKpkaguCm](https://testnet.nearblocks.io/txns/Higa5Stq6AY7Fquv49EvUjqrz75G71fFTPAEKpkaguCm) | 2.97 |
| guardian diversion rejected | Rejected as expected | [21bZJQVR7WpZyq4EcH3tEVkYsJi7cM7T9u1ZpujHHrFH](https://testnet.nearblocks.io/txns/21bZJQVR7WpZyq4EcH3tEVkYsJi7cM7T9u1ZpujHHrFH) | 2.53 |
| guardian clawback | Confirmed | [J196kjnuBzbdNrZ5LVTRvwUtGXMjCTdMP3EGb3dB9q2f](https://testnet.nearblocks.io/txns/J196kjnuBzbdNrZ5LVTRvwUtGXMjCTdMP3EGb3dB9q2f) | 4.71 |
| MPC signs recovery | Confirmed | [nd4JhqFZcm3WrJEa8CPxMgpV77Js8V35JxQfPMtcvFo](https://testnet.nearblocks.io/txns/nd4JhqFZcm3WrJEa8CPxMgpV77Js8V35JxQfPMtcvFo) | 17.84 |
| nonce replay rejected | Rejected as expected | [HsEvw5QQVJJMGDZr9BxfCEqeUyJDbfiQRBB6CxfNbUXC](https://testnet.nearblocks.io/txns/HsEvw5QQVJJMGDZr9BxfCEqeUyJDbfiQRBB6CxfNbUXC) | 3.00 |
| request allowlisted ETH | Confirmed | [37KaEi1VrkkRirr7xCkFymieeLfaZtrCrajHHsQDFveV](https://testnet.nearblocks.io/txns/37KaEi1VrkkRirr7xCkFymieeLfaZtrCrajHHsQDFveV) | 5.87 |
| request MPC signature | Confirmed | [3ZtRY2qkyYEtHMCmYbFYxvYQHSPjjuwkiS8gimg6GaSu](https://testnet.nearblocks.io/txns/3ZtRY2qkyYEtHMCmYbFYxvYQHSPjjuwkiS8gimg6GaSu) | 17.96 |
| resale after signature rejected | Rejected as expected | [Dwn3anTLUfUXdfARnb7FFBg5xaE47Nxg3EXRxCKAPuna](https://testnet.nearblocks.io/txns/Dwn3anTLUfUXdfARnb7FFBg5xaE47Nxg3EXRxCKAPuna) | 2.59 |
| register BTC vault | Confirmed | [9EzwYnv6DQvskaiBrrqczM3jX7owjDoTcyV2cEsCh1kG](https://testnet.nearblocks.io/txns/9EzwYnv6DQvskaiBrrqczM3jX7owjDoTcyV2cEsCh1kG) | 6.14 |
| old BTC address reuse rejected | Rejected as expected | [FaPj7GVvFnCWfM54e8bt328hRNzEMLUrnNZxxqLz4Aic](https://testnet.nearblocks.io/txns/FaPj7GVvFnCWfM54e8bt328hRNzEMLUrnNZxxqLz4Aic) | 3.23 |
| BTC daily cap rejected | Rejected as expected | [DMdw3drj7xjeb4N7Jk8ALjrSqVf66j5jati1mRsyD9Mv](https://testnet.nearblocks.io/txns/DMdw3drj7xjeb4N7Jk8ALjrSqVf66j5jati1mRsyD9Mv) | 4.12 |
| request BTC withdrawal | Confirmed | [CYbfEQ5rbRv6ZQVLEMqc5tvMNTie1YWpnck3v8DRvDPC](https://testnet.nearblocks.io/txns/CYbfEQ5rbRv6ZQVLEMqc5tvMNTie1YWpnck3v8DRvDPC) | 6.46 |
| MPC signs Bitcoin | Confirmed | [73K6utvKZ73Dh34JVb9K38c1srEaUphdkfTqDVYSNPNB](https://testnet.nearblocks.io/txns/73K6utvKZ73Dh34JVb9K38c1srEaUphdkfTqDVYSNPNB) | 18.52 |

| Foreign chain | Funding transaction | MPC-signed withdrawal / recovery |
| --- | --- | --- |
| Bitcoin Core regtest | `266237d189b61307768945512ead261cf236d39b8a65d8c6992bf02b353b0dc8` | withdrawal `535785fb176f9260b30a98803e0511d5f9eff63ac693c67a3d3945117e3a0c41` (1+ confirmation) |
| Anvil chain 31337 | `0x6917d2941be1f979341569ffaf08576501a5c08d17a975b84f7662e387d2ee11` | recovery `0xc40734f93d001fb949bbc62cde3d8d0ca758b9bb0864bca02d96fc93128bc338`; withdrawal `0xc18a9477674998f10e4761b5ca1a2408c96f1082d0d9be99dcbc6a057b4eb14c` (status 1) |


## Run the UI and MCP server

```sh
cp .env.example packages/web/.env.local
# Set VITE_HAKO_CONTRACT to the contract account in deployments/testnet-2026-11-09.json.
# Set VITE_ANVIL_RPC_URL and VITE_BITCOIN_ESPLORA_URL for local balances.
node scripts/bitcoin-proxy.mjs
pnpm web
```

For MCP, build first, then set `HAKO_CONTRACT_ID` and run `node packages/mcp/dist/main.js` as a stdio server. `box_info` reads testnet and local-chain state. Write tools additionally require `NEAR_TESTNET_ACCOUNT`, `NEAR_TESTNET_KEY`, and `ML_DSA_KEY_FILE`; Bitcoin requests also require `BITCOIN_ESPLORA_URL`. The MCP server never receives an MPC signing capability directly. It only submits transactions to Hako's policy checks.

## Tests

See [TESTING.md](TESTING.md) for commands, actual counts, gas, and negative cases. All chain/service tests use live NEAR sandbox or testnet RPC, NEAR MPC, Bitcoin Core regtest, and Anvil. There are no mocked chain or service responses.

## Limits and security boundaries

- Hako protects **authority on NEAR** with ML-DSA-65. Bitcoin's secp256k1 ECDSA and the MPC root key remain classical. A spent one-time Bitcoin address exposes its key in the mempool window. A future Bitcoin post-quantum output type would require migration; BIP-360 is a proposal, not an active Bitcoin feature. The policy carries an `emergency_migration` destination field, but automatic migration execution is not implemented.
- One Bitcoin UTXO per spend and simple ETH transfers are supported. Bitcoin next-epoch public keys are registered under an ML-DSA signature, but the contract does **not** prove that a registered key equals the MPC path derivation. The SDK verifies derivation against the signer; an independent client should verify it before sending change. The contract also does not advance epochs after broadcast. The demo sweeps the initial UTXO and creates no change.
- Bitcoin/ETH balances are live reads from local nodes; a NEAR contract cannot independently verify those foreign balances at sale time. The buyer must inspect them and `0 pending requests` before paying. Once a signature is issued, sale is permanently disabled, including if broadcast later fails.
- The 24-hour policy delay is represented by the contract's configurable seconds field; the demo uses the minimum two minutes. The current web UI targets Anvil/regtest and testnet NEAR. Public Bitcoin testnet4 and Sepolia funding is [blocked](BLOCKED.md).
- This prototype has not had an external security audit. It should not custody valuable funds.

## Team and other projects

Lead: <TBD by Nick>

Hako is independent of the earlier `near-qday-recovery` / Phylax work. It reuses its NEAR ML-DSA toolchain and local sandbox pattern, with a new NFT sale and foreign-chain wallet contract. Nick must confirm which other project, if any, he submits under Q-015 and disclose that project in each README before publishing. One person may submit at most two independent projects.

## Submission

Primary track: `nfts`; secondary tracks: `security`, `open`. The [submission form draft](HACKATHON_SUBMISSION_FORM.md) leaves human decisions as TBD. Nick publishes the local-only repository, demo post, and final application. The [hackathon rules](https://nearhackathon.com/HACKATHON.md) require a public repository by 2026-11-14 23:59 UTC.

MIT © 2026 Nivesh Gajengi.
