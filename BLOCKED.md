# Blocked and optional setup

The local regtest/Anvil and NEAR testnet demo works without a mainnet key or faucet. The following are outside the verified flow:

| Item | Exact input Nick must provide | Current behavior |
| --- | --- | --- |
| Public Bitcoin testnet4 funding | `BITCOIN_TESTNET4_FUNDED_ADDRESS`, plus access to funded testnet4 UTXOs | `scripts/demo.sh --network testnet4` exits with `Setup required`. No faucet or balance is simulated. |
| Sepolia broadcast | `SEPOLIA_RPC_URL` and funded Sepolia ETH at the Hako derived address | Not exercised; simple EIP-1559 chain ID 11155111 is accepted by the contract. |
| Browser Bitcoin balances/broadcast | `VITE_BITCOIN_ESPLORA_URL` pointing at the local Bitcoin proxy or a compatible live service | The UI displays `Setup required: VITE_BITCOIN_ESPLORA_URL`. |
| Browser NEAR contract | `VITE_HAKO_CONTRACT` | The UI displays `Setup required: VITE_HAKO_CONTRACT`. |
| MCP writes | `NEAR_TESTNET_ACCOUNT`, `NEAR_TESTNET_KEY`, `ML_DSA_KEY_FILE`; Bitcoin also needs `BITCOIN_ESPLORA_URL` | Read tool works with `HAKO_CONTRACT_ID`; write tools return a named setup error. |
| Public hackathon submission | Public repository URL, public demo post URL, lead/contact/payout/consent fields in `HACKATHON_SUBMISSION_FORM.md` | Local Git only. Nick publishes and submits; nothing is pushed or posted by this build. |

`NEAR_MAINNET_ACCOUNT` and `ONECLICK_JWT` are optional placeholders for future work. Hako does not use Intents or mainnet funds and does not request either credential for its working flow.
