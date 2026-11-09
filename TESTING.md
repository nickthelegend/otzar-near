# Verification record — 2026-11-09

Run `corepack pnpm install --frozen-lockfile && corepack pnpm test` on macOS arm64 with the toolchain listed in [README.md](README.md). Then run `scripts/demo.sh`, `scripts/demo-solana.sh`, and `node scripts/demo-recovery.mjs`. These use real local nodes and NEAR testnet; the recovery script waits for its two-minute timelock. `scripts/verify-evidence.mjs` independently re-queries the original BTC/ETH demo record.

| Check | Actual result | Source |
| --- | ---: | --- |
| Rust contract unit tests | 7 passed, 0 failed, 0 ignored | `cargo test --manifest-path packages/contract/Cargo.toml` |
| SDK tests, including live chain scanner reads and EdDSA derivation | 7 passed, 0 failed, 0 skipped | `pnpm --filter @hako/sdk test` |
| Live MCP stdio tool and testnet box read | 1 passed, 0 failed, 0 skipped | `pnpm --filter @hako/mcp test` |
| Web type check | passed; no test cases counted | `pnpm --filter @hako/web test` |
| NEAR protocol-88 sandbox transactions | 47 passed, including 16 expected on-chain rejections | [sandbox.json](deployments/sandbox.json) |
| NEAR testnet transactions in demo | 24 independently re-queried, including 10 expected on-chain rejections | [testnet-2026-11-09.json](deployments/testnet-2026-11-09.json) |
| Anvil receipts | 3 successful: funding, guardian recovery, withdrawal | `scripts/verify-evidence.mjs` |
| Bitcoin Core regtest transactions | 2 confirmed: funding, MPC-signed withdrawal | `scripts/verify-evidence.mjs` |
| Solana follow-up NEAR testnet transactions | 6 confirmed, 0 rejected | [solana-2026-11-09.json](deployments/solana-2026-11-09.json) |
| Local Solana validator | 1 funded source and 1 confirmed MPC-signed 0.1 SOL transfer | [solana-2026-11-09.json](deployments/solana-2026-11-09.json) |
| Guardian recovery NEAR testnet transactions | 8 total: 5 confirmed, 3 expected rejections | [recovery-2026-11-09.json](deployments/recovery-2026-11-09.json) |
| Final tested wasm upgrade | 1 NEAR testnet deployment; RPC code SHA-256 matched the local wasm | [upgrade-2026-11-09.json](deployments/upgrade-2026-11-09.json) |

No tests were skipped. Sandbox uses a real local nearcore node, not a mocked RPC. The SDK reads the real testnet signer, public Ethereum RPC, and live Bitcoin Esplora. This machine could not reach mempool.space, so the scanner used Blockstream's real Esplora fallback. MCP testing launches the actual stdio server and reads the deployed testnet box plus public ETH exposure. The BTC/ETH demo invokes testnet MPC and broadcasts to Anvil and bitcoind; the SOL demo invokes EdDSA MPC and broadcasts to a local Solana validator. `scripts/verify-evidence.mjs` calls NEAR RPC `tx`, Anvil `eth_getTransactionReceipt`, and Bitcoin Core `getrawtransaction` for every original demo hash. The local nodes are stopped by their demo scripts.

## Negative checks

| Attack or invariant | Where rejected |
| --- | --- |
| Spend before buyer installs a new policy | sandbox, on NEAR |
| Wrong ML-DSA key | sandbox and testnet, on NEAR |
| ETH or BTC amount over daily cap | sandbox ETH and testnet ETH/BTC, on NEAR |
| Seller calls spend after the sale | sandbox and testnet, on NEAR |
| Listing while a spend is pending | sandbox and testnet, on NEAR |
| Guardian diverts recovery to another destination | sandbox and testnet, on NEAR |
| Transfer during guardian recovery | sandbox, on NEAR |
| Reuse of a pending request or consumed nonce | testnet, on NEAR |
| Change to the current Bitcoin epoch address | contract unit and testnet, on NEAR |
| Resale after MPC signature issued | testnet, on NEAR |
| Old owner ML-DSA key after transfer | sandbox, on NEAR |
| Guardian collusion below configured threshold | sandbox and testnet, on NEAR |
| Guardian recovery before timelock | sandbox and testnet, on NEAR |
| Recovery replay while pending | sandbox, on NEAR |
| Wrong heir or claim before deadline | sandbox, on NEAR |
| Unregistered Solana source or tampered transfer | sandbox, on NEAR |
| Listing a vault with a pending SOL spend | sandbox, on NEAR |
| Old PQ authority after guardian rotation | testnet, on NEAR |

The sandbox also reads back the transferred box and confirms the earlier request is cancelled and its PQ key cleared. The live demo compares the on-chain Bitcoin BIP143 digest with the SDK's independent BIP143 computation, then confirms the signed transaction in Bitcoin Core. The ETH digest matches a viem EIP-1559 fixture in the Rust unit test, and Anvil accepts two MPC-signed ETH transactions.

The seventh Rust test advances the NEAR block timestamp beyond an heir's deadline and delay, then confirms the claim transfers the NFT, clears the old PQ key and policy, and cancels a pending spend. A multiday positive claim on live testnet has not yet elapsed.

## Gas measured on NEAR testnet

From [the final evidence](deployments/testnet-2026-11-09.json), including transaction and receipt gas:

| Action | Gas (Tgas) |
| --- | ---: |
| Buyer ML-DSA-65 policy update | 6.78 |
| ETH request with ML-DSA and EIP-1559 hash | 7.00 (allowlisted), 6.90 (delayed) |
| ETH MPC signing and callback | 20.20 (withdrawal), 20.08 (recovery) |
| Bitcoin policy/public-key registration | 7.27 |
| Bitcoin request with ML-DSA and on-chain BIP143 | 7.58 |
| Bitcoin MPC signing and callback | 20.77 |

The SDK performs MPC epsilon derivation and verifies it against the signer view. **On-chain address derivation was not implemented**, so it has no measured gas figure. The contract checks a registered next-epoch P2WPKH script and enforces a two-minute registration delay for change instead. The web and MCP clients compare registered keys with SDK-derived keys before building a Bitcoin spend; direct callers must make that comparison themselves.

## Known verification limits

The production web build passed, but the browser automation host was unavailable, so a measured 375px screenshot and overflow check remain [blocked](BLOCKED.md). No public testnet4 or Sepolia funds were provided. The public scanner cannot prove ETH outgoing signatures from nonce alone after EIP-7702; the UI marks positive-nonce exposure unknown. Full NEP-171 approval/event conformance and post-signature Bitcoin epoch advancement remain unimplemented.
