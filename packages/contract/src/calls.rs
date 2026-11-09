use super::*;
use near_sdk::json_types::U64;
use near_sdk::PromiseOrValue;

const USDC: &str = "usdc.tidepool-sandbox.testnet";
const PYTH: &str = "pyth-oracle.testnet";
const BTC_USD: &str = "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
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
}

fn key(id:&str)->Vec<u8>{format!("hako:calls:v1:{id}").into_bytes()}
fn read(id:&str)->Vec<CoveredCall>{stored(&key(id)).unwrap_or_default()}
fn write(id:&str,calls:&[CoveredCall]){save(&key(id),&calls)}
fn current(calls:&[CoveredCall])->Option<&CoveredCall>{calls.last()}
fn active(c:&CoveredCall)->bool{matches!(c.state.as_str(),"auction"|"purchasing"|"sold"|"settling"|"itm"|"paying"|"paid"|"signing"|"signed")}
pub fn locked(id:&str)->bool{current(&read(id)).is_some_and(active)}

fn price(c:&CoveredCall,now:u64)->u128{
    if now>=c.auction_end_ns{return c.minimum_premium_usdc.0;}
    let span=c.auction_end_ns-c.opened_ns;
    let remaining=c.auction_end_ns-now;
    c.minimum_premium_usdc.0+(c.opening_premium_usdc.0-c.minimum_premium_usdc.0)*remaining as u128/span as u128
}

fn pyth_price(bytes:&[u8],now:u64,expiry:u64)->Option<u128>{
    let value:near_sdk::serde_json::Value=near_sdk::serde_json::from_slice(bytes).ok()?;
    let p=value.get("price")?.as_str()?.parse::<i128>().ok()?;
    let expo=value.get("expo")?.as_i64()?;
    let published=value.get("publish_time")?.as_i64()?;
    if p<=0||!(-18..=6).contains(&expo)||published<0{return None;}
    let published=published as u64;
    let now_sec=now/NS_SEC;
    if now_sec.saturating_sub(published)>60 || published>now_sec+5 || published+60<expiry/NS_SEC || published>expiry/NS_SEC+300{return None;}
    let scale=expo+6;
    let amount=if scale>=0 {(p as u128).checked_mul(10u128.checked_pow(scale as u32)?)?}else{(p as u128)/10u128.checked_pow((-scale) as u32)?};
    (amount>0).then_some(amount)
}

#[near]
impl Hako {
    pub fn call_state(&self,token_id:String)->Option<CoveredCall>{read(&token_id).pop()}
    pub fn call_history(&self,token_id:String)->Vec<CoveredCall>{read(&token_id)}
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
        let c=CoveredCall{id:calls.len() as u64,token_id:token_id.clone(),writer:t.owner_id.clone(),holder:None,strike_usd_e6,size_sats,collateral_outpoint_hex,collateral_sats,opening_premium_usdc,minimum_premium_usdc,premium_paid_usdc:None,opened_ns:now,auction_end_ns:now+(WEEK*NS_SEC).min(expiry_ns-now),expiry_ns,exercise_deadline_ns:None,oracle_price_usd_e6:None,exercise_script_hex:None,exercise_raw_hex:None,exercise_signature_json:None,state:"auction".into()};
        calls.push(c.clone());write(&token_id,&calls);c
    }

    pub fn close_unfilled_call(&mut self,token_id:String){let mut calls=read(&token_id);let c=calls.last_mut().expect("call not found");require!(c.state=="auction"&&env::block_timestamp()>=c.auction_end_ns,"auction still open");c.state="unfilled".into();write(&token_id,&calls);}

    /// NEP-141 transfer_call receiver. Only the named testnet USDC contract can call this.
    pub fn ft_on_transfer(&mut self,sender_id:AccountId,amount:U128,msg:String)->PromiseOrValue<U128>{
        require!(env::predecessor_account_id().as_str()==USDC,"testnet USDC only");
        let parts:Vec<_>=msg.split(':').collect();
        require!((parts.len()==2&&parts[0]=="buy")||(parts.len()==3&&parts[0]=="exercise"),"invalid call payment message");
        let token_id=parts[1].to_string();let mut calls=read(&token_id);let c=calls.last_mut().expect("call not found");let now=env::block_timestamp();
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
        let transfer=Promise::new(USDC.parse().unwrap()).function_call("ft_transfer",near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({"receiver_id":writer,"amount":amount,"memo":format!("Hako {kind} {token_id}")})).unwrap(),NearToken::from_yoctonear(1),Gas::from_tgas(20));
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

    pub fn settle_call(&mut self,token_id:String)->Promise{
        let mut calls=read(&token_id);let c=calls.last_mut().expect("call not found");let now=env::block_timestamp();
        require!(c.state=="sold"&&now>=c.expiry_ns&&now<=c.expiry_ns+300*NS_SEC,"settlement window closed");
        c.state="settling".into();write(&token_id,&calls);
        let args=near_sdk::serde_json::json!({"price_id":BTC_USD,"age":60});
        Promise::new(PYTH.parse().unwrap()).function_call("get_price_no_older_than",near_sdk::serde_json::to_vec(&args).unwrap(),NearToken::from_yoctonear(0),Gas::from_tgas(15))
            .then(Promise::new(env::current_account_id()).function_call("on_call_price",near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({"token_id":token_id})).unwrap(),NearToken::from_yoctonear(0),Gas::from_tgas(15)))
    }

    #[private]
    pub fn on_call_price(&mut self,token_id:String)->bool{
        let mut calls=read(&token_id);let c=calls.last_mut().expect("call not found");require!(c.state=="settling","settlement state changed");
        let value=env::promise_result_checked(0,1024).ok().and_then(|bytes|pyth_price(&bytes,env::block_timestamp(),c.expiry_ns));
        if let Some(value)=value{c.oracle_price_usd_e6=Some(U128(value));if value<=c.strike_usd_e6.0{c.state="otm".into();}else{c.state="itm".into();c.exercise_deadline_ns=Some(env::block_timestamp()+EXERCISE_WINDOW*NS_SEC);}}
        else{c.state="sold".into();}
        write(&token_id,&calls);value.is_some()
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
