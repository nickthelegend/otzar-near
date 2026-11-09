//! tUSDC (Hako test): a plain NEP-141 token used only as the covered-call premium and
//! strike currency on NEAR testnet. It has no value and no peg. Only the token account
//! itself can mint, and every mint is logged as a NEP-141 `ft_mint` event.
use near_contract_standards::fungible_token::events::FtMint;
use near_contract_standards::fungible_token::metadata::{FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC};
use near_contract_standards::fungible_token::{FungibleToken, FungibleTokenCore, FungibleTokenResolver};
use near_contract_standards::storage_management::{StorageBalance, StorageBalanceBounds, StorageManagement};
use near_sdk::json_types::U128;
use near_sdk::{env, near, require, AccountId, NearToken, PanicOnDefault, PromiseOrValue};

pub const NAME: &str = "Hako test USDC (testnet only, no value)";
pub const SYMBOL: &str = "tUSDC (Hako test)";
pub const DECIMALS: u8 = 6;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct TestUsdc {
    token: FungibleToken,
}

#[near]
impl TestUsdc {
    #[init]
    pub fn new() -> Self {
        let me = env::current_account_id();
        require!(me.as_str().ends_with(".testnet") || me.as_str().ends_with(".test.near"), "testnet or sandbox only");
        let mut token = FungibleToken::new(b"t".to_vec());
        token.internal_register_account(&env::current_account_id());
        Self { token }
    }

    /// Test faucet. Only the token account can mint; the receiver must be registered.
    pub fn mint(&mut self, account_id: AccountId, amount: U128) {
        require!(env::predecessor_account_id() == env::current_account_id(), "token account only");
        require!(amount.0 > 0, "zero mint");
        if !self.token.accounts.contains_key(&account_id) {
            self.token.internal_register_account(&account_id);
        }
        self.token.internal_deposit(&account_id, amount.0);
        FtMint { owner_id: &account_id, amount, memo: Some("Hako testnet faucet: no value") }.emit();
    }
}

#[near]
impl FungibleTokenCore for TestUsdc {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>, msg: String) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 { self.token.ft_total_supply() }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 { self.token.ft_balance_of(account_id) }
}

#[near]
impl FungibleTokenResolver for TestUsdc {
    #[private]
    fn ft_resolve_transfer(&mut self, sender_id: AccountId, receiver_id: AccountId, amount: U128) -> U128 {
        let (used, burned) = self.token.internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        if burned > 0 { env::log_str(&format!("burned {burned}")); }
        used.into()
    }
}

#[near]
impl StorageManagement for TestUsdc {
    #[payable]
    fn storage_deposit(&mut self, account_id: Option<AccountId>, registration_only: Option<bool>) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance { self.token.storage_withdraw(amount) }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        require!(force != Some(true), "force unregister disabled");
        self.token.internal_storage_unregister(force).is_some()
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds { self.token.storage_balance_bounds() }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> { self.token.storage_balance_of(account_id) }
}

#[near]
impl FungibleTokenMetadataProvider for TestUsdc {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        FungibleTokenMetadata { spec: FT_METADATA_SPEC.to_string(), name: NAME.into(), symbol: SYMBOL.into(), icon: None, reference: None, reference_hash: None, decimals: DECIMALS }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    fn ctx(predecessor: AccountId) {
        testing_env!(VMContextBuilder::new().current_account_id("husdc.testnet".parse().unwrap()).predecessor_account_id(predecessor).attached_deposit(NearToken::from_yoctonear(1)).build());
    }

    #[test]
    fn labelled_metadata_and_owner_mint() {
        ctx("husdc.testnet".parse().unwrap());
        let mut t = TestUsdc::new();
        assert_eq!(t.ft_metadata().symbol, "tUSDC (Hako test)");
        assert_eq!(t.ft_metadata().decimals, 6);
        t.mint(accounts(1), U128(5_000_000));
        assert_eq!(t.ft_balance_of(accounts(1)).0, 5_000_000);
        assert_eq!(t.ft_total_supply().0, 5_000_000);
    }

    #[test]
    #[should_panic(expected = "token account only")]
    fn outsider_cannot_mint() {
        ctx("husdc.testnet".parse().unwrap());
        let mut t = TestUsdc::new();
        ctx(accounts(2));
        t.mint(accounts(2), U128(1));
    }
}
