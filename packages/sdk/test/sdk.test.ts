import { describe, expect, it } from 'vitest';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { ethereumAddress, bitcoinAddress, derivePublicKey, rootPublicKey, verifyDerivation, newQuantumKey, signAuthorization, authorizationMessage, unsignedEthTransfer } from '../src/index.js';

describe('live testnet MPC key derivation', () => {
  it('matches the signer contract view for ETH and BTC paths', async () => {
    const id='hako-derivation.testnet';
    const root=await rootPublicKey();
    for (const chain of ['ethereum','bitcoin'] as const) {
      const path=`hako/${chain}/sdk-test/0`;
      expect(await verifyDerivation(id,path)).toBe(true);
      const pub=derivePublicKey(root,id,path);
      if (chain==='ethereum') expect(ethereumAddress(pub)).toMatch(/^0x[0-9a-f]{40}$/);
      else expect(bitcoinAddress(pub)).toMatch(/^bcrt1q/);
    }
  },30_000);
});

describe('authorization', () => {
  it('signs the exact contract message with ML-DSA-65', () => {
    const key=newQuantumKey();
    const raw=Buffer.from(unsignedEthTransfer({chainId:31337,nonce:0,to:'0x1111111111111111111111111111111111111111',value:1000n,maxFeePerGas:2_000_000_000n,maxPriorityFeePerGas:1_000_000_000n}).slice(2),'hex');
    const signature=signAuthorization(key.secretKey,'box1',0,raw);
    expect(ml_dsa65.verify(signature,authorizationMessage('box1',0,raw),key.publicKey)).toBe(true);
    expect(ml_dsa65.verify(signature,authorizationMessage('box1',1,raw),key.publicKey)).toBe(false);
  });
});
