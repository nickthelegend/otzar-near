# Hako (箱) — Your Bitcoin dies on Q-day. Hako doesn't.

Hako is one wallet for BTC, ETH, and SOL. A vault NFT on NEAR controls addresses on Bitcoin Core regtest, Anvil, and a local Solana validator through NEAR Chain Signatures. Its authority key is ML-DSA-65; the NFT carries spending rules, M-of-N post-quantum guardians, and an inheritable heir policy. A buyer can acquire a funded vault NFT on NEAR without a foreign-chain transfer at sale time. Public-chain addresses can be inspected without connecting a wallet.

The problem: a classical public key revealed on Bitcoin or Ethereum is a future quantum target. Bitcoin script cannot enforce a daily cap, delay, guardian recovery, or inheritance on these outputs. Hako checks authority and policy on NEAR before asking MPC to sign. The scanner shows exposure using live chain data. The foreign-chain signatures and MPC root remain classical; see [Security boundaries](#limits-and-security-boundaries).

This is a **testnet and local-chain prototype**, not a mainnet vault. The NFT implements NEP-171 ownership and enumeration views used here; approval, metadata events, and full marketplace interoperability are not implemented. See [Limits](#limits-and-security-boundaries).

## Judge walkthrough

On macOS arm64 with Node 22+, pnpm 10.22, Rust 1.95, cargo-near 0.22, Foundry Anvil, and curl installed:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm test
scripts/demo.sh
scripts/demo-solana.sh
node scripts/demo-recovery.mjs
```

`pnpm test` builds the four packages, runs unit and live signer/MCP/scanner checks, then starts and stops a real NEAR sandbox. `scripts/demo.sh` starts Bitcoin Core regtest and Anvil, performs the NFT sale, rejects attack spends, then broadcasts MPC-signed Bitcoin and Ethereum withdrawals. `scripts/demo-solana.sh` starts and stops a local Solana validator, upgrades the same NEAR testnet contract, and broadcasts a real Ed25519 MPC-signed SOL transfer. `node scripts/demo-recovery.mjs` proves a 2-of-3 ML-DSA key rotation after its two-minute timelock on NEAR testnet. It waits for the full timelock. The scripts use ignored `.near-credentials/` testnet keys; `demo.sh` creates them first.

Do `scripts/demo.sh` → see a new `deployments/testnet-YYYY-MM-DD.json` with NEAR transaction links and local-chain transaction IDs. Do `pnpm web` after creating `packages/web/.env.local` from `.env.example` → see live boxes, addresses, balances, vault rules, pending countdowns, signing and sale controls at `http://127.0.0.1:5173`. The Bitcoin balance and broadcast controls need the local proxy: `node scripts/bitcoin-proxy.mjs`, with `VITE_BITCOIN_ESPLORA_URL=http://127.0.0.1:3007` in the web env file. The proxy reads the real Bitcoin Core regtest node; it is not a fixture service. `scripts/demo.sh` saves Anvil's state to ignored `.demo/anvil-state.json` on exit so local receipts can be reloaded.

The web wallet uses MyNearWallet on testnet. The demo's generated NEAR accounts are for the CLI flow; browser actions require a testnet wallet you control. If a setting is missing, the interface reports `Setup required: <VAR>`.

## Architecture and NEAR features

| Package | Purpose |
| --- | --- |
| `packages/contract` | NFT ownership/sale, BTC/ETH/SOL transaction checks, ML-DSA authorization, 2-of-3 guardian recovery, inheritance, MPC calls. |
| `packages/sdk` | MPC derivation, BTC/ETH/SOL transaction assembly, scanner reads, ML-DSA signatures and live RPC helpers. |
| `packages/web` | Landing page, no-wallet exposure scanner, and wallet screen with balances, vault rules, guardian/heir actions, receive/send/sale controls. |
| `packages/mcp` | stdio `box_info`, `scan_exposure`, `request_spend`, `list_box`; writes call the same contract checks as the UI. |

NEAR features used: **Chain Signatures** (ECDSA domain 0 for BTC/ETH, EdDSA domain 1 for SOL) to sign foreign transactions; **NEP-171 core ownership/enumeration methods** for the vault NFT; NEAR testnet transactions for sale and vault policy; **`env::ml_dsa_verify`** for owner and guardian authorization. Intents, sub-accounts, NEP-141/245, meta transactions, OutLayer TEE, and Sputnik DAO are not used. NEAR Intents has no testnet; Hako does not claim a live Intents integration.

The MPC testnet signer is `v1.signer-prod.testnet`. Each box uses `hako/<token_id>/<epoch>` as its path. The SDK computes SHA3-256 epsilon according to the [NEAR MPC implementation](https://github.com/near/mpc/blob/main/crates/near-mpc-crypto-types/src/kdf.rs) and verifies the derived key against the signer's `derived_public_key` view. The contract sends `sign` a `payload_v2.Ecdsa` 32-byte digest, `path`, and `domain_id: 0` with one yoctoNEAR. The [NEAR Chain Signatures documentation](https://docs.near.org/chain-abstraction/chain-signatures/implementation) describes the network and signer; the [MPC repository](https://github.com/near/mpc) describes the request schema.

For Ethereum the contract accepts only simple unsigned EIP-1559 type-2 transfers on chain ID 31337 or 11155111 and hashes their typed bytes with Keccak-256. For Bitcoin it accepts one-input, one- or two-output, unsigned P2WPKH transfers and computes BIP143 SIGHASH_ALL itself. The caller never supplies the MPC payload. Bitcoin change must match the registered next-epoch script and wait two minutes after registration; the current-epoch script cannot receive change. Sale and transfer are blocked after any MPC signature is issued, preventing a seller from signing a withdrawal and then selling the still-funded NFT. A buyer must register their own ML-DSA key and policy after sale; the seller's guardian/recovery policy and Bitcoin registration are cleared.

## Scanner, recovery, SOL, and inheritance

The scanner works without a wallet. Enter a BTC address or P2PK public key, or an ETH address, then press **Scan address**. For Bitcoin it reads address balances and paginated transactions through [mempool.space Esplora](https://mempool.space/docs/api/rest), falling back to [Blockstream Esplora](https://github.com/Blockstream/esplora/blob/master/API.md) when mempool.space is unavailable. It checks spent P2PKH/P2WPKH addresses, reused outputs, P2PK scripts, and Taproot addresses. Some public indexers do not index P2PK outputs; in that case Hako reports exposure from the public key itself and marks the balance unavailable. For ETH it reads balance, nonce, and code from a public JSON-RPC. A zero nonce rules out a sent EOA transaction; a positive nonce is marked **unknown** because [EIP-7702 breaks the nonce-as-sent-count assumption](https://ethereum.github.io/execution-apis/api/methods/eth_getTransactionCount/). Contract accounts are also marked unknown for this EOA check. No exposure result is based on fabricated chain data.

Press **Move it into Hako** in **Local demo** mode with a selected vault to build an unsigned sweep to that vault's fresh regtest or Anvil address. The source owner must sign and broadcast it. Public mainnet sweep preparation is [blocked](BLOCKED.md): Hako refuses to build a mainnet spend in this prototype. A regtest source currently needs one UTXO; the builder uses a fixed 500-sat demo fee. The Anvil builder reads the source nonce, balance, and gas price live. The scanner itself requires no NEAR account.

Set 2–5 ML-DSA guardian public keys and a threshold of at least 2 with an owner ML-DSA signature. A guardian recovery requires distinct valid signatures over the vault, owner, recovery nonce, and new key; it waits 2 minutes to 30 days. The owner can cancel. After finalization the old authority key fails. This adapts the ML-DSA recovery pattern from Nick's pre-hackathon `near-qday-recovery` / Phylax library (Q-005 baseline); **Phylax is folded into Hako and is not another entry**. The NFT's heir policy names a NEAR account and visible deadline plus claim delay. Owner check-in extends the deadline; the owner can cancel; after the delay only the heir may claim. Claim clears the old authority and policies. A signed vault cannot transfer to an heir because an already issued foreign-chain signature could still spend after transfer.

The signer contract's [EdDSA domain 1](https://github.com/near/mpc/blob/main/crates/near-mpc-crypto-types/src/sign.rs) derives a Solana address per vault. Hako accepts only a single legacy SystemProgram SOL transfer message, verifies its source and destination fields on NEAR, requires ML-DSA owner authorization, and requests an Ed25519 MPC signature. The SDK verifies the signature against the derived source key before broadcasting. Solana recent blockhashes expire quickly, so this prototype signs SOL immediately; the BTC/ETH delay and daily cap are **not** enforced for SOL. The local validator e2e confirms 0.1 SOL received. The MPC root and Solana Ed25519 signature remain classical.

| New live proof | NEAR transaction | Foreign chain result |
| --- | --- | --- |
| Solana address registration | [CtkHMADGR6E2vZmShh5tWLJDdf3Zc8r9ojkCrYZt26EG](https://testnet.nearblocks.io/txns/CtkHMADGR6E2vZmShh5tWLJDdf3Zc8r9ojkCrYZt26EG) | Derived Ed25519 address in [Solana evidence](deployments/solana-2026-11-09.json) |
| SOL message authorization | [AwwQn9dNKrNXgMZ3pMPn5Qtp7aqiZJmeNHvdaBHYDURJ](https://testnet.nearblocks.io/txns/AwwQn9dNKrNXgMZ3pMPn5Qtp7aqiZJmeNHvdaBHYDURJ) | 0.1 SOL transfer prepared |
| Ed25519 MPC signature | [AEq9SevVDCWTqAoTecYk8uxybgrxb2c2hQGDG227HE5h](https://testnet.nearblocks.io/txns/AEq9SevVDCWTqAoTecYk8uxybgrxb2c2hQGDG227HE5h) | Local validator signature `4HA5Awa6j9yXgDPDCmTKXf48z426jCcGaMuW1nvwhahhWZqg8cdx2RwzJeVvZtA5azWZwrS5d7xCTcDNpygArrcW` (confirmed) |
| 2-of-3 PQ recovery initiated | [AmUcTVtZVFRSssXgj7AXN7XzeqBDjNzhqBvUHtPbr83Y](https://testnet.nearblocks.io/txns/AmUcTVtZVFRSssXgj7AXN7XzeqBDjNzhqBvUHtPbr83Y) | One guardian rejected [on-chain](https://testnet.nearblocks.io/txns/C26pPNCi4RfYH9x2ZTMnzuyNKCHv1XNeo67pz29RHDzn) |
| PQ recovery finalized after timelock | [GnRwjV9HBfH86PWQ6kR536Mb458x36nrs3sUy1jccfVc](https://testnet.nearblocks.io/txns/GnRwjV9HBfH86PWQ6kR536Mb458x36nrs3sUy1jccfVc) | Early finalization rejected [on-chain](https://testnet.nearblocks.io/txns/5zrAxsiFqBehWMpJFZUbd61FDzZzxg5Fx87ckxFT4zAp) |

The exact final tested wasm was [deployed again](https://testnet.nearblocks.io/txns/5BnydYkviEXbDoY4exGWtzFmPR9y16Zwmvr8a3yK9Gx4); a post-deploy RPC code read matched its SHA-256 hash. Full records: [Solana](deployments/solana-2026-11-09.json), [PQ recovery](deployments/recovery-2026-11-09.json), [final upgrade](deployments/upgrade-2026-11-09.json), and [sandbox attack tests](deployments/sandbox.json). The Solana signature is local-validator evidence, so it has no public explorer URL; reproduce it with `scripts/demo-solana.sh` and query the validator before the script stops.

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
# In another terminal, reload the Solana demo ledger:
solana-test-validator --ledger "$PWD/.demo/solana" --rpc-port 8899 --faucet-port 9900 --quiet
# In another terminal, set VITE_HAKO_CONTRACT in packages/web/.env.local and run:
pnpm web
```

Run the proxy, validator, and web commands in separate terminals. Stop Anvil, the validator, the proxy, and Vite with Ctrl-C and Bitcoin Core with `.tools/bitcoin-31.2/bin/bitcoin-cli -regtest -datadir="$PWD/.demo/bitcoin" stop` when done.

For MCP, build first, then set `HAKO_CONTRACT_ID` and run `node packages/mcp/dist/main.js` as a stdio server. `box_info` reads testnet and local-chain state. Write tools additionally require `NEAR_TESTNET_ACCOUNT`, `NEAR_TESTNET_KEY`, and `ML_DSA_KEY_FILE`; Bitcoin requests also require `BITCOIN_ESPLORA_URL`. The MCP server never receives an MPC signing capability directly. It only submits transactions to Hako's policy checks.

## Tests

See [TESTING.md](TESTING.md) for commands, actual counts, gas, and negative cases. All chain/service tests use live NEAR sandbox or testnet RPC, NEAR MPC, Bitcoin Core regtest, and Anvil. There are no mocked chain or service responses.

## Limits and security boundaries

- Hako protects **authority on NEAR** with ML-DSA-65, including the guardian quorum and heir policy. Bitcoin and Ethereum secp256k1 signatures, Solana Ed25519 signatures, and both MPC root keys remain classical. One-time addresses reduce Bitcoin public-key exposure to the mempool window on first spend. A future Bitcoin post-quantum output type would require migration; BIP-360 is a proposal, not an active Bitcoin feature. The policy carries an `emergency_migration` destination field, but automatic migration execution is not implemented.
- One Bitcoin UTXO per spend and simple ETH transfers are supported. Bitcoin next-epoch public keys are registered under an ML-DSA signature, but the contract does **not** prove that a registered key equals the MPC path derivation. The SDK verifies derivation against the signer; an independent client should verify it before sending change. The contract also does not advance epochs after broadcast. The demo sweeps the initial UTXO and creates no change.
- Bitcoin/ETH balances are live reads from local nodes; a NEAR contract cannot independently verify those foreign balances at sale time. The buyer must inspect them and `0 pending requests` before paying. Once a signature is issued, sale is permanently disabled, including if broadcast later fails.
- An omitted policy delay defaults to 24 hours; the demo uses the minimum two minutes. The current web UI targets Anvil/regtest and testnet NEAR. Public Bitcoin testnet4 and Sepolia funding is [blocked](BLOCKED.md).
- SOL signs immediately due to recent-blockhash expiry. It does not inherit the ETH/BTC spending cap or delay. The contract checks only a simple SystemProgram transfer and a registered source; it does not independently prove that the registered Solana key matches the MPC derivation. The SDK checks derivation and signature. A direct caller must check the registered key before funding it.
- Guardian recovery finalization is live on NEAR testnet. An inheritance claim after a multiday deadline was unit-tested with a later NEAR block timestamp; the sandbox and testnet have not yet naturally advanced to a claim date. The on-chain sandbox rejected early and wrong-heir claims.
- The no-wallet scanner is an exposure indicator, not a complete cryptographic audit. Bitcoin histories over 500 transactions are marked incomplete. ETH positive nonce remains unknown because of EIP-7702. P2PK output balance is marked unavailable when the public Esplora indexer omits it.
- This prototype has not had an external security audit. It should not custody valuable funds.

## Team and other projects

Lead: <TBD by Nick>

Hako folds the former Phylax ML-DSA recovery concept and Athanatos quantum-safe-wallet concept into one product and one entry. It reuses Nick's pre-hackathon `near-qday-recovery` recovery pattern, ML-DSA toolchain, and sandbox setup as a Q-005 baseline. Nick must identify any *other independent* entry under Q-015 and disclose it here before publishing; Phylax is no longer an entry. One person may submit at most two projects.

## Submission

Primary track: `nfts`; secondary tracks: `security`, `open`. The [submission form draft](HACKATHON_SUBMISSION_FORM.md) leaves human decisions as TBD. Nick publishes the local-only repository, demo post, and final application. The [hackathon rules](https://nearhackathon.com/HACKATHON.md) require a public repository by 2026-11-14 23:59 UTC.

MIT © 2026 Nivesh Gajengi.
