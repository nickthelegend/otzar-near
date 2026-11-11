// QA_SIGNER_MODULE: imported only in a VITE_QA_SIGNER=1 build. Never stores keys in browser storage.
import { connect, keyStores, KeyPair, transactions } from 'near-api-js';

type FunctionCall = { type: string; params: { methodName: string; args: object; gas: string | bigint; deposit: string | bigint } };
type Transaction = { receiverId: string; actions: FunctionCall[] };
type Injection = { accountId: string; privateKey: string; rpcUrl: string };
type Receipt = { accountId: string; receiverId: string; methods: string[]; hash: string; gas: string; deposit: string; success: boolean; final: true };
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
  const provider = near.connection.provider;
  const account = await near.account(accountId);
  const sessionKey = 'otzar.qa.account';
  let connected = sessionStorage.getItem(sessionKey) === accountId;
  const getAccounts = async () => connected ? [{ accountId }] : [];
  async function signAndSendTransaction({ receiverId, actions }: Transaction) {
    if (!connected) throw new Error('Connect the QA signer first');
    if (!testnet(receiverId) || !actions.length || actions.some(a => a.type !== 'FunctionCall' || BigInt(a.params.gas) <= 0n || BigInt(a.params.deposit) < 0n)) throw new Error('QA signer permits testnet function calls only');
    const gas = actions.reduce((n, a) => n + BigInt(a.params.gas), 0n);
    const deposit = actions.reduce((n, a) => n + BigInt(a.params.deposit), 0n);
    if (gas <= 0n || gas > 200_000_000_000_000n || deposit < 0n || deposit > 10n ** 21n) throw new Error('QA signer transaction exceeds its gas or 0.001 NEAR deposit limit');
    const methods = actions.map(a => a.params.methodName);
    await window.__OTZAR_QA_BUDGET_CHECK__!({ accountId, receiverId, methods, gas: gas.toString(), deposit: deposit.toString() });
    const result = await account.signAndSendTransaction({ receiverId, returnError: true, actions: actions.map(a => transactions.functionCall(a.params.methodName, a.params.args, BigInt(a.params.gas), BigInt(a.params.deposit))) });
    const final = await provider.txStatus(result.transaction.hash, accountId, 'FINAL');
    await window.__OTZAR_QA_RECORD__!({ accountId, receiverId, methods, hash: final.transaction.hash, gas: gas.toString(), deposit: deposit.toString(), success: !(typeof final.status === 'object' && 'Failure' in final.status), final: true });
    return final;
  }
  const wallet = {
    id: 'qa-signer', getAccounts,
    signIn: async ({ contractId }: { contractId: string }) => { if (!testnet(contractId)) throw new Error('QA signer refuses a non-testnet contract'); connected = true; sessionStorage.setItem(sessionKey, accountId); return getAccounts(); },
    signOut: async () => { connected = false; sessionStorage.removeItem(sessionKey); }, signAndSendTransaction,
    signAndSendTransactions: async ({ transactions: list }: { transactions: Transaction[] }) => { const results = []; for (const tx of list) results.push(await signAndSendTransaction(tx)); return results; },
  };
  return { wallet: async () => wallet, store: { getState: () => ({ accounts: connected ? [{ accountId, active: true }] : [] }) } };
}
