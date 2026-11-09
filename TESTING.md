# Verification record — 2026-11-09

Run `corepack pnpm install --frozen-lockfile && corepack pnpm test` on macOS arm64 with the toolchain listed in [README.md](README.md). Then run `scripts/demo.sh`. The last full `pnpm test` completed successfully; the last `scripts/demo.sh` completed and `scripts/verify-evidence.mjs` independently re-queried its chain results.

| Check | Actual result | Source |
| --- | ---: | --- |
| Rust contract unit tests | 6 passed, 0 failed, 0 ignored | `cargo test --manifest-path packages/contract/Cargo.toml` |
| SDK tests, including live testnet MPC derivation view | 2 passed, 0 failed, 0 skipped | `pnpm --filter @hako/sdk test` |
| Live MCP stdio tool and testnet box read | 1 passed, 0 failed, 0 skipped | `pnpm --filter @hako/mcp test` |
| Web type check | passed; no test cases counted | `pnpm --filter @hako/web test` |
| NEAR protocol-88 sandbox transactions | 25 passed, including 8 expected on-chain rejections | [sandbox.json](deployments/sandbox.json) |
| NEAR testnet transactions in demo | 24 independently re-queried, including 10 expected on-chain rejections | [testnet-2026-11-09.json](deployments/testnet-2026-11-09.json) |
| Anvil receipts | 3 successful: funding, guardian recovery, withdrawal | `scripts/verify-evidence.mjs` |
| Bitcoin Core regtest transactions | 2 confirmed: funding, MPC-signed withdrawal | `scripts/verify-evidence.mjs` |

No tests were skipped. Sandbox uses a real local nearcore node, not a mocked RPC. The SDK test calls the real testnet signer view. MCP testing launches the actual stdio server and reads the deployed testnet box. The demo invokes the testnet MPC network, then broadcasts its ECDSA signatures to real Anvil and bitcoind processes. `scripts/verify-evidence.mjs` calls NEAR RPC `tx`, Anvil `eth_getTransactionReceipt`, and Bitcoin Core `getrawtransaction` for every recorded hash. Local-chain nodes are stopped by `scripts/demo.sh` when it finishes; rerun the script to reproduce their receipts.

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

The sandbox also reads back the transferred box and confirms the earlier request is cancelled and its PQ key cleared. The live demo compares the on-chain Bitcoin BIP143 digest with the SDK's independent BIP143 computation, then confirms the signed transaction in Bitcoin Core. The ETH digest matches a viem EIP-1559 fixture in the Rust unit test, and Anvil accepts two MPC-signed ETH transactions.

The sixth Rust test checks that an omitted delay defaults to 86,400 seconds and a future Bitcoin migration destination can be recorded without treating it as a current Ethereum address.

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

The visual layout and 375px overflow were reviewed from CSS and the production web build passed, but an interactive browser screenshot check could not run in this environment. No public testnet4 or Sepolia funds were provided, so those modes are [blocked](BLOCKED.md). Full NEP-171 approval/event conformance and a post-signature Bitcoin epoch advancement flow are not tested or implemented.
