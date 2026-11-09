use super::*;
use borsh::BorshDeserialize;
use near_sdk::json_types::U64;
use ripemd::{Digest, Ripemd160};

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct BtcPolicy {
    pub daily_cap_sats: U64,
    pub allow_scripts: Vec<String>,
    pub recovery_script: String,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct BtcSpend {
    pub id: u64,
    pub raw_unsigned_hex: String,
    pub prevout_sats: U64,
    pub outgoing_sats: U64,
    pub sighash_hex: String,
    pub ready_ns: u64,
    pub state: String,
    pub signature_json: Option<String>,
    pub guardian_recovery: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct BtcState {
    pub epoch: u64,
    pub current_pubkey_hex: String,
    pub next_pubkey_hex: String,
    pub next_registered_ns: u64,
    pub policy: BtcPolicy,
    pub spent_today_sats: u64,
    pub day_index: u64,
    pub next_request: u64,
    pub requests: Vec<BtcSpend>,
}

fn key(id: &str) -> Vec<u8> { format!("hako:btc:{}",id).into_bytes() }
fn read(id: &str) -> Option<BtcState> { env::storage_read(&key(id)).map(|x|BtcState::try_from_slice(&x).expect("Bitcoin state decode")) }
fn write(id: &str, s: &BtcState) { env::storage_write(&key(id),&borsh::to_vec(s).expect("Bitcoin state encode")); }
pub fn btc_pending(id: &str) -> bool { read(id).map(|s|s.requests.iter().any(|r|r.state=="pending"||r.state=="signing")).unwrap_or(false) }
pub fn btc_guardian_pending(id: &str) -> bool { read(id).map(|s|s.requests.iter().any(|r|r.guardian_recovery&&r.state=="pending")).unwrap_or(false) }
pub fn void_pending(id: &str) {if let Some(mut s)=read(id){for r in s.requests.iter_mut().filter(|r|r.state=="pending"){r.state="cancelled".into();}write(id,&s);}}
pub fn clear(id: &str) { env::storage_remove(&key(id)); }
fn script(pk: &str) -> Vec<u8> { let k=hex_decode(pk);require!(k.len()==33&&(k[0]==2||k[0]==3),"compressed Bitcoin public key required");let hash=Ripemd160::digest(env::sha256(&k));let mut script=vec![0,20];script.extend_from_slice(&hash);script }
fn check_script(s: &str) -> Vec<u8> { let bytes=hex_decode(s);require!(bytes.len()==22&&bytes[0]==0&&bytes[1]==20,"P2WPKH script required");bytes }

struct ParsedTx {version:[u8;4],outpoint:[u8;36],sequence:[u8;4],outputs:Vec<(u64,Vec<u8>)>,outputs_raw:Vec<u8>,locktime:[u8;4]}
fn take<'a>(b:&'a [u8],at:&mut usize,n:usize)->&'a [u8]{require!(b.len().saturating_sub(*at)>=n,"truncated Bitcoin transaction");let start=*at;*at+=n;&b[start..start+n]}
fn small_varint(b:&[u8],at:&mut usize)->usize{let n=take(b,at,1)[0];require!(n<0xfd,"Bitcoin varint too large");n as usize}
fn tx(raw:&str)->ParsedTx{
    let b=hex_decode(raw);require!(b.len()<=4000,"Bitcoin transaction too large");let mut at=0;
    let version:[u8;4]=take(&b,&mut at,4).try_into().unwrap();
    require!(small_varint(&b,&mut at)==1,"one input required");
    let outpoint:[u8;36]=take(&b,&mut at,36).try_into().unwrap();
    require!(small_varint(&b,&mut at)==0,"unsigned scriptSig required");
    let sequence:[u8;4]=take(&b,&mut at,4).try_into().unwrap();
    let output_count=small_varint(&b,&mut at);require!((1..=2).contains(&output_count),"one or two outputs required");
    let output_start=at;let mut outputs=Vec::new();
    for _ in 0..output_count{let amount=u64::from_le_bytes(take(&b,&mut at,8).try_into().unwrap());let script_len=small_varint(&b,&mut at);let script=take(&b,&mut at,script_len).to_vec();outputs.push((amount,script));}
    let outputs_raw=b[output_start..at].to_vec();
    let locktime:[u8;4]=take(&b,&mut at,4).try_into().unwrap();require!(at==b.len(),"extra Bitcoin transaction bytes");
    ParsedTx{version,outpoint,sequence,outputs,outputs_raw,locktime}
}
fn sha256d(b:&[u8])->Vec<u8>{env::sha256(&env::sha256(b))}
fn inspect(s: &BtcState, raw: &str, prevout_sats: u64, now: u64, recovery: bool) -> (u64,String,u64) {
    let t=tx(raw);
    let current=script(&s.current_pubkey_hex);
    let next=script(&s.next_pubkey_hex);
    let recovery_script=check_script(&s.policy.recovery_script);
    let mut outgoing=0u64; let mut has_change=false; let mut all_allowed=true;
    for (value,bytes) in &t.outputs {
        require!(*value>0,"zero output");
        require!(*bytes!=current,"current epoch address cannot receive change");
        require!(bytes.len()==22&&bytes[0]==0&&bytes[1]==20,"P2WPKH output required");
        if *bytes==next {
            require!(!has_change && !recovery,"invalid or duplicate change");
            require!(now>=s.next_registered_ns+120*NS_SEC,"next epoch change registration delay active");
            has_change=true;
        } else {
            if recovery {require!(*bytes==recovery_script,"guardian may only sweep to recovery script");}
            else if !s.policy.allow_scripts.iter().any(|a|a.eq_ignore_ascii_case(&hex_encode(bytes))) {all_allowed=false;}
            outgoing=outgoing.checked_add(*value).expect("BTC sum overflow");
        }
    }
    require!(outgoing>0,"no outgoing BTC");
    let total=t.outputs.iter().try_fold(0u64,|n,o|n.checked_add(o.0)).expect("BTC sum overflow");
    require!(total<prevout_sats,"positive mining fee required");
    require!(prevout_sats-total<=100_000,"mining fee exceeds 100000 sats");
    // BIP143 SIGHASH_ALL preimage for the one-input P2WPKH subset above.
    let pk_hash=&current[2..];
    let mut script_code=vec![0x19,0x76,0xa9,0x14];script_code.extend_from_slice(pk_hash);script_code.extend_from_slice(&[0x88,0xac]);
    let mut pre=Vec::with_capacity(180);pre.extend_from_slice(&t.version);pre.extend_from_slice(&sha256d(&t.outpoint));pre.extend_from_slice(&sha256d(&t.sequence));pre.extend_from_slice(&t.outpoint);pre.extend_from_slice(&script_code);pre.extend_from_slice(&prevout_sats.to_le_bytes());pre.extend_from_slice(&t.sequence);pre.extend_from_slice(&sha256d(&t.outputs_raw));pre.extend_from_slice(&t.locktime);pre.extend_from_slice(&1u32.to_le_bytes());
    (outgoing,hex_encode(&sha256d(&pre)),if all_allowed {0} else {1})
}

#[near]
impl Hako {
    pub fn btc_state(&self, token_id: String) -> Option<BtcState> { read(&token_id) }

    pub fn register_btc(&mut self, token_id: String, current_pubkey_hex: String, next_pubkey_hex: String, policy: BtcPolicy, nonce: u64, signature: Base64VecU8) {
        require!(policy.daily_cap_sats.0>0 && policy.allow_scripts.len()<=32,"invalid Bitcoin policy");
        check_script(&policy.recovery_script);
        for a in &policy.allow_scripts {check_script(a);}
        script(&current_pubkey_hex);script(&next_pubkey_hex);
        require!(current_pubkey_hex!=next_pubkey_hex,"next epoch key must differ");
        require!(!btc_pending(&token_id),"pending Bitcoin spend exists");
        let data=near_sdk::serde_json::to_vec(&(current_pubkey_hex.clone(),next_pubkey_hex.clone(),&policy)).expect("Bitcoin policy JSON");
        let t=self.token_mut(&token_id);
        require!(t.owner_id==env::predecessor_account_id(),"owner only");
        require!(t.listed_yocto.is_none(),"listed box cannot change policy");
        verify_pq(t,nonce,&data,&signature.0);t.nonce+=1;
        let existing=read(&token_id);
        let state=BtcState { epoch:existing.as_ref().map(|s|s.epoch).unwrap_or(0),current_pubkey_hex,next_pubkey_hex,next_registered_ns:env::block_timestamp(),policy,spent_today_sats:existing.as_ref().map(|s|s.spent_today_sats).unwrap_or(0),day_index:env::block_timestamp()/(86_400*NS_SEC),next_request:existing.as_ref().map(|s|s.next_request).unwrap_or(0),requests:existing.map(|s|s.requests).unwrap_or_default() };
        write(&token_id,&state);
    }

    pub fn request_btc_spend(&mut self, token_id: String, raw_unsigned_hex: String, prevout_sats: U64, nonce: u64, signature: Base64VecU8) -> BtcSpend {
        let mut s=read(&token_id).expect("Setup required: register_btc");
        require!(!btc_pending(&token_id),"pending Bitcoin spend exists");
        let now=env::block_timestamp();
        let (amount,hash,delay)=inspect(&s,&raw_unsigned_hex,prevout_sats.0,now,false);
        let mut data=hex_decode(&raw_unsigned_hex);data.extend_from_slice(&prevout_sats.0.to_le_bytes());
        let t=self.token_mut(&token_id);
        require!(t.owner_id==env::predecessor_account_id(),"owner only");
        require!(t.listed_yocto.is_none(),"listed box cannot spend");
        verify_pq(t,nonce,&data,&signature.0);
        let day=now/(86_400*NS_SEC);if s.day_index!=day{s.day_index=day;s.spent_today_sats=0;}
        let spent=s.spent_today_sats.checked_add(amount).expect("BTC cap overflow");require!(spent<=s.policy.daily_cap_sats.0,"BTC daily cap exceeded");s.spent_today_sats=spent;t.nonce+=1;
        let request=BtcSpend{id:s.next_request,raw_unsigned_hex,prevout_sats,outgoing_sats:U64(amount),sighash_hex:hash,ready_ns:now+delay*t.policy.delay_sec*NS_SEC,state:"pending".into(),signature_json:None,guardian_recovery:false};
        s.next_request+=1;s.requests.push(request.clone());write(&token_id,&s);request
    }

    pub fn guardian_clawback_btc(&mut self, token_id: String, request_id: u64, recovery_tx_hex: String) -> BtcSpend {
        let mut s=read(&token_id).expect("Bitcoin box not registered");
        let old=s.requests.iter().find(|r|r.id==request_id).expect("request not found").clone();
        require!(old.state=="pending"&&env::block_timestamp()<old.ready_ns,"clawback window closed");
        let t=self.tokens.get(&token_id).expect("token not found");
        require!(t.policy.guardian==env::predecessor_account_id(),"guardian only");
        let original=tx(&old.raw_unsigned_hex);let recovery=tx(&recovery_tx_hex);
        require!(original.outpoint==recovery.outpoint,"recovery must spend same UTXO");
        let (amount,hash,_)=inspect(&s,&recovery_tx_hex,old.prevout_sats.0,env::block_timestamp(),true);
        require!(amount>0,"empty recovery");
        s.requests.iter_mut().find(|r|r.id==request_id).unwrap().state="cancelled".into();
        let request=BtcSpend{id:s.next_request,raw_unsigned_hex:recovery_tx_hex,prevout_sats:old.prevout_sats,outgoing_sats:U64(amount),sighash_hex:hash,ready_ns:env::block_timestamp(),state:"pending".into(),signature_json:None,guardian_recovery:true};
        s.next_request+=1;s.requests.push(request.clone());write(&token_id,&s);request
    }

    pub fn execute_btc(&mut self, token_id: String, request_id: u64) -> Promise {
        let mut s=read(&token_id).expect("Bitcoin box not registered");
        let request=s.requests.iter_mut().find(|r|r.id==request_id).expect("request not found");
        require!(request.state=="pending"&&env::block_timestamp()>=request.ready_ns,"request not ready");
        request.state="signing".into();
        let t=self.token_mut(&token_id);t.ever_signed=true;
        let path=format!("hako/{}/{}",token_id,s.epoch);
        let hash=request.sighash_hex.clone();write(&token_id,&s);
        let args=near_sdk::serde_json::json!({"request":{"payload_v2":{"Ecdsa":hash},"path":path,"domain_id":0}});
        Promise::new(self.mpc_contract.clone()).function_call("sign",near_sdk::serde_json::to_vec(&args).unwrap(),NearToken::from_yoctonear(1),MPC_GAS)
            .then(Promise::new(env::current_account_id()).function_call("on_btc_signed",near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({"token_id":token_id,"request_id":request_id})).unwrap(),NearToken::from_yoctonear(0),CALLBACK_GAS))
    }

    #[private]
    pub fn on_btc_signed(&mut self, token_id: String, request_id: u64) {
        let mut s=read(&token_id).expect("Bitcoin box not registered");
        let request=s.requests.iter_mut().find(|r|r.id==request_id).expect("request not found");
        require!(request.state=="signing","not signing");
        match env::promise_result_checked(0,4096) {Ok(bytes)=>{request.signature_json=Some(String::from_utf8(bytes).expect("MPC response UTF-8"));request.state="signed".into();},_=>request.state="failed".into()}
        write(&token_id,&s);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    #[test]
    fn bip143_matches_bitcoinjs_for_p2wpkh() {
        testing_env!(VMContextBuilder::new().build());
        let destination="00147f80a5938d2ef6af84f8338f136d96c3ee232cc9";
        let state=BtcState{epoch:0,current_pubkey_hex:"03a500ea82193c787c993ce4b078da0178defab2b032318ccce8dc316cc806dbd1".into(),next_pubkey_hex:"02a35643cfd916f86a7b38250439f1bd72450783e7bc8f87ff343adbf04f340dd8".into(),next_registered_ns:0,policy:BtcPolicy{daily_cap_sats:U64(10_000_000),allow_scripts:vec![destination.into()],recovery_script:destination.into()},spent_today_sats:0,day_index:0,next_request:0,requests:vec![]};
        let raw="020000000111111111111111111111111111111111111111111111111111111111111111110100000000fdffffff0198929800000000001600147f80a5938d2ef6af84f8338f136d96c3ee232cc900000000";
        let (amount,hash,delay)=inspect(&state,raw,10_000_000,120*NS_SEC,false);
        assert_eq!(amount,9_999_000);assert_eq!(delay,0);
        assert_eq!(hash,"440be48b0f24ff2e44154f37d0bf391e9cb37e9cc0a5f64439c2d26010578ec3");
    }

    #[test]
    fn rejects_current_epoch_change() {
        testing_env!(VMContextBuilder::new().build());
        let current="03a500ea82193c787c993ce4b078da0178defab2b032318ccce8dc316cc806dbd1";
        let script=script(current);let mut raw=hex_decode("020000000111111111111111111111111111111111111111111111111111111111111111110100000000fdffffff0198929800000000001600147f80a5938d2ef6af84f8338f136d96c3ee232cc900000000");
        raw[56..78].copy_from_slice(&script);
        let state=BtcState{epoch:0,current_pubkey_hex:current.into(),next_pubkey_hex:"02e53491e501768aadc82a2280dc4c751250a2c042efd9d1fbd597722c9626816d".into(),next_registered_ns:0,policy:BtcPolicy{daily_cap_sats:U64(10_000_000),allow_scripts:vec![],recovery_script:"00147f80a5938d2ef6af84f8338f136d96c3ee232cc9".into()},spent_today_sats:0,day_index:0,next_request:0,requests:vec![]};
        assert!(std::panic::catch_unwind(||inspect(&state,&hex_encode(&raw),10_000_000,120*NS_SEC,false)).is_err());
    }
}
