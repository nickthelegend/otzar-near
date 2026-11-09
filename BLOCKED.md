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
| Browser screenshot at 375px | Working browser automation host | Vite production build and responsive CSS checks pass; the connected browser host reported unavailable, so interactive screenshot and overflow measurement remain unverified. |
| Browser Bitcoin balances/broadcast | `VITE_BITCOIN_ESPLORA_URL` pointing at the local Bitcoin proxy or a compatible live service | The UI displays `Setup required: VITE_BITCOIN_ESPLORA_URL`. |
| Browser Solana balances/broadcast | Local `solana-test-validator` at `VITE_SOLANA_RPC_URL` (default `http://127.0.0.1:8899`) | The UI displays `Setup required: VITE_SOLANA_RPC_URL` if the validator is stopped. The CLI e2e was confirmed on a real local validator. |
| Browser NEAR contract | `VITE_HAKO_CONTRACT` | The UI displays `Setup required: VITE_HAKO_CONTRACT`. |
| MCP writes | `NEAR_TESTNET_ACCOUNT`, `NEAR_TESTNET_KEY`, `ML_DSA_KEY_FILE`; Bitcoin also needs `BITCOIN_ESPLORA_URL` | Read tool works with `HAKO_CONTRACT_ID`; write tools return a named setup error. |
| Public hackathon submission | Public repository URL, public demo post URL, lead/contact/payout/consent fields in `HACKATHON_SUBMISSION_FORM.md` | Local Git only. Nick publishes and submits; nothing is pushed or posted by this build. |

`NEAR_MAINNET_ACCOUNT` and `ONECLICK_JWT` are optional placeholders for future work. Hako does not use Intents or mainnet funds and does not request either credential for its working flow. The inheritance claim path requires the configured deadline plus delay to pass on a live chain; early and wrong-heir rejections are in the NEAR sandbox record, and the successful claim path is covered by a Rust unit test with an advanced block timestamp.
