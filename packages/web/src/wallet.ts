import { useEffect, useState } from 'react';
import { actionCreators, setupWalletSelector, type InjectedWallet } from '@near-wallet-selector/core';
import { setupMeteorWallet } from '@near-wallet-selector/meteor-wallet';
import { contractId } from './lib';

export type Wallet = { selector: any; account: string; ready: boolean; error: string; setError: (e: string) => void; connect: () => Promise<void>; disconnect: () => Promise<void> };

/** Meteor Wallet (testnet) opens in a pop-up (or its browser extension) and posts the result back, so there is no
 * redirect route. MyNearWallet was dropped on 2026-11-10: its testnet pop-up now answers "MyNearWallet can't connect
 * to apps anymore" and sends people to Meteor. */
export const WALLET_ID = 'meteor-wallet';
const GAS = '120000000000000';

/** Plain words for the wallet window's own failures; anything else (a contract panic, an RPC error) passes through. */
export function plainWalletError(e: unknown, signingIn = false): Error {
  const message = String((e as Error)?.message ?? e);
  if (/User closed the window|didn't complete the action|User cancelled/i.test(message)) return new Error(signingIn ? 'The wallet closed before you signed in.' : 'The wallet closed before you approved. Nothing was sent.');
  if (/open popup window|Popup window blocked/i.test(message)) return new Error('Your browser blocked the wallet window. Allow pop-ups for this site, then try again.');
  if (/No Meteor (Wallet )?account found/i.test(message)) return new Error('Meteor Wallet has no testnet account yet. Create one there, then connect again.');
  return e instanceof Error ? e : new Error(message);
}

/** Have the wallet sign and send one function call. Calls with no deposit to the Otzar contract are signed by the
 * function-call key Meteor issued at sign-in; anything that attaches NEAR, or goes to another contract, opens Meteor. */
export async function signAndSend(selector: any, receiverId: string, methodName: string, args: object, deposit = '0', gas = GAS): Promise<any> {
  const w = await selector.wallet(WALLET_ID);
  try { return await w.signAndSendTransaction({ receiverId, actions: [actionCreators.functionCall(methodName, args, BigInt(gas), BigInt(deposit))] }); }
  catch (e) { throw plainWalletError(e); }
}

/** Sign one function call with the connected wallet. Returns the tx hash. */
export async function sendCall(wallet: Wallet, receiverId: string, methodName: string, args: object, deposit = '0'): Promise<string> {
  if (!wallet.selector || !wallet.account) throw new Error('Connect a NEAR testnet wallet first');
  const result = await signAndSend(wallet.selector, receiverId, methodName, args, deposit);
  if (!result) return '';
  if (result.status?.Failure) throw new Error(`Rejected on-chain: ${JSON.stringify(result.status.Failure)}`);
  return result.transaction?.hash || '';
}

/** Meteor Wallet on NEAR testnet, signed in for the Otzar contract. */
export function useWallet(): Wallet {
  const [selector, setSelector] = useState<any>();
  const [account, setAccount] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    setupWalletSelector({ network: 'testnet', modules: [setupMeteorWallet()] })
      .then(s => { setSelector(s); const a = s.store.getState().accounts; setAccount(a.find(a => a.active)?.accountId || ''); })
      .catch(e => setError(e.message));
  }, []);
  async function connect() {
    setError('');
    try {
      if (!contractId) throw new Error('Setup required: VITE_HAKO_CONTRACT');
      if (!selector) throw new Error('Wallet selector is still loading');
      const wallet = await selector.wallet(WALLET_ID) as InjectedWallet;
      const a = await wallet.signIn({ contractId, methodNames: [] });
      setAccount(a?.[0]?.accountId || '');
    } catch (e) { setError(plainWalletError(e, true).message); }
  }
  async function disconnect() { const wallet = await selector.wallet(WALLET_ID); await wallet.signOut(); setAccount(''); }
  return { selector, account, ready: !!selector, error, setError, connect, disconnect };
}
