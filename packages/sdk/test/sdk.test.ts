import { describe, expect, it } from 'vitest';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { ethereumAddress, bitcoinAddress, derivePublicKey, rootPublicKey, verifyDerivation, newQuantumKey, signAuthorization, authorizationMessage, unsignedEthTransfer, solanaAddress, unsignedSolanaTransfer, scanBitcoin, scanEthereum, guardianConfigPayload, recoveryMessage, deriveAddresses, oneClickTokens } from '../src/index.js';
import { Keypair } from '@solana/web3.js';

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

describe('live exposure reads', () => {
  it('reads Bitcoin address history and balance from an Esplora chain service', async () => {
    const result=await scanBitcoin('bc1qqyqszqgpqyqszqgpqyqszqgpqyqszqgpyfl4f3');
    expect(result.balance).toMatch(/^\d+$/);
    expect(result.scannedTransactions).toBeGreaterThanOrEqual(0);
    expect(result.source).toMatch(/^https:\/\//);
  },30_000);
  it('reads an Ethereum account nonce, balance, and code from public RPC', async () => {
    const result=await scanEthereum('0x000000000000000000000000000000000000dEaD');
    expect(result.balance).not.toBeNull();
    expect(BigInt(result.balance!)).toBeGreaterThanOrEqual(0n);
    expect(result.chain).toBe('ethereum');
  },30_000);
  it('flags a P2PK public key even when a public indexer omits its output', async () => {
    const key='0496b538e853519c726a2c91e61ec11600ae1390813a627c66fb8be7947be63c52da7589379515d4e0a604f8141781e62294721166bf621e73a82cbf2342c858ee';
    const result=await scanBitcoin(key);
    expect(result.exposed).toBe(true);
    expect(result.reasons.join(' ')).toContain('P2PK');
  },30_000);
});

describe('Solana MPC', () => {
  it('reads a real testnet EdDSA derived key and builds a transfer message', async () => {
    const source=await solanaAddress('hako-derivation.testnet','solana-sdk-test');
    const recipient=Keypair.generate().publicKey.toBase58();
    const message=unsignedSolanaTransfer(source,recipient,1000n,Keypair.generate().publicKey.toBase58());
    expect(Buffer.from(message,'hex').length).toBe(150);
  },30_000);
  it('binds guardian configuration and recovery to keys and nonces', () => {
    const a=newQuantumKey(), b=newQuantumKey(), next=newQuantumKey();
    expect(guardianConfigPayload('box',[a.publicKey,b.publicKey],2,120)).not.toEqual(guardianConfigPayload('box',[a.publicKey,b.publicKey],1,120));
    expect(recoveryMessage('box','owner.testnet',0,next.publicKey)).not.toEqual(recoveryMessage('box','owner.testnet',1,next.publicKey));
  });
});

describe('live 1Click supported assets', () => {
  it('lists native BTC and an ETH origin and derives a real MPC mainnet Bitcoin recipient', async () => {
    const tokens=await oneClickTokens();
    expect(tokens.some(t=>t.assetId==='nep141:btc.omft.near'&&t.blockchain==='btc')).toBe(true);
    const source=tokens.find(t=>t.blockchain==='eth'&&t.symbol==='ETH');
    expect(source).toBeDefined();
    const derived=await deriveAddresses('hako-contract-mw984kpp.testnet','box-mw99z867',1);
    const recipient=bitcoinAddress(Buffer.from(derived.bitcoinPublicKey,'hex'),'mainnet');
    expect(recipient).toMatch(/^bc1q/);
    expect(derived.ethereum).toMatch(/^0x[0-9a-f]{40}$/);
  },30_000);
});
