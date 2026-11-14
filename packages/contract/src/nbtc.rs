//! Bridged Bitcoin in a vault. Real testnet BTC crosses into NEAR through the Omni BTC connector
//! (btc-connector.n-bridge.testnet, light-client verified) and arrives as nBTC. The owner locks it
//! into a vault with `ft_transfer_call(msg = "lock:<vault>")`. It leaves only with an ML-DSA-65
//! signature from the vault's quantum-safe key, and the part backing a live covered call cannot leave.
use super::*;
use near_sdk::PromiseOrValue;

/// The live nBTC token on NEAR testnet (Omni Bridge).
const NBTC_DEFAULT: &str = "nbtc.n-bridge.testnet";
const NBTC_CFG: &[u8] = b"hako:cfg:nbtc:v1";
/// `collateral_outpoint_hex` of a covered call that is backed by locked nBTC instead of a native UTXO.
pub const NBTC_COLLATERAL: &str = "nbtc";
const FT_GAS: Gas = Gas::from_tgas(20);

#[near(serializers = [json])]
#[derive(Clone)]
pub struct NbtcVault {
    pub token: AccountId,
    /// Locked nBTC, in sats (nBTC has 8 decimals).
    pub balance_sats: U128,
    /// Sats backing the vault's live covered call; they cannot be withdrawn until it settles.
    pub encumbered_sats: U128,
    pub free_sats: U128,
}

fn bal_key(id: &str) -> Vec<u8> { format!("hako:nbtc:v1:{id}").into_bytes() }
pub fn token() -> AccountId { stored(NBTC_CFG).unwrap_or_else(|| NBTC_DEFAULT.parse().unwrap()) }
pub fn balance(id: &str) -> u128 { stored::<U128>(&bal_key(id)).map(|v| v.0).unwrap_or(0) }
pub fn set_balance(id: &str, v: u128) { save(&bal_key(id), &U128(v)) }
pub fn withdraw_payload(receiver: &AccountId, amount: u128) -> Vec<u8> { format!("withdraw-nbtc:v1:{receiver}:{amount}").into_bytes() }
fn event(name: &str, data: near_sdk::serde_json::Value) { env::log_str(&format!("EVENT_JSON:{}", near_sdk::serde_json::json!({"standard":"otzar","version":"1","event":name,"data":data}))); }

/// Called from `ft_on_transfer` when the predecessor is the nBTC token. Only the vault's owner can lock,
/// and only into a vault that already has its ML-DSA key (so the coins are quantum-locked from the start).
pub fn lock(c: &Hako, sender_id: AccountId, amount: U128, msg: &str) -> PromiseOrValue<U128> {
    let id = msg.strip_prefix("lock:").unwrap_or_else(|| env::panic_str("nBTC message must be lock:<vault>"));
    let t = c.tokens.get(id).expect("vault not found");
    require!(t.owner_id == sender_id, "vault owner only");
    require!(t.pq_key.is_some(), "Setup required: ML_DSA_KEY (lock the vault with a quantum-safe key first)");
    require!(t.listed_yocto.is_none(), "unlist the vault first");
    require!(amount.0 > 0, "amount required");
    let next = balance(id).checked_add(amount.0).expect("balance overflow");
    set_balance(id, next);
    event("nbtc_locked", near_sdk::serde_json::json!({"token_id":id,"owner":sender_id,"amount_sats":amount,"balance_sats":U128(next)}));
    PromiseOrValue::Value(U128(0))
}

#[near]
impl Hako {
    pub fn nbtc_token(&self) -> AccountId { token() }

    pub fn nbtc_vault(&self, token_id: String) -> NbtcVault {
        let b = balance(&token_id); let e = calls::nbtc_encumbered(&token_id).min(b);
        NbtcVault { token: token(), balance_sats: U128(b), encumbered_sats: U128(e), free_sats: U128(b - e) }
    }

    /// Contract account only (used by sandbox tests to point at a local NEP-141).
    #[private]
    pub fn set_nbtc_token(&mut self, token: AccountId) { save(NBTC_CFG, &token) }

    /// Moves locked nBTC out of the vault. The owner's NEAR key is not enough: the call must carry an
    /// ML-DSA-65 signature over `withdraw-nbtc:v1:<receiver>:<amount>` with the vault's current nonce.
    #[payable]
    pub fn withdraw_nbtc(&mut self, token_id: String, receiver_id: AccountId, amount: U128, nonce: Option<u64>, signature: Option<Base64VecU8>) -> Promise {
        require!(env::attached_deposit().as_yoctonear() == 1, "one yocto required");
        let free = { let v = self.nbtc_vault(token_id.clone()); v.free_sats.0 };
        let t = self.token_mut(&token_id);
        require!(t.owner_id == env::predecessor_account_id(), "vault owner only");
        let (nonce, signature) = pq_args(nonce, signature);
        require!(amount.0 > 0 && amount.0 <= free, "amount exceeds free nBTC (part may back a live covered call)");
        verify_pq(t, nonce, &withdraw_payload(&receiver_id, amount.0), &signature.0);
        t.nonce += 1;
        set_balance(&token_id, balance(&token_id) - amount.0);
        event("nbtc_withdraw", near_sdk::serde_json::json!({"token_id":token_id,"receiver_id":receiver_id,"amount_sats":amount}));
        Promise::new(token()).function_call("ft_transfer", near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({"receiver_id":receiver_id,"amount":amount,"memo":format!("Otzar withdraw {token_id}")})).unwrap(), NearToken::from_yoctonear(1), FT_GAS)
            .then(Promise::new(env::current_account_id()).function_call("on_nbtc_out", near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({"token_id":token_id,"amount":amount})).unwrap(), NearToken::from_yoctonear(0), CALLBACK_GAS))
    }

    /// Restores the vault balance if an nBTC transfer out failed.
    #[private]
    pub fn on_nbtc_out(&mut self, token_id: String, amount: U128) -> bool {
        let ok = env::promise_result_checked(0, 1024).is_ok();
        if !ok { set_balance(&token_id, balance(&token_id) + amount.0); event("nbtc_refunded", near_sdk::serde_json::json!({"token_id":token_id,"amount_sats":amount})); }
        ok
    }
}
