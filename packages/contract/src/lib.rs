use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::{env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise};
use std::collections::BTreeMap;
mod btc;

const NS_SEC: u64 = 1_000_000_000;
const MPC_GAS: Gas = Gas::from_tgas(40);
const CALLBACK_GAS: Gas = Gas::from_tgas(15);
const ML_PK_LEN: usize = 1952;
const ML_SIG_LEN: usize = 3309;

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Policy {
    pub daily_eth_wei: U128,
    #[serde(default)]
    pub delay_sec: u64,
    pub allow_eth: Vec<String>,
    pub guardian: AccountId,
    pub recovery_eth: String,
    pub emergency_migration: Option<String>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Spend {
    pub id: u64,
    pub token_id: String,
    pub raw_unsigned_hex: String,
    pub destination: String,
    pub amount_wei: U128,
    pub sighash_hex: String,
    pub created_ns: u64,
    pub ready_ns: u64,
    pub state: String,
    pub signature_json: Option<String>,
    pub clawback: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct BoxToken {
    pub token_id: String,
    pub owner_id: AccountId,
    pub epoch: u64,
    pub policy: Policy,
    pub pq_key: Option<Vec<u8>>,
    pub nonce: u64,
    pub spent_today_wei: U128,
    pub day_index: u64,
    pub listed_yocto: Option<U128>,
    pub ever_signed: bool,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct GuardianConfig {
    pub keys: Vec<Base64VecU8>,
    pub threshold: u8,
    pub timelock_sec: u64,
    pub recovery_nonce: u64,
    pub pending_key: Option<Base64VecU8>,
    pub ready_ns: Option<u64>,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct Inheritance {
    pub heir: AccountId,
    pub deadline_ns: u64,
    pub delay_sec: u64,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct SolSpend {
    pub message_hex: String,
    pub destination: Base64VecU8,
    pub lamports: U128,
    pub ready_ns: u64,
    pub state: String,
    pub signature_json: Option<String>,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct SolState { pub public_key: Base64VecU8, pub spend: Option<SolSpend> }

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Hako {
    pub tokens: BTreeMap<String, BoxToken>,
    pub spends: BTreeMap<u64, Spend>,
    pub next_spend: u64,
    pub mpc_contract: AccountId,
}

#[near]
impl Hako {
    #[init]
    pub fn new(mpc_contract: AccountId) -> Self {
        require!(mpc_contract.as_str() == "v1.signer-prod.testnet" || mpc_contract.as_str().ends_with(".testnet"), "testnet MPC required");
        Self { tokens: BTreeMap::new(), spends: BTreeMap::new(), next_spend: 0, mpc_contract }
    }

    pub fn mint(&mut self, token_id: String, mut policy: Policy) -> BoxToken {
        require!(!token_id.is_empty() && token_id.len() <= 64 && token_id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-'), "invalid token id");
        require!(!self.tokens.contains_key(&token_id), "token exists");
        if policy.delay_sec == 0 { policy.delay_sec = 86_400; }
        validate_policy(&policy);
        let token = BoxToken { token_id: token_id.clone(), owner_id: env::predecessor_account_id(), epoch: 0, policy, pq_key: None, nonce: 0, spent_today_wei: U128(0), day_index: env::block_timestamp() / (86_400 * NS_SEC), listed_yocto: None, ever_signed: false };
        self.tokens.insert(token_id, token.clone());
        token
    }

    pub fn register_pq_key(&mut self, token_id: String, key: Base64VecU8) {
        let t = self.token_mut(&token_id);
        require!(t.owner_id == env::predecessor_account_id(), "owner only");
        require!(t.pq_key.is_none(), "key already registered");
        require!(key.0.len() == ML_PK_LEN, "ML-DSA-65 public key must be 1952 bytes");
        t.pq_key = Some(key.0);
    }

    pub fn set_policy(&mut self, token_id: String, mut policy: Policy, nonce: u64, signature: Base64VecU8) {
        let policy_bytes = near_sdk::serde_json::to_vec(&policy).expect("policy JSON");
        if policy.delay_sec == 0 { policy.delay_sec = 86_400; }
        validate_policy(&policy);
        let t = self.token_mut(&token_id);
        require!(t.owner_id == env::predecessor_account_id(), "owner only");
        verify_pq(t, nonce, &policy_bytes, &signature.0);
        t.policy = policy;
        t.nonce += 1;
    }

    pub fn request_eth_spend(&mut self, token_id: String, raw_unsigned_hex: String, nonce: u64, signature: Base64VecU8) -> Spend {
        require!(!inheritance_claimable(&token_id), "heir claim window reached");
        let bytes = hex_decode(&raw_unsigned_hex);
        let (chain_id, destination, amount) = parse_eth_tx(&bytes);
        require!(chain_id == 31337 || chain_id == 11155111, "only Anvil or Sepolia chain id");
        let now = env::block_timestamp();
        require!(!self_pending_for(&token_id, &self.spends), "pending spend exists");
        let t = self.token_mut(&token_id);
        require!(t.owner_id == env::predecessor_account_id(), "owner only");
        require!(t.listed_yocto.is_none(), "listed box cannot spend");
        require!(t.policy.recovery_eth != "0x0000000000000000000000000000000000000000", "Setup required: set_policy after transfer");
        verify_pq(t, nonce, &bytes, &signature.0);
        apply_daily_cap(t, amount, now);
        let delay = if t.policy.allow_eth.iter().any(|a| a.eq_ignore_ascii_case(&destination)) { 0 } else { t.policy.delay_sec };
        t.nonce += 1;
        let spend = Spend { id: self.next_spend, token_id, raw_unsigned_hex, destination, amount_wei: U128(amount), sighash_hex: hex_encode(&env::keccak256(&bytes)), created_ns: now, ready_ns: now + delay * NS_SEC, state: "pending".into(), signature_json: None, clawback: false };
        self.spends.insert(spend.id, spend.clone());
        self.next_spend += 1;
        spend
    }

    pub fn guardian_clawback_eth(&mut self, spend_id: u64, recovery_tx_hex: String) -> Spend {
        let old = self.spends.get(&spend_id).expect("spend not found").clone();
        require!(!inheritance_claimable(&old.token_id), "heir claim window reached");
        require!(old.state == "pending" && env::block_timestamp() < old.ready_ns, "clawback window closed");
        let bytes = hex_decode(&recovery_tx_hex);
        let (chain_id, destination, amount) = parse_eth_tx(&bytes);
        require!(chain_id == 31337 || chain_id == 11155111, "only Anvil or Sepolia");
        let t = self.tokens.get_mut(&old.token_id).expect("token not found");
        require!(t.policy.guardian == env::predecessor_account_id(), "guardian only");
        require!(destination.eq_ignore_ascii_case(&t.policy.recovery_eth), "recovery destination only");
        require!(amount > 0, "empty recovery");
        self.spends.get_mut(&spend_id).unwrap().state = "cancelled".into();
        let spend = Spend { id: self.next_spend, token_id: old.token_id, raw_unsigned_hex: recovery_tx_hex, destination, amount_wei: U128(amount), sighash_hex: hex_encode(&env::keccak256(&bytes)), created_ns: env::block_timestamp(), ready_ns: env::block_timestamp(), state: "pending".into(), signature_json: None, clawback: true };
        self.spends.insert(spend.id, spend.clone());
        self.next_spend += 1;
        spend
    }

    pub fn execute_eth(&mut self, spend_id: u64) -> Promise {
        let token_id = self.spends.get(&spend_id).expect("spend not found").token_id.clone();
        require!(!inheritance_claimable(&token_id), "heir claim window reached");
        let spend = self.spends.get_mut(&spend_id).expect("spend not found");
        require!(spend.state == "pending", "not pending");
        require!(env::block_timestamp() >= spend.ready_ns, "delay active");
        let t = self.tokens.get_mut(&spend.token_id).expect("token not found");
        require!(spend.clawback || t.pq_key.is_some(), "quantum lock required");
        spend.state = "signing".into();
        t.ever_signed = true;
        let path = format!("hako/{}/{}", spend.token_id, t.epoch);
        let args = near_sdk::serde_json::json!({"request":{"payload_v2":{"Ecdsa":spend.sighash_hex},"path":path,"domain_id":0}});
        Promise::new(self.mpc_contract.clone())
            .function_call("sign", near_sdk::serde_json::to_vec(&args).unwrap(), NearToken::from_yoctonear(1), MPC_GAS)
            .then(Promise::new(env::current_account_id()).function_call("on_eth_signed", near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({"spend_id":spend_id})).unwrap(), NearToken::from_yoctonear(0), CALLBACK_GAS))
    }

    #[private]
    pub fn on_eth_signed(&mut self, spend_id: u64) {
        let spend = self.spends.get_mut(&spend_id).expect("spend not found");
        require!(spend.state == "signing", "not signing");
        match env::promise_result_checked(0, 4096) {
            Ok(bytes) => {
                spend.signature_json = Some(String::from_utf8(bytes).expect("MPC response UTF-8"));
                spend.state = "signed".into();
            }
            _ => { spend.state = "failed".into(); }
        }
    }

    pub fn list(&mut self, token_id: String, price: U128) {
        require!(!inheritance_claimable(&token_id), "heir claim window reached");
        require!(price.0 > 0, "price must be positive");
        require!(!self_pending_for(&token_id, &self.spends), "pending spend exists");
        require!(!btc::btc_pending(&token_id), "pending Bitcoin spend exists");
        require!(!sol_pending(&token_id), "pending Solana spend exists");
        let t = self.token_mut(&token_id);
        require!(t.owner_id == env::predecessor_account_id(), "owner only");
        require!(!t.ever_signed, "box has issued a signature; cannot safely resell");
        t.listed_yocto = Some(price);
    }

    pub fn unlist(&mut self, token_id: String) {
        let t = self.token_mut(&token_id);
        require!(t.owner_id == env::predecessor_account_id(), "owner only");
        t.listed_yocto = None;
    }

    #[payable]
    pub fn buy(&mut self, token_id: String) -> Promise {
        require!(!inheritance_claimable(&token_id), "heir claim window reached");
        require!(!self_pending_for(&token_id, &self.spends), "pending spend exists");
        require!(!btc::btc_pending(&token_id), "pending Bitcoin spend exists");
        require!(!sol_pending(&token_id), "pending Solana spend exists");
        let t = self.token_mut(&token_id);
        require!(!t.ever_signed, "box has issued a signature; cannot safely resell");
        let price = t.listed_yocto.expect("not listed").0;
        require!(env::attached_deposit().as_yoctonear() == price, "wrong payment");
        let seller = t.owner_id.clone();
        t.owner_id = env::predecessor_account_id();
        t.pq_key = None;
        t.nonce = 0;
        t.listed_yocto = None;
        t.spent_today_wei = U128(0);
        t.policy.guardian = t.owner_id.clone();
        t.policy.recovery_eth = "0x0000000000000000000000000000000000000000".into();
        t.policy.allow_eth.clear();
        btc::clear(&token_id);
        clear_extensions(&token_id);
        Promise::new(seller).transfer(NearToken::from_yoctonear(price))
    }

    #[payable]
    pub fn nft_transfer(&mut self, receiver_id: AccountId, token_id: String) {
        require!(!inheritance_claimable(&token_id), "heir claim window reached");
        require!(env::attached_deposit().as_yoctonear() == 1, "one yocto required");
        require!(!self.spends.values().any(|s|s.token_id==token_id && s.clawback && s.state=="pending"),"guardian recovery active");
        require!(!btc::btc_guardian_pending(&token_id),"Bitcoin guardian recovery active");
        require!(!sol_pending(&token_id), "pending Solana spend exists");
        let t = self.tokens.get(&token_id).expect("token not found");
        require!(t.owner_id == env::predecessor_account_id(), "owner only");
        require!(!t.ever_signed, "box has issued a signature; cannot safely transfer");
        require!(receiver_id != t.owner_id, "same owner");
        for s in self.spends.values_mut().filter(|s|s.token_id==token_id && s.state=="pending") {s.state="cancelled".into();}
        btc::void_pending(&token_id);
        btc::clear(&token_id);
        clear_extensions(&token_id);
        let t = self.token_mut(&token_id);
        t.owner_id = receiver_id;
        t.pq_key = None;
        t.nonce = 0;
        t.listed_yocto = None;
        t.policy.guardian = t.owner_id.clone();
        t.policy.recovery_eth = "0x0000000000000000000000000000000000000000".into();
        t.policy.allow_eth.clear();
    }

    pub fn nft_token(&self, token_id: String) -> Option<BoxToken> { self.tokens.get(&token_id).cloned() }
    pub fn nft_total_supply(&self) -> U128 { U128(self.tokens.len() as u128) }
    pub fn nft_tokens(&self, from_index: Option<u64>, limit: Option<u64>) -> Vec<BoxToken> { self.tokens.values().skip(from_index.unwrap_or(0) as usize).take(limit.unwrap_or(50).min(100) as usize).cloned().collect() }
    pub fn nft_tokens_for_owner(&self, account_id: AccountId) -> Vec<BoxToken> { self.tokens.values().filter(|t| t.owner_id == account_id).cloned().collect() }
    pub fn nft_metadata(&self) -> near_sdk::serde_json::Value { near_sdk::serde_json::json!({"spec":"nft-1.0.0","name":"Hako","symbol":"HAKO"}) }
    pub fn spend(&self, spend_id: u64) -> Option<Spend> { self.spends.get(&spend_id).cloned() }
    pub fn spends_for_box(&self, token_id: String) -> Vec<Spend> { self.spends.values().filter(|s| s.token_id == token_id).cloned().collect() }
    pub fn derivation_path(&self, token_id: String, chain: String) -> String { let t = self.tokens.get(&token_id).expect("token not found"); require!(chain == "ethereum" || chain == "bitcoin", "chain"); format!("hako/{}/{}", token_id, t.epoch) }

    pub fn guardian_config(&self, token_id: String) -> Option<GuardianConfig> { stored(&extension_key("guardians", &token_id)) }
    pub fn inheritance(&self, token_id: String) -> Option<Inheritance> { stored(&extension_key("inheritance", &token_id)) }
    pub fn sol_state(&self, token_id: String) -> Option<SolState> { stored(&extension_key("solana", &token_id)) }

    pub fn register_sol(&mut self, token_id: String, public_key: Base64VecU8, nonce: u64, signature: Base64VecU8) {
        require!(public_key.0.len() == 32, "Solana public key length");
        require!(self.sol_state(token_id.clone()).is_none(), "Solana address already registered");
        let t = self.token_mut(&token_id);
        require!(t.owner_id == env::predecessor_account_id(), "owner only");
        require!(!t.ever_signed, "signed vault cannot change Solana key");
        verify_pq(t, nonce, &public_key.0, &signature.0);
        save(&extension_key("solana", &token_id), &SolState { public_key, spend: None });
        t.nonce += 1;
    }

    pub fn request_sol_spend(&mut self, token_id: String, message_hex: String, nonce: u64, signature: Base64VecU8) {
        require!(!inheritance_claimable(&token_id), "heir claim window reached");
        require!(!self_pending_for(&token_id, &self.spends) && !btc::btc_pending(&token_id), "pending spend exists");
        let mut state: SolState = self.sol_state(token_id.clone()).expect("Setup required: register_sol");
        require!(!sol_pending(&token_id), "pending Solana spend exists");
        let message = hex_decode(&message_hex);
        let (sender, destination, lamports) = parse_sol_transfer(&message);
        require!(sender == state.public_key.0, "unregistered Solana source");
        let t = self.token_mut(&token_id);
        require!(t.owner_id == env::predecessor_account_id(), "owner only");
        require!(t.listed_yocto.is_none(), "listed box cannot spend");
        verify_pq(t, nonce, &message, &signature.0);
        t.nonce += 1;
        state.spend = Some(SolSpend { message_hex, destination: Base64VecU8(destination), lamports: U128(lamports as u128), ready_ns: env::block_timestamp(), state: "pending".into(), signature_json: None });
        save(&extension_key("solana", &token_id), &state);
    }

    pub fn execute_sol(&mut self, token_id: String) -> Promise {
        require!(!inheritance_claimable(&token_id), "heir claim window reached");
        let mut state: SolState = self.sol_state(token_id.clone()).expect("Solana address not registered");
        let spend = state.spend.as_mut().expect("no Solana spend");
        require!(spend.state == "pending", "Solana spend not pending");
        require!(env::block_timestamp() >= spend.ready_ns, "delay active");
        let t = self.token_mut(&token_id);
        require!(t.pq_key.is_some(), "quantum lock required");
        t.ever_signed = true;
        spend.state = "signing".into();
        let args = near_sdk::serde_json::json!({"request":{"payload_v2":{"Eddsa":spend.message_hex},"path":format!("hako/{}/{}",token_id,t.epoch),"domain_id":1}});
        save(&extension_key("solana", &token_id), &state);
        Promise::new(self.mpc_contract.clone()).function_call("sign", near_sdk::serde_json::to_vec(&args).unwrap(), NearToken::from_yoctonear(1), MPC_GAS)
            .then(Promise::new(env::current_account_id()).function_call("on_sol_signed", near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({"token_id":token_id})).unwrap(), NearToken::from_yoctonear(0), CALLBACK_GAS))
    }

    #[private]
    pub fn on_sol_signed(&mut self, token_id: String) {
        let mut state: SolState = self.sol_state(token_id.clone()).expect("Solana state missing");
        let spend = state.spend.as_mut().expect("Solana spend missing");
        require!(spend.state == "signing", "Solana spend not signing");
        match env::promise_result_checked(0, 4096) {
            Ok(bytes) => { let value: near_sdk::serde_json::Value = near_sdk::serde_json::from_slice(&bytes).unwrap_or_default(); if value["scheme"] == "Ed25519" && value["signature"].as_array().is_some_and(|a| a.len() == 64) { spend.signature_json = Some(String::from_utf8(bytes).expect("MPC response UTF-8")); spend.state = "signed".into(); } else { spend.state = "failed".into(); } }
            _ => { spend.state = "failed".into(); }
        }
        save(&extension_key("solana", &token_id), &state);
    }

    pub fn set_guardians(&mut self, token_id: String, keys: Vec<Base64VecU8>, threshold: u8, timelock_sec: u64, nonce: u64, signature: Base64VecU8) {
        require!(!self_pending_for(&token_id, &self.spends) && !btc::btc_pending(&token_id) && !sol_pending(&token_id), "pending spend exists");
        require!((1..=5).contains(&keys.len()) && threshold >= 2 && threshold as usize <= keys.len(), "guardian threshold");
        require!((120..=30 * 86_400).contains(&timelock_sec), "recovery timelock range");
        require!(keys.iter().all(|k| k.0.len() == ML_PK_LEN), "guardian ML-DSA key length");
        for i in 0..keys.len() { for j in 0..i { require!(keys[i].0 != keys[j].0, "duplicate guardian"); } }
        let payload = guardian_config_payload(&token_id, &keys, threshold, timelock_sec);
        let t = self.token_mut(&token_id);
        require!(t.owner_id == env::predecessor_account_id(), "owner only");
        verify_pq(t, nonce, &payload, &signature.0);
        let old: Option<GuardianConfig> = stored(&extension_key("guardians", &token_id));
        let config = GuardianConfig { keys, threshold, timelock_sec, recovery_nonce: old.map_or(0, |c| c.recovery_nonce + 1), pending_key: None, ready_ns: None };
        save(&extension_key("guardians", &token_id), &config);
        t.nonce += 1;
    }

    pub fn initiate_pq_recovery(&mut self, token_id: String, new_key: Base64VecU8, approvals: Vec<Base64VecU8>) {
        require!(new_key.0.len() == ML_PK_LEN, "new ML-DSA key length");
        require!(!self_pending_for(&token_id, &self.spends) && !btc::btc_pending(&token_id) && !sol_pending(&token_id), "pending spend exists");
        let mut config: GuardianConfig = stored(&extension_key("guardians", &token_id)).expect("guardians not configured");
        require!(config.pending_key.is_none(), "recovery already pending");
        require!(approvals.len() == config.keys.len(), "one approval slot per guardian");
        let t = self.tokens.get(&token_id).expect("token not found");
        require!(t.pq_key.as_ref() != Some(&new_key.0), "same authority key");
        let message = recovery_message(&token_id, &t.owner_id, config.recovery_nonce, &new_key.0);
        let mut count = 0;
        for (key, signature) in config.keys.iter().zip(&approvals) {
            if signature.0.is_empty() { continue; }
            require!(signature.0.len() == ML_SIG_LEN, "guardian signature length");
            require!(env::ml_dsa_verify(signature.0.as_slice().try_into().unwrap(), &message, key.0.as_slice().try_into().unwrap()), "invalid guardian approval");
            count += 1;
        }
        require!(count >= config.threshold, "guardian threshold not met");
        config.pending_key = Some(new_key);
        config.ready_ns = Some(env::block_timestamp() + config.timelock_sec * NS_SEC);
        config.recovery_nonce += 1;
        save(&extension_key("guardians", &token_id), &config);
    }

    pub fn finalize_pq_recovery(&mut self, token_id: String) {
        let mut config: GuardianConfig = stored(&extension_key("guardians", &token_id)).expect("guardians not configured");
        let ready = config.ready_ns.expect("no pending recovery");
        require!(env::block_timestamp() >= ready, "recovery timelock active");
        require!(!self_pending_for(&token_id, &self.spends) && !btc::btc_pending(&token_id) && !sol_pending(&token_id), "pending spend exists");
        let t = self.token_mut(&token_id);
        t.pq_key = Some(config.pending_key.take().expect("no pending key").0);
        t.nonce += 1;
        config.ready_ns = None;
        save(&extension_key("guardians", &token_id), &config);
    }

    pub fn cancel_pq_recovery(&mut self, token_id: String, nonce: u64, signature: Base64VecU8) {
        let t = self.token_mut(&token_id);
        require!(t.owner_id == env::predecessor_account_id(), "owner only");
        verify_pq(t, nonce, b"cancel-pq-recovery", &signature.0);
        let mut config: GuardianConfig = stored(&extension_key("guardians", &token_id)).expect("guardians not configured");
        require!(config.pending_key.is_some(), "no pending recovery");
        config.pending_key = None; config.ready_ns = None; config.recovery_nonce += 1;
        save(&extension_key("guardians", &token_id), &config);
        t.nonce += 1;
    }

    pub fn set_inheritance(&mut self, token_id: String, heir: AccountId, deadline_sec: u64, delay_sec: u64, nonce: u64, signature: Base64VecU8) {
        require!(!inheritance_claimable(&token_id), "heir claim window reached");
        let now = env::block_timestamp() / NS_SEC;
        require!(deadline_sec >= now + 86_400 && deadline_sec <= now + 10 * 365 * 86_400, "inheritance deadline range");
        require!((86_400..=30 * 86_400).contains(&delay_sec), "inheritance delay range");
        let payload = format!("inheritance:v1:{token_id}:{heir}:{deadline_sec}:{delay_sec}");
        let t = self.token_mut(&token_id);
        require!(t.owner_id == env::predecessor_account_id() && heir != t.owner_id, "owner and distinct heir required");
        require!(!t.ever_signed, "signed vault cannot transfer");
        verify_pq(t, nonce, payload.as_bytes(), &signature.0);
        save(&extension_key("inheritance", &token_id), &Inheritance { heir, deadline_ns: deadline_sec * NS_SEC, delay_sec });
        t.nonce += 1;
    }

    pub fn check_in(&mut self, token_id: String, nonce: u64, signature: Base64VecU8) {
        let mut inheritance: Inheritance = stored(&extension_key("inheritance", &token_id)).expect("inheritance not configured");
        let t = self.token_mut(&token_id);
        require!(t.owner_id == env::predecessor_account_id(), "owner only");
        verify_pq(t, nonce, b"inheritance-check-in", &signature.0);
        require!(env::block_timestamp() < inheritance.deadline_ns + inheritance.delay_sec * NS_SEC, "claim window reached");
        inheritance.deadline_ns = inheritance.deadline_ns.max(env::block_timestamp() + 30 * 86_400 * NS_SEC);
        save(&extension_key("inheritance", &token_id), &inheritance);
        t.nonce += 1;
    }

    pub fn cancel_inheritance(&mut self, token_id: String, nonce: u64, signature: Base64VecU8) {
        require!(!inheritance_claimable(&token_id), "heir claim window reached");
        let t = self.token_mut(&token_id);
        require!(t.owner_id == env::predecessor_account_id(), "owner only");
        verify_pq(t, nonce, b"inheritance-cancel", &signature.0);
        require!(env::storage_remove(&extension_key("inheritance", &token_id)), "inheritance not configured");
        t.nonce += 1;
    }

    pub fn claim_inheritance(&mut self, token_id: String) {
        let inheritance: Inheritance = stored(&extension_key("inheritance", &token_id)).expect("inheritance not configured");
        require!(inheritance.heir == env::predecessor_account_id(), "heir only");
        require!(env::block_timestamp() >= inheritance.deadline_ns + inheritance.delay_sec * NS_SEC, "inheritance delay active");
        require!(!self.tokens.get(&token_id).expect("token not found").ever_signed, "signed vault cannot transfer");
        for spend in self.spends.values_mut().filter(|s| s.token_id == token_id && s.state == "pending") { spend.state = "cancelled".into(); }
        btc::void_pending(&token_id);
        let t = self.token_mut(&token_id);
        t.owner_id = inheritance.heir; t.pq_key = None; t.nonce = 0; t.listed_yocto = None;
        t.policy.guardian = t.owner_id.clone(); t.policy.recovery_eth = "0x0000000000000000000000000000000000000000".into(); t.policy.allow_eth.clear();
        btc::clear(&token_id); clear_extensions(&token_id);
    }
    fn token_mut(&mut self, id: &str) -> &mut BoxToken { self.tokens.get_mut(id).expect("token not found") }
}

fn extension_key(kind: &str, token_id: &str) -> Vec<u8> { format!("hako:v2:{kind}:{token_id}").into_bytes() }
fn stored<T: near_sdk::serde::de::DeserializeOwned>(key: &[u8]) -> Option<T> { env::storage_read(key).map(|v| near_sdk::serde_json::from_slice(&v).expect("extension storage JSON")) }
fn save<T: near_sdk::serde::Serialize>(key: &[u8], value: &T) { env::storage_write(key, &near_sdk::serde_json::to_vec(value).expect("extension JSON")); }
fn clear_extensions(id: &str) { env::storage_remove(&extension_key("guardians", id)); env::storage_remove(&extension_key("inheritance", id)); env::storage_remove(&extension_key("solana", id)); }
fn sol_pending(id: &str) -> bool { let state: Option<SolState> = stored(&extension_key("solana", id)); state.and_then(|s| s.spend).is_some_and(|s| s.state == "pending" || s.state == "signing") }
fn inheritance_claimable(id: &str) -> bool { let policy: Option<Inheritance> = stored(&extension_key("inheritance", id)); policy.is_some_and(|p| env::block_timestamp() >= p.deadline_ns + p.delay_sec * NS_SEC) }
fn parse_sol_transfer(message: &[u8]) -> (Vec<u8>, Vec<u8>, u64) {
    require!(message.len() == 150 && message[0..4] == [1,0,1,3], "simple Solana transfer message required");
    let sender = message[4..36].to_vec(); let destination = message[36..68].to_vec();
    require!(message[68..100].iter().all(|b| *b == 0), "system program required");
    require!(message[132..142] == [1,2,2,0,1,12,2,0,0,0], "only SystemProgram transfer");
    let lamports = u64::from_le_bytes(message[142..150].try_into().unwrap());
    require!(lamports > 0 && sender != destination, "invalid Solana transfer");
    (sender, destination, lamports)
}
fn guardian_config_payload(id: &str, keys: &[Base64VecU8], threshold: u8, timelock: u64) -> Vec<u8> { let mut p = format!("guardians:v1:{id}:{threshold}:{timelock}:").into_bytes(); for k in keys { p.extend_from_slice(&env::sha256(&k.0)); } p }
fn recovery_message(id: &str, owner: &AccountId, nonce: u64, new_key: &[u8]) -> [u8;32] { env::sha256(format!("hako:recover:v1:{id}:{owner}:{nonce}:{}", hex_encode(&env::sha256(new_key))).as_bytes()).try_into().unwrap() }

fn self_pending_for(id: &str, spends: &BTreeMap<u64, Spend>) -> bool { spends.values().any(|s| s.token_id == id && (s.state == "pending" || s.state == "signing")) }
fn validate_policy(p: &Policy) { require!(p.delay_sec >= 120 && p.delay_sec <= 7 * 86_400, "delay range 120s..7d"); require!(p.daily_eth_wei.0 > 0, "daily cap required"); require!(is_address(&p.recovery_eth) && p.recovery_eth != "0x0000000000000000000000000000000000000000", "recovery ETH address"); require!(p.allow_eth.len() <= 32 && p.allow_eth.iter().all(|a| is_address(a)), "allowlist ETH address"); if let Some(a) = &p.emergency_migration { require!(!a.is_empty() && a.len() <= 128, "migration destination"); } }
fn verify_pq(t: &BoxToken, nonce: u64, request: &[u8], signature: &[u8]) { let pk = t.pq_key.as_ref().expect("Setup required: ML_DSA_KEY"); require!(nonce == t.nonce, "bad nonce"); require!(signature.len() == ML_SIG_LEN, "bad signature length"); let message = format!("hako:v1:{}:{}:{}", t.token_id, nonce, hex_encode(&env::sha256(request))); let digest = env::sha256(message.as_bytes()); require!(env::ml_dsa_verify(signature.try_into().unwrap(), &digest, pk.as_slice().try_into().unwrap()), "bad ML-DSA signature"); }
fn apply_daily_cap(t: &mut BoxToken, amount: u128, now: u64) { let day = now / (86_400 * NS_SEC); if t.day_index != day { t.day_index = day; t.spent_today_wei = U128(0); } let new = t.spent_today_wei.0.checked_add(amount).expect("cap overflow"); require!(new <= t.policy.daily_eth_wei.0, "daily cap exceeded"); t.spent_today_wei = U128(new); }
fn is_address(s: &str) -> bool { s.len() == 42 && s.starts_with("0x") && s[2..].bytes().all(|c| c.is_ascii_hexdigit()) }
fn hex_encode(b: &[u8]) -> String { b.iter().map(|v| format!("{:02x}", v)).collect() }
fn hex_decode(s: &str) -> Vec<u8> { let s = s.strip_prefix("0x").unwrap_or(s); require!(s.len() % 2 == 0 && s.len() <= 8192, "invalid hex size"); (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i+2],16).expect("invalid hex")).collect() }

// Strict subset of EIP-1559: transfer-only, empty calldata and access list.
fn parse_eth_tx(raw: &[u8]) -> (u64, String, u128) {
    require!(raw.first() == Some(&2u8), "EIP-1559 type 2 required");
    let (list, used, is_list) = rlp_item(&raw[1..]);
    require!(is_list && used + 1 == raw.len(), "invalid transaction RLP");
    let mut fields = Vec::new(); let mut at = 0;
    while at < list.len() { let (v,n,l) = rlp_item(&list[at..]); fields.push((v,l)); at += n; }
    require!(fields.len() == 9, "unsigned EIP-1559 must have nine fields");
    require!(fields.iter().take(8).all(|x| !x.1) && fields[8].1 && fields[8].0.is_empty(), "only simple ETH transfer");
    require!(fields[5].0.len() == 20, "destination required");
    require!(fields[7].0.is_empty(), "calldata forbidden");
    let chain = uint(fields[0].0); let amount = uint(fields[6].0);
    require!(chain <= u64::MAX as u128 && amount > 0, "chain id or amount");
    require!(uint(fields[4].0) >= 21_000 && uint(fields[4].0) <= 30_000, "gas limit");
    require!(uint(fields[2].0) <= uint(fields[3].0), "priority exceeds max fee");
    (chain as u64, format!("0x{}",hex_encode(fields[5].0)), amount)
}
fn uint(b: &[u8]) -> u128 { require!(b.len() <= 16 && (b.is_empty() || b[0] != 0), "invalid integer"); b.iter().fold(0u128, |n,v| (n<<8)|*v as u128) }
fn rlp_item(b: &[u8]) -> (&[u8], usize, bool) { require!(!b.is_empty(), "truncated RLP"); let p=b[0]; if p <= 0x7f { return (&b[..1],1,false); } let (len,off,list) = if p<=0xb7 {(p as usize-0x80,1,false)} else if p<=0xbf { let n=p as usize-0xb7; require!(n<=4 && b.len()>n,"RLP length"); let len=b[1..1+n].iter().fold(0usize,|v,x|(v<<8)|*x as usize); require!(len>=56,"noncanonical RLP"); (len,1+n,false) } else if p<=0xf7 {(p as usize-0xc0,1,true)} else {let n=p as usize-0xf7; require!(n<=4 && b.len()>n,"RLP length"); let len=b[1..1+n].iter().fold(0usize,|v,x|(v<<8)|*x as usize); require!(len>=56,"noncanonical RLP"); (len,1+n,true)}; require!(b.len()>=off+len,"truncated RLP"); if !list && len==1 { require!(b[off]>=0x80,"noncanonical byte"); } (&b[off..off+len],off+len,list) }

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    const ETH_TX: &str = "02eb827a6980843b9aca0084773594008252089411111111111111111111111111111111111111118203e880c0";
    fn context(account: &str, deposit: u128) { let mut b=VMContextBuilder::new(); b.predecessor_account_id(account.parse().unwrap()).attached_deposit(NearToken::from_yoctonear(deposit)); testing_env!(b.build()); }
    fn policy() -> Policy { Policy {daily_eth_wei:U128(10_000),delay_sec:120,allow_eth:vec!["0x1111111111111111111111111111111111111111".into()],guardian:"guardian.testnet".parse().unwrap(),recovery_eth:"0x2222222222222222222222222222222222222222".into(),emergency_migration:None} }

    #[test]
    fn parses_viem_eip1559_and_hashes_exact_bytes() {
        context("owner.testnet",0);
        let raw=hex_decode(ETH_TX);
        assert_eq!(parse_eth_tx(&raw),(31337,"0x1111111111111111111111111111111111111111".into(),1000));
        assert_eq!(hex_encode(&env::keccak256(&raw)),"ca19eea204c3bee7eedd4f0b97eab95442f75053f1acb0c40642226987dd6c38");
    }

    #[test]
    fn rejects_calldata_and_noncanonical_rlp() {
        context("owner.testnet",0);
        let mut raw=hex_decode(ETH_TX);
        let index=raw.len()-2; raw[index]=0x01;
        assert!(std::panic::catch_unwind(||parse_eth_tx(&raw)).is_err());
        assert!(std::panic::catch_unwind(||parse_eth_tx(&[2,0xc1,0x81])).is_err());
    }

    #[test]
    fn mint_defaults_to_one_day_and_keeps_future_migration_destination() {
        context("owner.testnet",0);
        let mut supplied=near_sdk::serde_json::to_value(policy()).unwrap();
        supplied.as_object_mut().unwrap().remove("delay_sec");
        supplied["emergency_migration"]="bip360:future-output".into();
        let policy:Policy=near_sdk::serde_json::from_value(supplied).unwrap();
        let mut c=Hako::new("v1.signer-prod.testnet".parse().unwrap());
        let box_token=c.mint("box-default".into(),policy);
        assert_eq!(box_token.policy.delay_sec,86_400);
        assert_eq!(box_token.policy.emergency_migration.as_deref(),Some("bip360:future-output"));
    }

    #[test]
    fn sale_resets_quantum_lock_and_blocks_pending() {
        context("seller.testnet",0);
        let mut c=Hako::new("v1.signer-prod.testnet".parse().unwrap());
        c.mint("box1".into(),policy());
        c.register_pq_key("box1".into(),Base64VecU8(vec![1;ML_PK_LEN]));
        c.spends.insert(0,Spend{id:0,token_id:"box1".into(),raw_unsigned_hex:ETH_TX.into(),destination:"x".into(),amount_wei:U128(1),sighash_hex:"x".into(),created_ns:0,ready_ns:1,state:"pending".into(),signature_json:None,clawback:false});
        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(||c.list("box1".into(),U128(100)))).is_err());
        c.spends.get_mut(&0).unwrap().state="cancelled".into();
        c.list("box1".into(),U128(100));
        context("buyer.testnet",100);
        let _ = c.buy("box1".into());
        let t=c.nft_token("box1".into()).unwrap();
        assert_eq!(t.owner_id.as_str(),"buyer.testnet");
        assert!(t.pq_key.is_none());
        assert_eq!(t.listed_yocto,None);
    }

    #[test]
    fn heir_claims_after_deadline_and_delay_and_resets_authority() {
        let mut b=VMContextBuilder::new();
        b.predecessor_account_id("owner.testnet".parse().unwrap()).block_timestamp(1_000_000 * NS_SEC);
        testing_env!(b.build());
        let mut c=Hako::new("v1.signer-prod.testnet".parse().unwrap());
        c.mint("inherited".into(),policy());
        c.register_pq_key("inherited".into(),Base64VecU8(vec![1;ML_PK_LEN]));
        c.spends.insert(0,Spend { id:0,token_id:"inherited".into(),raw_unsigned_hex:ETH_TX.into(),destination:"x".into(),amount_wei:U128(1),sighash_hex:"x".into(),created_ns:0,ready_ns:u64::MAX,state:"pending".into(),signature_json:None,clawback:false });
        save(&extension_key("inheritance","inherited"),&Inheritance { heir:"heir.testnet".parse().unwrap(), deadline_ns:1_086_400 * NS_SEC, delay_sec:86_400 });
        b.predecessor_account_id("heir.testnet".parse().unwrap()).block_timestamp(1_172_800 * NS_SEC);
        testing_env!(b.build());
        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| c.list("inherited".into(),U128(1)))).is_err());
        c.claim_inheritance("inherited".into());
        let token=c.nft_token("inherited".into()).unwrap();
        assert_eq!(token.owner_id.as_str(),"heir.testnet");
        assert!(token.pq_key.is_none());
        assert!(c.inheritance("inherited".into()).is_none());
        assert_eq!(c.spend(0).unwrap().state,"cancelled");
    }
}
