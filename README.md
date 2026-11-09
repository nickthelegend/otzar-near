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

Do `scripts/demo.sh` → see a new `deployments/testnet-YYYY-MM-DD.json` with NEAR transaction links and local-chain transaction IDs. Do `pnpm web` after creating `packages/web/.env.local` from `.env.example` → see live boxes, addresses, balances, vault rules, pending countdowns, signing and sale controls at `http://127.0.0.1:5173`. The Bitcoin balance and broadcast controls need the local proxy: `node scripts/bitcoin-proxy.mjs`, with `VITE_BITCOIN_ESPLORA_URL=http://127.0.0.1:3007` in the web env file. The proxy reads the real Bitcoin Core regtest node; it is not a fixture service. `scripts/demo.sh` saves Anvil's state to ignored `.demo/anvil-state.json` on exit so local receipts can be reloaded.

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

Contract: `hako-contract-mw984kpp.testnet`. Demo box: `box-mw99z867`.

| Action | Result | NEAR testnet transaction | Gas (Tgas) |
| --- | --- | --- | ---: |
| upgrade hako | Confirmed | [2zEtKTWUD2XmA9D3TRQZirGhaVnRkoogac9GtPuNJgLb](https://testnet.nearblocks.io/txns/2zEtKTWUD2XmA9D3TRQZirGhaVnRkoogac9GtPuNJgLb) | 19.61 |
| mint box | Confirmed | [8ANx1MSBEXHy6NzL93WaF4SCvWn4RotQgaf1EKpYuHm7](https://testnet.nearblocks.io/txns/8ANx1MSBEXHy6NzL93WaF4SCvWn4RotQgaf1EKpYuHm7) | 5.48 |
| list box | Confirmed | [HE8q9oXco98jEY4DDBcU2VkT7h5xAgr8CpBqKLKhJ2w2](https://testnet.nearblocks.io/txns/HE8q9oXco98jEY4DDBcU2VkT7h5xAgr8CpBqKLKhJ2w2) | 5.50 |
| buy box | Confirmed | [CuWRZuhbuMSiNWWAYBpQ79m9G1568iWbo2pwyNFUMsQ4](https://testnet.nearblocks.io/txns/CuWRZuhbuMSiNWWAYBpQ79m9G1568iWbo2pwyNFUMsQ4) | 6.28 |
| buyer quantum-locks | Confirmed | [Ge32nrCMLt69XGRyo7gBkYLjGG1W2Rxmm61BDSpX5NXV](https://testnet.nearblocks.io/txns/Ge32nrCMLt69XGRyo7gBkYLjGG1W2Rxmm61BDSpX5NXV) | 5.78 |
| buyer sets vault policy | Confirmed | [9dgdgsyqZNQ5xCYLNBYK5kjoo4gjn7MqYs4FbYenoGca](https://testnet.nearblocks.io/txns/9dgdgsyqZNQ5xCYLNBYK5kjoo4gjn7MqYs4FbYenoGca) | 6.78 |
| over-cap rejected | Rejected as expected | [5WGNSsxmC9Vqt55pZPi1osbyt5kiwFq4g8hSqhMg7c9E](https://testnet.nearblocks.io/txns/5WGNSsxmC9Vqt55pZPi1osbyt5kiwFq4g8hSqhMg7c9E) | 3.91 |
| wrong PQ key rejected | Rejected as expected | [9zUjXAW1nshyLvu1wmTP7drURp48Z4eKjKZwRDyuJBvi](https://testnet.nearblocks.io/txns/9zUjXAW1nshyLvu1wmTP7drURp48Z4eKjKZwRDyuJBvi) | 3.91 |
| seller front-run rejected | Rejected as expected | [H96BmoW8NrSsHzQzkghm1WH4LYeZtHZ6wHdPdTmB97pp](https://testnet.nearblocks.io/txns/H96BmoW8NrSsHzQzkghm1WH4LYeZtHZ6wHdPdTmB97pp) | 3.26 |
| request delayed ETH | Confirmed | [H67aQqArishsZiRodQxociLFMsNX62Swi89Kav2LhRSZ](https://testnet.nearblocks.io/txns/H67aQqArishsZiRodQxociLFMsNX62Swi89Kav2LhRSZ) | 6.90 |
| listing pending box rejected | Rejected as expected | [Gnf2cM1bR7YjVVDu29QRTGrX1GREE7dGeu6zD9fsj8XC](https://testnet.nearblocks.io/txns/Gnf2cM1bR7YjVVDu29QRTGrX1GREE7dGeu6zD9fsj8XC) | 2.76 |
| pending request replay rejected | Rejected as expected | [5uScxyHhZL2n93KwZ8iD4J5bhNJWYe3xvpjJUsSnBLzp](https://testnet.nearblocks.io/txns/5uScxyHhZL2n93KwZ8iD4J5bhNJWYe3xvpjJUsSnBLzp) | 3.26 |
| guardian diversion rejected | Rejected as expected | [8soUh8WnXyVwaY5uX2K19axp9bg22VZRenLsR8U5Xb9R](https://testnet.nearblocks.io/txns/8soUh8WnXyVwaY5uX2K19axp9bg22VZRenLsR8U5Xb9R) | 2.81 |
| guardian clawback | Confirmed | [37SuJys9pi4yDmEGLByEncU5srp1mbBVSvAD1nPwdoRg](https://testnet.nearblocks.io/txns/37SuJys9pi4yDmEGLByEncU5srp1mbBVSvAD1nPwdoRg) | 5.83 |
| MPC signs recovery | Confirmed | [2FuMNoARFBJpvMPmwCiHsQgM4pHhMjtiwEEeFDVWaV2Y](https://testnet.nearblocks.io/txns/2FuMNoARFBJpvMPmwCiHsQgM4pHhMjtiwEEeFDVWaV2Y) | 20.08 |
| nonce replay rejected | Rejected as expected | [9hFoYXyN8p6Y6WeeHV5DBNgCagEYwa4YmQskxUpeLoXt](https://testnet.nearblocks.io/txns/9hFoYXyN8p6Y6WeeHV5DBNgCagEYwa4YmQskxUpeLoXt) | 3.29 |
| request allowlisted ETH | Confirmed | [8i3pYX9vSqQAJhezW7yr7x5Pxn6g8kYRifgYRyz5EQ5f](https://testnet.nearblocks.io/txns/8i3pYX9vSqQAJhezW7yr7x5Pxn6g8kYRifgYRyz5EQ5f) | 7.00 |
| request MPC signature | Confirmed | [DfUUQ5tnZ5brTFbpRz59dKTfe3FBtnvwCUWEe1KncRp](https://testnet.nearblocks.io/txns/DfUUQ5tnZ5brTFbpRz59dKTfe3FBtnvwCUWEe1KncRp) | 20.20 |
| resale after signature rejected | Rejected as expected | [FjZ2MGw4UTGgksCus3CwRgLD1yVWrXPofRthGJyPz2wS](https://testnet.nearblocks.io/txns/FjZ2MGw4UTGgksCus3CwRgLD1yVWrXPofRthGJyPz2wS) | 2.88 |
| register BTC vault | Confirmed | [C69BqWbcBTZLpDKqV1Erro67E38UHGTchGVzwchZTLsG](https://testnet.nearblocks.io/txns/C69BqWbcBTZLpDKqV1Erro67E38UHGTchGVzwchZTLsG) | 7.27 |
| old BTC address reuse rejected | Rejected as expected | [2EuSKyrVUX7XUSjjg8zNyLmWvZHsCSdQu3kvqBdScCNP](https://testnet.nearblocks.io/txns/2EuSKyrVUX7XUSjjg8zNyLmWvZHsCSdQu3kvqBdScCNP) | 3.51 |
| BTC daily cap rejected | Rejected as expected | [EiBvj8JdUPYNwLfGJaUqnJUy2w2fyc8zsXkSeyNzcSmM](https://testnet.nearblocks.io/txns/EiBvj8JdUPYNwLfGJaUqnJUy2w2fyc8zsXkSeyNzcSmM) | 4.41 |
| request BTC withdrawal | Confirmed | [EFBzZB6XRNrjv2o3EdkHQfPSu2iSdtxZbr1BV6khKScG](https://testnet.nearblocks.io/txns/EFBzZB6XRNrjv2o3EdkHQfPSu2iSdtxZbr1BV6khKScG) | 7.58 |
| MPC signs Bitcoin | Confirmed | [AzLx5us7NyZ7uxMwnYwBJhZnQNVoxz38eEm67enLjSzL](https://testnet.nearblocks.io/txns/AzLx5us7NyZ7uxMwnYwBJhZnQNVoxz38eEm67enLjSzL) | 20.77 |

| Foreign chain | Funding transaction | MPC-signed withdrawal / recovery |
| --- | --- | --- |
| Bitcoin Core regtest | `f9037a1e9b7d133275dfc83098602dbdcc08c313c2032f3878f24567934cae83` | withdrawal `c345f439c35fd9acda20718923093701d8f87efcd1a03dad7951edf6113e0238` (1+ confirmation) |
| Anvil chain 31337 | `0x88b5f0c6821edea76af4fa5e413ef10d9aed84730735bc677fe2b79b9df301a6` | recovery `0x2cd417589c101a97721dd833534025f08f1889390999b050ce5c61f3179e8d3b`; withdrawal `0xcc73278811d0c1944adab29c0549ab52afefb85596cd581b9b5f52e30b0402e0` (status 1) |

## Run the UI and MCP server

```sh
cp .env.example packages/web/.env.local
# Set VITE_HAKO_CONTRACT to the contract account in deployments/testnet-2026-11-09.json.
# Set VITE_ANVIL_RPC_URL and VITE_BITCOIN_ESPLORA_URL for local balances.
anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --load-state "$PWD/.demo/anvil-state.json"
# In another terminal:
.tools/bitcoin-31.2/bin/bitcoind -regtest -datadir="$PWD/.demo/bitcoin" -server=1 -txindex=1 -rpcport=18443 -listen=0 -fallbackfee=0.0001 -daemon
node scripts/bitcoin-proxy.mjs
pnpm web
```

Run the proxy and web commands in separate terminals. Stop Anvil with Ctrl-C and Bitcoin Core with `.tools/bitcoin-31.2/bin/bitcoin-cli -regtest -datadir="$PWD/.demo/bitcoin" stop` when done.

For MCP, build first, then set `HAKO_CONTRACT_ID` and run `node packages/mcp/dist/main.js` as a stdio server. `box_info` reads testnet and local-chain state. Write tools additionally require `NEAR_TESTNET_ACCOUNT`, `NEAR_TESTNET_KEY`, and `ML_DSA_KEY_FILE`; Bitcoin requests also require `BITCOIN_ESPLORA_URL`. The MCP server never receives an MPC signing capability directly. It only submits transactions to Hako's policy checks.

## Tests

See [TESTING.md](TESTING.md) for commands, actual counts, gas, and negative cases. All chain/service tests use live NEAR sandbox or testnet RPC, NEAR MPC, Bitcoin Core regtest, and Anvil. There are no mocked chain or service responses.

## Limits and security boundaries

- Hako protects **authority on NEAR** with ML-DSA-65. Bitcoin's secp256k1 ECDSA and the MPC root key remain classical. A spent one-time Bitcoin address exposes its key in the mempool window. A future Bitcoin post-quantum output type would require migration; BIP-360 is a proposal, not an active Bitcoin feature. The policy carries an `emergency_migration` destination field, but automatic migration execution is not implemented.
- One Bitcoin UTXO per spend and simple ETH transfers are supported. Bitcoin next-epoch public keys are registered under an ML-DSA signature, but the contract does **not** prove that a registered key equals the MPC path derivation. The SDK verifies derivation against the signer; an independent client should verify it before sending change. The contract also does not advance epochs after broadcast. The demo sweeps the initial UTXO and creates no change.
- Bitcoin/ETH balances are live reads from local nodes; a NEAR contract cannot independently verify those foreign balances at sale time. The buyer must inspect them and `0 pending requests` before paying. Once a signature is issued, sale is permanently disabled, including if broadcast later fails.
- An omitted policy delay defaults to 24 hours; the demo uses the minimum two minutes. The current web UI targets Anvil/regtest and testnet NEAR. Public Bitcoin testnet4 and Sepolia funding is [blocked](BLOCKED.md).
- This prototype has not had an external security audit. It should not custody valuable funds.

## Team and other projects

Lead: <TBD by Nick>

Hako is independent of the earlier `near-qday-recovery` / Phylax work. It reuses its NEAR ML-DSA toolchain and local sandbox pattern, with a new NFT sale and foreign-chain wallet contract. Nick must confirm which other project, if any, he submits under Q-015 and disclose that project in each README before publishing. One person may submit at most two independent projects.

## Submission

Primary track: `nfts`; secondary tracks: `security`, `open`. The [submission form draft](HACKATHON_SUBMISSION_FORM.md) leaves human decisions as TBD. Nick publishes the local-only repository, demo post, and final application. The [hackathon rules](https://nearhackathon.com/HACKATHON.md) require a public repository by 2026-11-14 23:59 UTC.

MIT © 2026 Nivesh Gajengi.
