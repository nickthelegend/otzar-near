use super::*;
use near_sdk::json_types::U64;
use near_sdk::PromiseOrValue;

use near_sdk::PublicKey;

/// Used only when `set_call_config` has never run (the original Tidepool testnet USDC).
const DEFAULT_PREMIUM_TOKEN: &str = "usdc.tidepool-sandbox.testnet";
const CFG_KEY: &[u8] = b"hako:cfg:calls:v1";
const PRICE_KEY: &[u8] = b"hako:price:btc-usd:v1";
const PRICE_LABEL: &str = "relayer price (testnet)";
/// A relayed price older than this (by block time) cannot be posted or used for settlement.
const PRICE_MAX_AGE_SEC: u64 = 60;
/// Public spot endpoints the relayer may cite. The contract checks the signature, not the HTTP body.
const PRICE_SOURCES: [&str; 2] = ["https://api.exchange.coinbase.com/products/BTC-USD/ticker", "https://api.coinbase.com/v2/prices/BTC-USD/spot"];
const WEEK: u64 = 7 * 86_400;
const EXERCISE_WINDOW: u64 = 86_400;

#[near(serializers = [json])]
#[derive(Clone)]
pub struct CoveredCall {
    pub id: u64,
    pub token_id: String,
    pub writer: AccountId,
    pub holder: Option<AccountId>,
    pub strike_usd_e6: U128,
    pub size_sats: U64,
    /// The writer's ML-DSA signed UTXO assertion. NEAR cannot independently prove this BTC UTXO.
    pub collateral_outpoint_hex: String,
    pub collateral_sats: U64,
    pub opening_premium_usdc: U128,
    pub minimum_premium_usdc: U128,
    pub premium_paid_usdc: Option<U128>,
    pub opened_ns: u64,
    pub auction_end_ns: u64,
    pub expiry_ns: u64,
    pub exercise_deadline_ns: Option<u64>,
    pub oracle_price_usd_e6: Option<U128>,
    pub exercise_script_hex: Option<String>,
    pub exercise_raw_hex: Option<String>,
    pub exercise_signature_json: Option<String>,
    pub state: String,
    /// NEP-141 token that pays this call's premium and strike. Fixed when the call is written.
    #[serde(default)]
    pub premium_token: Option<AccountId>,
}

/// Testnet settlement config. Mainnet design: read the Rhea price oracle instead of a relayer.
#[near(serializers = [json])]
#[derive(Clone)]
pub struct CallConfig {
    pub premium_token: AccountId,
    /// ed25519 key of the off-chain price relayer, e.g. `ed25519:...`.
    pub relayer_public_key: Option<PublicKey>,
    pub price_label: String,
}

/// A BTC-USD spot price signed by the relayer key and checked on-chain.
#[near(serializers = [json])]
#[derive(Clone)]
pub struct RelayerPrice {
    pub pair: String,
    pub price_usd_e6: U128,
    pub publish_time_sec: u64,
    pub source_url: String,
    pub relayer_public_key: PublicKey,
    pub posted_ns: u64,
    pub posted_by: AccountId,
    pub label: String,
}

fn key(id:&str)->Vec<u8>{format!("hako:calls:v1:{id}").into_bytes()}
fn read(id:&str)->Vec<CoveredCall>{stored(&key(id)).unwrap_or_default()}
fn write(id:&str,calls:&[CoveredCall]){save(&key(id),&calls)}
fn current(calls:&[CoveredCall])->Option<&CoveredCall>{calls.last()}
fn active(c:&CoveredCall)->bool{matches!(c.state.as_str(),"auction"|"purchasing"|"sold"|"settling"|"itm"|"paying"|"paid"|"signing"|"signed")}
pub fn locked(id:&str)->bool{current(&read(id)).is_some_and(active)}

fn config()->CallConfig{stored(CFG_KEY).unwrap_or_else(||CallConfig{premium_token:DEFAULT_PREMIUM_TOKEN.parse().unwrap(),relayer_public_key:None,price_label:PRICE_LABEL.into()})}
fn call_token(c:&CoveredCall)->AccountId{c.premium_token.clone().unwrap_or_else(||DEFAULT_PREMIUM_TOKEN.parse().unwrap())}

/// The exact bytes the relayer signs (sha256 of this string).
pub fn price_message(contract:&AccountId,price_usd_e6:u128,publish_time_sec:u64,source_url:&str)->Vec<u8>{
    env::sha256(format!("hako:relayer-price:v1:{contract}:BTC-USD:{price_usd_e6}:{publish_time_sec}:{source_url}").as_bytes())
}

/// Freshness for posting: not from the future (5 s clock skew), not older than 60 s.
fn fresh(publish_time_sec:u64,now_ns:u64)->bool{let now=now_ns/NS_SEC;publish_time_sec<=now+5&&now.saturating_sub(publish_time_sec)<=PRICE_MAX_AGE_SEC}

/// A settlement price must be observed at or after expiry, inside the 5-minute window, and still fresh.
fn settles(p:&RelayerPrice,now_ns:u64,expiry_ns:u64)->bool{let expiry=expiry_ns/NS_SEC;fresh(p.publish_time_sec,now_ns)&&p.publish_time_sec>=expiry&&p.publish_time_sec<=expiry+300}

fn price(c:&CoveredCall,now:u64)->u128{
    if now>=c.auction_end_ns{return c.minimum_premium_usdc.0;}
    let span=c.auction_end_ns-c.opened_ns;
    let remaining=c.auction_end_ns-now;
    c.minimum_premium_usdc.0+(c.opening_premium_usdc.0-c.minimum_premium_usdc.0)*remaining as u128/span as u128
}

#[near]
impl Hako {
    pub fn call_state(&self,token_id:String)->Option<CoveredCall>{read(&token_id).pop()}
    pub fn call_history(&self,token_id:String)->Vec<CoveredCall>{read(&token_id)}
    pub fn call_config(&self)->CallConfig{config()}
    pub fn relayer_price(&self)->Option<RelayerPrice>{stored(PRICE_KEY)}

    /// Contract account only. Points new calls at a premium token and sets the testnet price relayer key.
    #[private]
    pub fn set_call_config(&mut self,premium_token:AccountId,relayer_public_key:PublicKey){
        require!(relayer_public_key.as_bytes().len()==33&&relayer_public_key.as_bytes()[0]==0,"ed25519 relayer key required");
        save(CFG_KEY,&CallConfig{premium_token,relayer_public_key:Some(relayer_public_key),price_label:PRICE_LABEL.into()});
    }

    /// Anyone may submit; only a price signed by the configured relayer key, fresh and newer than the last one, is stored.
    pub fn post_relayer_price(&mut self,price_usd_e6:U128,publish_time_sec:u64,source_url:String,signature:Base64VecU8)->RelayerPrice{
        let cfg=config();let pk=cfg.relayer_public_key.expect("Setup required: set_call_config relayer key");
        require!(PRICE_SOURCES.contains(&source_url.as_str()),"unknown price source");
        require!(price_usd_e6.0>0&&price_usd_e6.0<10_000_000_000_000,"price out of range");
        let sig:[u8;64]=signature.0.as_slice().try_into().expect("64-byte ed25519 signature required");
        let key:[u8;32]=pk.as_bytes()[1..].try_into().unwrap();
        let digest=price_message(&env::current_account_id(),price_usd_e6.0,publish_time_sec,&source_url);
        require!(env::ed25519_verify(&sig,&digest,&key),"bad relayer signature");
        let now=env::block_timestamp();
        require!(fresh(publish_time_sec,now),"stale or future relayer price");
        if let Some(prev)=stored::<RelayerPrice>(PRICE_KEY){require!(publish_time_sec>prev.publish_time_sec,"relayer price must be newer than the last one");}
        let p=RelayerPrice{pair:"BTC-USD".into(),price_usd_e6,publish_time_sec,source_url,relayer_public_key:pk,posted_ns:now,posted_by:env::predecessor_account_id(),label:PRICE_LABEL.into()};
        save(PRICE_KEY,&p);
        env::log_str(&format!("EVENT_JSON:{}",near_sdk::serde_json::json!({"standard":"hako","version":"1","event":"relayer_price","data":&p})));
        p
    }

    pub fn auction_price(&self,token_id:String)->Option<U128>{let calls=read(&token_id);let c=current(&calls)?;if c.state!="auction"||env::block_timestamp()>=c.auction_end_ns{return None;}Some(U128(price(c,env::block_timestamp())))}

    pub fn write_call(&mut self,token_id:String,strike_usd_e6:U128,expiry_sec:u64,size_sats:U64,opening_premium_usdc:U128,minimum_premium_usdc:U128,collateral_outpoint_hex:String,collateral_sats:U64,nonce:u64,signature:Base64VecU8)->CoveredCall{
        let now=env::block_timestamp();
        require!(!locked(&token_id),"covered call already active");
        require!(!btc::btc_pending(&token_id)&&!self_pending_for(&token_id,&self.spends)&&!sol_pending(&token_id),"pending spend exists");
        let btc=btc::btc_state_for_call(&token_id).expect("Setup required: register_btc");
        require!(btc.requests.iter().all(|r|r.state!="signed"&&r.state!="signing"),"prior Bitcoin signature exists");
        require!(strike_usd_e6.0>0&&size_sats.0>0&&size_sats.0<=collateral_sats.0,"invalid strike or collateral assertion");
        require!(opening_premium_usdc.0>=minimum_premium_usdc.0&&minimum_premium_usdc.0>0&&opening_premium_usdc.0<=u64::MAX as u128,"invalid premium range");
        require!(collateral_outpoint_hex.len()==72&&collateral_outpoint_hex.bytes().all(|b|b.is_ascii_hexdigit()),"serialized Bitcoin outpoint required");
        let expiry_ns=expiry_sec.checked_mul(NS_SEC).expect("expiry overflow");
        require!(expiry_ns>=now+120*NS_SEC&&expiry_ns<=now+30*86_400*NS_SEC,"expiry must be 2 minutes to 30 days away");
        let payload=near_sdk::serde_json::to_vec(&(strike_usd_e6,expiry_sec,size_sats,opening_premium_usdc,minimum_premium_usdc,&collateral_outpoint_hex,collateral_sats)).unwrap();
        let t=self.token_mut(&token_id);
        require!(t.owner_id==env::predecessor_account_id()&&t.listed_yocto.is_none(),"unlisted owner only");
        require!(!t.ever_signed,"prior MPC signature exists");
        verify_pq(t,nonce,&payload,&signature.0);t.nonce+=1;
        let mut calls=read(&token_id);
        require!(calls.len()<100,"call history limit reached");
        let c=CoveredCall{id:calls.len() as u64,token_id:token_id.clone(),writer:t.owner_id.clone(),holder:None,strike_usd_e6,size_sats,collateral_outpoint_hex,collateral_sats,opening_premium_usdc,minimum_premium_usdc,premium_paid_usdc:None,opened_ns:now,auction_end_ns:now+(WEEK*NS_SEC).min(expiry_ns-now),expiry_ns,exercise_deadline_ns:None,oracle_price_usd_e6:None,exercise_script_hex:None,exercise_raw_hex:None,exercise_signature_json:None,state:"auction".into(),premium_token:Some(config().premium_token)};
        calls.push(c.clone());write(&token_id,&calls);c
    }

    pub fn close_unfilled_call(&mut self,token_id:String){let mut calls=read(&token_id);let c=calls.last_mut().expect("call not found");require!(c.state=="auction"&&env::block_timestamp()>=c.auction_end_ns,"auction still open");c.state="unfilled".into();write(&token_id,&calls);}

    /// NEP-141 transfer_call receiver. Only the token fixed on the call can pay its premium or strike.
    pub fn ft_on_transfer(&mut self,sender_id:AccountId,amount:U128,msg:String)->PromiseOrValue<U128>{
        let parts:Vec<_>=msg.split(':').collect();
        require!((parts.len()==2&&parts[0]=="buy")||(parts.len()==3&&parts[0]=="exercise"),"invalid call payment message");
        let token_id=parts[1].to_string();let mut calls=read(&token_id);let c=calls.last_mut().expect("call not found");let now=env::block_timestamp();
        let token=call_token(c);require!(env::predecessor_account_id()==token,"this call's premium token only");
        let kind=parts[0];
        if kind=="buy"{
            require!(c.state=="auction"&&now<c.auction_end_ns,"auction closed");
            require!(sender_id!=c.writer,"writer cannot buy own call");
            require!(amount.0>=price(c,now)&&amount.0<=c.opening_premium_usdc.0,"premium below current auction price");
            c.state="purchasing".into();
        }else{
            require!(c.state=="itm"&&c.holder.as_ref()==Some(&sender_id),"option holder only");
            require!(now<=c.exercise_deadline_ns.unwrap(),"exercise window closed");
            let script=hex_decode(parts[2]);require!(script.len()==22&&script[0]==0&&script[1]==20,"P2WPKH buyer script required");
            let due=(c.strike_usd_e6.0*c.size_sats.0 as u128+99_999_999)/100_000_000;
            require!(amount.0==due,"exact strike payment required");
            c.exercise_script_hex=Some(parts[2].into());c.state="paying".into();
        }
        let writer=c.writer.clone();write(&token_id,&calls);
        let transfer=Promise::new(token).function_call("ft_transfer",near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({"receiver_id":writer,"amount":amount,"memo":format!("Hako {kind} {token_id}")})).unwrap(),NearToken::from_yoctonear(1),Gas::from_tgas(20));
        let callback=Promise::new(env::current_account_id()).function_call("on_call_payment",near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({"token_id":token_id,"kind":kind,"sender_id":sender_id,"amount":amount})).unwrap(),NearToken::from_yoctonear(0),Gas::from_tgas(15));
        PromiseOrValue::Promise(transfer.then(callback))
    }

    #[private]
    pub fn on_call_payment(&mut self,token_id:String,kind:String,sender_id:AccountId,amount:U128)->U128{
        let ok=env::promise_result_checked(0,1024).is_ok();
        let mut calls=read(&token_id);let c=calls.last_mut().expect("call not found");
        if kind=="buy"{require!(c.state=="purchasing","purchase state changed");if ok{c.holder=Some(sender_id);c.premium_paid_usdc=Some(amount);c.state="sold".into();}else{c.state="auction".into();}}
        else{require!(c.state=="paying","exercise state changed");if ok{c.state="paid".into();}else{c.exercise_script_hex=None;c.state="itm".into();}}
        write(&token_id,&calls);if ok{U128(0)}else{amount}
    }

    pub fn option_transfer(&mut self,token_id:String,receiver_id:AccountId){
        require!(env::attached_deposit().as_yoctonear()==1,"one yocto required");
        let mut calls=read(&token_id);let c=calls.last_mut().expect("call not found");
        require!(c.state=="sold"&&env::block_timestamp()<c.expiry_ns,"option can transfer before expiry only");
        require!(c.holder.as_ref()==Some(&env::predecessor_account_id()),"option holder only");
        require!(receiver_id!=env::predecessor_account_id(),"same holder");
        c.holder=Some(receiver_id);c.exercise_script_hex=None;write(&token_id,&calls);
    }

    /// Settles at expiry against the latest relayer price (testnet). No fresh post-expiry price, no settlement.
    pub fn settle_call(&mut self,token_id:String)->CoveredCall{
        let mut calls=read(&token_id);let c=calls.last_mut().expect("call not found");let now=env::block_timestamp();
        require!(c.state=="sold"&&now>=c.expiry_ns&&now<=c.expiry_ns+300*NS_SEC,"settlement window closed");
        let p:RelayerPrice=stored(PRICE_KEY).expect("no relayer price posted");
        require!(settles(&p,now,c.expiry_ns),"relayer price must be fresh and observed at or after expiry");
        let value=p.price_usd_e6.0;c.oracle_price_usd_e6=Some(U128(value));
        if value<=c.strike_usd_e6.0{c.state="otm".into();}else{c.state="itm".into();c.exercise_deadline_ns=Some(now+EXERCISE_WINDOW*NS_SEC);}
        let out=c.clone();write(&token_id,&calls);out
    }

    pub fn lapse_call(&mut self,token_id:String){let mut calls=read(&token_id);let c=calls.last_mut().expect("call not found");require!(c.state=="itm"&&env::block_timestamp()>c.exercise_deadline_ns.unwrap(),"exercise window open");c.state="lapsed".into();write(&token_id,&calls);}

    /// The paid holder supplies a raw transaction; the contract verifies its input, outputs and BIP143 digest.
    pub fn exercise_btc(&mut self,token_id:String,raw_unsigned_hex:String)->Promise{
        let mut calls=read(&token_id);let c=calls.last_mut().expect("call not found");
        require!(c.state=="paid"&&c.holder.as_ref()==Some(&env::predecessor_account_id()),"paid holder only");
        let parsed=btc::tx(&raw_unsigned_hex);require!(hex_encode(&parsed.outpoint)==c.collateral_outpoint_hex.to_lowercase(),"wrong collateral outpoint");
        let buyer_script=hex_decode(c.exercise_script_hex.as_ref().unwrap());
        require!(parsed.outputs.iter().filter(|(_,s)|*s==buyer_script).count()==1,"buyer output required");
        require!(parsed.outputs.iter().any(|(n,s)|*n==c.size_sats.0&&*s==buyer_script),"exact option size required");
        let state=btc::btc_state_for_call(&token_id).expect("Bitcoin policy missing");
        let (_,hash,_)=btc::inspect(&state,&raw_unsigned_hex,c.collateral_sats.0,env::block_timestamp(),false);
        require!(parsed.outputs.len()<=2,"too many outputs");
        if parsed.outputs.len()==2{let change=btc::script_for_call(&state.next_pubkey_hex);require!(parsed.outputs.iter().any(|(_,s)|*s==change),"change must go to next epoch");}
        c.exercise_raw_hex=Some(raw_unsigned_hex);c.state="signing".into();write(&token_id,&calls);
        self.token_mut(&token_id).ever_signed=true;
        let path=format!("hako/{}/{}",token_id,state.epoch);
        let args=near_sdk::serde_json::json!({"request":{"payload_v2":{"Ecdsa":hash},"path":path,"domain_id":0}});
        Promise::new(self.mpc_contract.clone()).function_call("sign",near_sdk::serde_json::to_vec(&args).unwrap(),NearToken::from_yoctonear(1),MPC_GAS)
            .then(Promise::new(env::current_account_id()).function_call("on_call_signed",near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({"token_id":token_id})).unwrap(),NearToken::from_yoctonear(0),CALLBACK_GAS))
    }

    #[private]
    pub fn on_call_signed(&mut self,token_id:String){let mut calls=read(&token_id);let c=calls.last_mut().expect("call not found");require!(c.state=="signing","not signing");match env::promise_result_checked(0,4096){Ok(bytes)=>{c.exercise_signature_json=Some(String::from_utf8(bytes).expect("MPC UTF-8"));c.state="signed".into();},Err(_)=>c.state="paid".into()}write(&token_id,&calls);}
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dutch_premium_declines_to_floor() {
        let c=CoveredCall{id:0,token_id:"test".into(),writer:"writer.testnet".parse().unwrap(),holder:None,strike_usd_e6:U128(100_000_000_000),size_sats:U64(100_000),collateral_outpoint_hex:String::new(),collateral_sats:U64(100_000),opening_premium_usdc:U128(1_000_000),minimum_premium_usdc:U128(200_000),premium_paid_usdc:None,opened_ns:100,auction_end_ns:200,expiry_ns:300,exercise_deadline_ns:None,oracle_price_usd_e6:None,exercise_script_hex:None,exercise_raw_hex:None,exercise_signature_json:None,state:"auction".into(),premium_token:None};
        assert_eq!(price(&c,100),1_000_000);
        assert_eq!(price(&c,150),600_000);
        assert_eq!(price(&c,200),200_000);
        assert_eq!(price(&c,250),200_000);
    }
    fn rp(t:u64)->RelayerPrice{RelayerPrice{pair:"BTC-USD".into(),price_usd_e6:U128(74_864_230_000),publish_time_sec:t,source_url:PRICE_SOURCES[0].into(),relayer_public_key:"ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".parse().unwrap(),posted_ns:0,posted_by:"r.testnet".parse().unwrap(),label:PRICE_LABEL.into()}}
    #[test]
    fn relayer_price_freshness() {
        let t=1_778_000_000u64;
        assert!(fresh(t,(t+60)*NS_SEC));
        assert!(!fresh(t,(t+61)*NS_SEC));
        assert!(fresh(t,(t-5)*NS_SEC));
        assert!(!fresh(t,(t-6)*NS_SEC));
    }
    #[test]
    fn settlement_needs_post_expiry_fresh_price() {
        let expiry=1_778_000_000u64;
        assert!(settles(&rp(expiry+10),(expiry+30)*NS_SEC,expiry*NS_SEC));
        assert!(!settles(&rp(expiry-1),(expiry+30)*NS_SEC,expiry*NS_SEC), "pre-expiry price");
        assert!(!settles(&rp(expiry+10),(expiry+90)*NS_SEC,expiry*NS_SEC), "stale at settlement");
        assert!(!settles(&rp(expiry+301),(expiry+301)*NS_SEC,expiry*NS_SEC), "after window");
    }
    #[test]
    fn price_message_binds_contract_and_source() {
        let a:AccountId="a.testnet".parse().unwrap();let b:AccountId="b.testnet".parse().unwrap();
        assert_ne!(price_message(&a,1,2,PRICE_SOURCES[0]),price_message(&b,1,2,PRICE_SOURCES[0]));
        assert_ne!(price_message(&a,1,2,PRICE_SOURCES[0]),price_message(&a,1,2,PRICE_SOURCES[1]));
        assert_eq!(price_message(&a,1,2,PRICE_SOURCES[0]),env::sha256(format!("hako:relayer-price:v1:a.testnet:BTC-USD:1:2:{}",PRICE_SOURCES[0]).as_bytes()));
    }
}
