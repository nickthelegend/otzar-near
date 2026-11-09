# Blocked and optional setup

The local regtest/Anvil and NEAR testnet demo works without a mainnet key or faucet. The following are outside the verified flow:

| Item | Exact input Nick must provide | Current behavior |
| --- | --- | --- |
| Public Bitcoin testnet4 funding | `BITCOIN_TESTNET4_FUNDED_ADDRESS`, plus access to funded testnet4 UTXOs | `scripts/demo.sh --network testnet4` exits with `Setup required`. No faucet or balance is simulated. |
| Sepolia broadcast | `SEPOLIA_RPC_URL` and funded Sepolia ETH at the Hako derived address | Not exercised; simple EIP-1559 chain ID 11155111 is accepted by the contract. |
| Public-chain sweep from the scanner | A source-wallet signing integration and Nick's explicit authorization for a public-chain spend; funded testnet4/Sepolia source assets for testnet-only extension | **Move it into Hako** builds unsigned transactions only on local regtest/Anvil. No mainnet spend or signature is attempted. |
| P2PK public balance | A public Esplora indexer that includes the queried P2PK script, or a local fully indexed Bitcoin node | The scanner marks the key exposed but shows balance unavailable if the service reports no P2PK outputs. The known block-1 P2PK output is omitted by the public Blockstream scripthash response in this environment. |
| Complete ETH outgoing-tx proof | A reliable address-history indexer or a transaction hash supplied by the user | Public `eth_getTransactionCount` is insufficient after EIP-7702. The scanner reports nonce activity as exposure unknown, not as proof of a sent transaction. |
| Direct mempool.space verification from this machine | Network reachability to `https://mempool.space/api` | The SDK tries mempool.space first; requests timed out during verification, so live scanner tests used the real Blockstream Esplora fallback. |
| Browser Bitcoin balances/broadcast | `VITE_BITCOIN_ESPLORA_URL` pointing at the local Bitcoin proxy or a compatible live service | The UI displays `Setup required: VITE_BITCOIN_ESPLORA_URL`. |
| Browser Solana balances/broadcast | Local `solana-test-validator` at `VITE_SOLANA_RPC_URL` (default `http://127.0.0.1:8899`) | The UI displays `Setup required: VITE_SOLANA_RPC_URL` if the validator is stopped. The CLI e2e was confirmed on a real local validator. |
| Browser NEAR contract | `VITE_HAKO_CONTRACT` | The UI displays `Setup required: VITE_HAKO_CONTRACT`. |
| MCP writes | `NEAR_TESTNET_ACCOUNT`, `NEAR_TESTNET_KEY`, `ML_DSA_KEY_FILE`; Bitcoin also needs `BITCOIN_ESPLORA_URL` | Read tool works with `HAKO_CONTRACT_ID`; write tools return a named setup error. |
| Public hackathon submission | Public repository URL, public demo post URL, lead/contact/payout/consent fields in `HACKATHON_SUBMISSION_FORM.md` | Local Git only. Nick publishes and submits; nothing is pushed or posted by this build. |

## Covered calls

The full testnet loop now runs without outside funding: tUSDC (Hako test) replaces Tidepool USDC, and a signed Coinbase relayer price replaces Pyth. See README "It earned". What remains:

| Item | Exact input or work needed | Current behavior |
| --- | --- | --- |
| Mainnet price oracle | Verify a live BTC price from the Rhea oracle `priceoracle.near` (or another NEAR mainnet oracle) and point `settle_call` at it for mainnet | A mainnet read on 2026-11-09 returned `null` for every asset, including bridged WBTC ([evidence](deployments/rhea-oracle-mainnet-2026-11-09.json)). Testnet uses the relayer, labelled "relayer price (testnet)". |
| Real USDC premiums | Mainnet deployment review plus a real NEP-141 USDC (e.g. native USDC on NEAR) via `set_call_config` | Testnet premiums are tUSDC (Hako test), a no-value token minted by its own account. |
| Relayer trust | A multi-signer or oracle-network price for production | One ed25519 relayer key is trusted on testnet. The contract checks its signature, the allow-listed source, the timing and monotonic posts, but it cannot check that the HTTP body really said that price. |
| Exercise-window lapse, option transfer before exercise | A run that waits 24 h after an ITM settlement; a run with `option_transfer` before expiry | Code paths are unchanged and untested on testnet in this loop. |
| Full option NEP-171 interoperability | NFT core ownership, token view, enumeration, events, and marketplace approval for option claim tokens | `option_transfer` changes the holder on NEAR; it is not a complete NEP-171 option NFT. |
| Contract-proven Bitcoin collateral | A Bitcoin inclusion/UTXO proof verified on NEAR, or a separately audited trust model | The writer ML-DSA-signs an outpoint and amount. The demo and browser check Bitcoin Core, but the contract cannot independently prove the assertion. |
| Public Bitcoin network | `BITCOIN_TESTNET4_FUNDED_ADDRESS` with funded testnet4 UTXOs | Collateral and exercise use Bitcoin Core regtest. |
| Auto-compound premium to native BTC | `NEAR_MAINNET_ACCOUNT`, funded mainnet USDC, a live 1Click swap, and mainnet deployment review | Only `dry: true` mainnet USDC→BTC quote previews are available. No mainnet swap runs. |
| Any-chain deposit into native BTC | `NEAR_MAINNET_ACCOUNT`, funded origin assets, and a live 1Click quote/deposit after explicit mainnet authorization | The SDK, web, and MCP request real `dry: true` quotes. A dry quote has no deposit address and cannot receive funds. |
| Browser settlement | A relayer endpoint that serves its signed prints | The web app shows settlement state but does not settle. `settle_call` needs the relayer's signed print, which the CLI scripts hold. |

The inheritance claim path requires the configured deadline plus delay to pass on a live chain; early and wrong-heir rejections are in the NEAR sandbox record, and the successful claim path is covered by a Rust unit test with an advanced block timestamp.
