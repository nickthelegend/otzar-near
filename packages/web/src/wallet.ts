import { useEffect, useState } from 'react';
import { setupWalletSelector } from '@near-wallet-selector/core';
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet';
import { contractId } from './lib';

export type Wallet = { selector: any; account: string; ready: boolean; error: string; setError: (e: string) => void; connect: () => Promise<void>; disconnect: () => Promise<void> };

const GAS = '120000000000000';

/** Sign one function call with the connected wallet. Returns the tx hash, or '' when the wallet redirects away. */
export async function sendCall(wallet: Wallet, receiverId: string, methodName: string, args: object, deposit = '0'): Promise<string> {
  if (!wallet.selector || !wallet.account) throw new Error('Connect a NEAR testnet wallet first');
  const w = await wallet.selector.wallet('my-near-wallet');
  const result = await w.signAndSendTransaction({ receiverId, actions: [{ type: 'FunctionCall', params: { methodName, args, gas: GAS, deposit } }] });
  if (!result) return '';
  if (result.status?.Failure) throw new Error(`Rejected on-chain: ${JSON.stringify(result.status.Failure)}`);
  return result.transaction?.hash || '';
}

/** MyNearWallet on NEAR testnet, signed in for the Hako contract. */
export function useWallet(): Wallet {
  const [selector, setSelector] = useState<any>();
  const [account, setAccount] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    setupWalletSelector({ network: 'testnet', modules: [setupMyNearWallet()] })
      .then(async s => { setSelector(s); const w = await s.wallet('my-near-wallet'); const a = await w.getAccounts(); setAccount(a[0]?.accountId || ''); })
      .catch(e => setError(e.message));
  }, []);
  async function connect() {
    try {
      if (!contractId) throw new Error('Setup required: VITE_HAKO_CONTRACT');
      if (!selector) throw new Error('Wallet selector is still loading');
      const wallet = await selector.wallet('my-near-wallet');
      const a = await wallet.signIn({ contractId });
      setAccount(a?.[0]?.accountId || '');
    } catch (e) { setError((e as Error).message); }
  }
  async function disconnect() { const wallet = await selector.wallet('my-near-wallet'); await wallet.signOut(); setAccount(''); }
  return { selector, account, ready: !!selector, error, setError, connect, disconnect };
}
