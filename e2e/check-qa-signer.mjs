import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

/** No writes: every valid action must reach a budget hook that deliberately refuses signing. */
export async function checkQaSigner(out) {
  const require = createRequire(resolve('packages/web/package.json'));
  const esbuild = createRequire(require.resolve('vite'))('esbuild');
  const file = join(out, 'adapter-unit.cjs');
  await esbuild.build({ entryPoints: ['packages/web/src/qa-signer.ts'], bundle: true, platform: 'node', format: 'cjs', define: { 'import.meta.env.MODE': '"qa"', 'import.meta.env.VITE_QA_SIGNER': '"1"' }, outfile: file, logLevel: 'error' });
  const { setupQaSelector } = require(file), storage = new Map();
  const { actionCreators } = await import(pathToFileURL(require.resolve('@near-wallet-selector/core')).href);
  const previous = { window: globalThis.window, sessionStorage: globalThis.sessionStorage };
  globalThis.sessionStorage = { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
  let guarded = 0;
  globalThis.window = { __OTZAR_QA_BUDGET_CHECK__: async () => { guarded++; throw Error('UNIT_BUDGET_STOP'); }, __OTZAR_QA_RECORD__: async () => { throw Error('Unit check unexpectedly signed'); } };
  async function inject() {
    const credential = JSON.parse(readFileSync('.near-credentials/seller.json', 'utf8'));
    window.__OTZAR_QA_SIGNER__ = { accountId: credential.id, privateKey: credential.key, rpcUrl: 'https://near-testnet.drpc.org' }; credential.key = '';
    return setupQaSelector();
  }
  try {
    const selector = await inject(), wallet = await selector.wallet();
    assert.deepEqual(await wallet.getAccounts(), []);
    const accounts = await wallet.signIn({ contractId: 'hako-contract-mw984kpp.testnet' });
    assert.equal(accounts[0].accountId, 'hako-seller-mw984kqa.testnet'); assert.equal(window.__OTZAR_QA_SIGNER__, undefined);
    const receiverId = 'hako-contract-mw984kpp.testnet';
    await assert.rejects(wallet.signAndSendTransaction({ receiverId, actions: [actionCreators.functionCall('mint', {}, 120_000_000_000_000n, 0n)] }), /UNIT_BUDGET_STOP/);
    await assert.rejects(wallet.signAndSendTransaction({ receiverId, actions: [{ type: 'FunctionCall', params: { methodName: 'mint', args: {}, gas: '120000000000000', deposit: '0' } }] }), /UNIT_BUDGET_STOP/);
    assert.equal(guarded, 2);
    await assert.rejects(wallet.signAndSendTransaction({ receiverId, actions: [{ enum: 'transfer', transfer: { deposit: 1n } }] }), /function calls only/);
    await assert.rejects(wallet.signAndSendTransaction({ receiverId: 'refuse.near', actions: [actionCreators.functionCall('mint', {}, 1n, 0n)] }), /function calls only/);
    await assert.rejects(wallet.signAndSendTransaction({ receiverId, actions: [actionCreators.functionCall('mint', {}, 1n, 10n ** 22n)] }), /exceeds/);
    await assert.rejects(wallet.signAndSendTransaction({ receiverId, actions: [actionCreators.functionCall('mint', {}, 1n, -1n)] }), /function calls only/);
    const restored = await inject(); assert.equal((await (await restored.wallet()).getAccounts())[0].accountId, accounts[0].accountId);
    assert.deepEqual([...storage.values()], [accounts[0].accountId]); await (await restored.wallet()).signOut(); assert.equal(storage.size, 0);
    for (const data of [{ accountId: 'refuse.near', privateKey: 'invalid', rpcUrl: 'https://near-testnet.drpc.org' }, { accountId: accounts[0].accountId, privateKey: 'invalid', rpcUrl: 'https://rpc.mainnet.near.org' }]) { window.__OTZAR_QA_SIGNER__ = data; await assert.rejects(setupQaSelector, /requires a \.testnet account/); }
    const result = { status: 'PASS', transactions: 0, checks: ['Wallet Selector 10 native action', 'legacy selector action', 'unsupported action rejected', 'mainnet receiver rejected', 'deposit cap', 'negative deposit rejected', 'getAccounts/signIn/signOut', 'public selection survives reload', 'injection removed and no key in storage', 'mainnet account/RPC refused'] };
    writeFileSync(join(out, 'adapter-unit.json'), JSON.stringify(result, null, 2)); return result;
  } finally { if (previous.window === undefined) delete globalThis.window; else globalThis.window = previous.window; if (previous.sessionStorage === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = previous.sessionStorage; }
}
