// QA_SIGNER_MODULE: imported only in a VITE_QA_SIGNER=1 build. Never stores keys in browser storage.
import { connect, keyStores, KeyPair, transactions } from 'near-api-js';

type Call = { methodName: string; args: object; gas: string | bigint; deposit: string | bigint };
type FunctionCall = { type?: string; params?: Call; enum?: string; functionCall?: Call };
type Transaction = { receiverId: string; actions: FunctionCall[] };
type Injection = { accountId: string; privateKey: string; rpcUrl: string };
type Receipt = { accountId: string; receiverId: string; methods: string[]; hash: string; gas: string; deposit: string; success: boolean; final: boolean };
declare global {
  interface Window {
    __OTZAR_QA_SIGNER__?: Injection;
    __OTZAR_QA_BUDGET_CHECK__?: (transaction: { accountId: string; receiverId: string; methods: string[]; gas: string; deposit: string }) => Promise<void>;
    __OTZAR_QA_RECORD__?: (receipt: Receipt) => Promise<void>;
  }
}
const RPCS = new Set(['https://rpc.testnet.near.org', 'https://test.rpc.fastnear.com', 'https://near-testnet.drpc.org', 'https://testnet-rpc.intea.rs']);
const testnet = (id: string) => /^[a-z0-9][a-z0-9._-]{0,55}\.testnet$/.test(id);

export async function setupQaSelector() {
  if (import.meta.env.MODE !== 'qa' || import.meta.env.VITE_QA_SIGNER !== '1') throw new Error('QA signer is disabled in this build');
  const injected = window.__OTZAR_QA_SIGNER__;
  delete window.__OTZAR_QA_SIGNER__;
  if (!injected || !testnet(injected.accountId) || !RPCS.has(injected.rpcUrl)) throw new Error('QA signer requires a .testnet account and an allow-listed testnet RPC');
  if (!window.__OTZAR_QA_BUDGET_CHECK__ || !window.__OTZAR_QA_RECORD__) throw new Error('QA signer requires the e2e budget guard and receipt recorder');
  const { accountId, rpcUrl } = injected;
  const store = new keyStores.InMemoryKeyStore();
  try {
    if (!/^ed25519:[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(injected.privateKey)) throw new Error();
    await store.setKey('testnet', accountId, KeyPair.fromString(injected.privateKey as Parameters<typeof KeyPair.fromString>[0]));
  }
  catch { throw new Error('QA signer could not load the injected testnet credential'); }
  injected.privateKey = '';
  let near: Awaited<ReturnType<typeof connect>> | undefined;
  for (const endpoint of [rpcUrl, ...[...RPCS].filter(url => url !== rpcUrl)]) {
    try {
      const candidate = await connect({ networkId: 'testnet', nodeUrl: endpoint, keyStore: store });
      const status = await candidate.connection.provider.status();
      if (status.chain_id !== 'testnet') throw new Error('QA signer refuses a non-testnet network');
      near = candidate; break;
    } catch (e) { if ((e as Error).message === 'QA signer refuses a non-testnet network') throw e; }
  }
  if (!near) throw new Error('QA testnet RPCs are unavailable; try again later');
  const account = await near.account(accountId);
  const sessionKey = 'otzar.qa.account';
  let connected = sessionStorage.getItem(sessionKey) === accountId;
  const getAccounts = async () => connected ? [{ accountId }] : [];
  async function signAndSendTransaction({ receiverId, actions }: Transaction) {
    if (!connected) throw new Error('Connect the QA signer first');
    // Wallet Selector 10 uses native NEAR actions; also accept its older selector-shaped calls.
    const calls = actions.map(a => a.enum === 'functionCall' ? a.functionCall : a.type === 'FunctionCall' ? a.params : undefined);
    if (!testnet(receiverId) || !calls.length || calls.some(a => !a || BigInt(a.gas) <= 0n || BigInt(a.deposit) < 0n)) throw new Error('QA signer permits testnet function calls only');
    const permitted = calls as Call[];
    const gas = permitted.reduce((n, a) => n + BigInt(a.gas), 0n);
    const deposit = permitted.reduce((n, a) => n + BigInt(a.deposit), 0n);
    if (gas <= 0n || gas > 200_000_000_000_000n || deposit < 0n || deposit > 10n ** 21n) throw new Error('QA signer transaction exceeds its gas or 0.001 NEAR deposit limit');
    const methods = permitted.map(a => a.methodName);
    await window.__OTZAR_QA_BUDGET_CHECK__!({ accountId, receiverId, methods, gas: gas.toString(), deposit: deposit.toString() });
    let hash = '';
    try {
      const result = await account.signAndSendTransaction({ receiverId, returnError: true, actions: permitted.map(a => transactions.functionCall(a.methodName, a.args, BigInt(a.gas), BigInt(a.deposit))) });
      hash = result.transaction.hash;
    } catch (e) {
      // near-api-js retains the signed hash even if the RPC times out after accepting it.
      hash = (e as { context?: { transactionHash?: string } }).context?.transactionHash || '';
      if (!hash) throw e;
    }
    await window.__OTZAR_QA_RECORD__!({ accountId, receiverId, methods, hash, gas: gas.toString(), deposit: deposit.toString(), success: false, final: false });
    const endpoints = ['https://testnet-rpc.intea.rs', rpcUrl, ...RPCS];
    for (let attempt = 0; attempt < 24; attempt++) {
      try {
        const response = await fetch(endpoints[attempt % endpoints.length], { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'qa-final', method: 'tx', params: { tx_hash: hash, sender_account_id: accountId, wait_until: 'FINAL' } }), signal: AbortSignal.timeout(8000) });
        const body = await response.json();
        if (!response.ok || body.error || body.result?.final_execution_status !== 'FINAL') throw new Error();
        const final = body.result;
        await window.__OTZAR_QA_RECORD__!({ accountId, receiverId, methods, hash, gas: gas.toString(), deposit: deposit.toString(), success: !final.status?.Failure, final: true });
        return final;
      } catch (e) {
        if ((e as Error).message.includes('QA transaction')) throw e;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    throw new Error(`QA transaction ${hash} was submitted; finality is unavailable. Check the recorded hash before retrying.`);
  }
  const wallet = {
    id: 'qa-signer', getAccounts,
    signIn: async ({ contractId }: { contractId: string }) => { if (!testnet(contractId)) throw new Error('QA signer refuses a non-testnet contract'); connected = true; sessionStorage.setItem(sessionKey, accountId); return getAccounts(); },
    signOut: async () => { connected = false; sessionStorage.removeItem(sessionKey); }, signAndSendTransaction,
    signAndSendTransactions: async ({ transactions: list }: { transactions: Transaction[] }) => { const results = []; for (const tx of list) results.push(await signAndSendTransaction(tx)); return results; },
  };
  return { wallet: async () => wallet, store: { getState: () => ({ accounts: connected ? [{ accountId, active: true }] : [] }) } };
}
