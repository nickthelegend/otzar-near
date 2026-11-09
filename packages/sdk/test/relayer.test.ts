import { describe, expect, it } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { usdToE6, fetchCoinbaseBtcUsd, relayerPriceMessage, signRelayerPrice, COINBASE_BTC_USD } from '../src/index.js';

describe('relayer price', () => {
  it('parses decimal prices exactly', () => {
    expect(usdToE6('74864.23')).toBe(74_864_230_000n);
    expect(usdToE6('1')).toBe(1_000_000n);
    expect(usdToE6('0.1234567')).toBe(123_456n);
    expect(() => usdToE6('7e4')).toThrow();
  });
  it('signs the exact message the contract verifies', () => {
    const seed = sha256(new TextEncoder().encode('hako relayer unit test seed'));
    const print = { priceUsdE6: 74_864_230_000n, publishTimeSec: 1_778_000_000, sourceUrl: COINBASE_BTC_USD };
    const msg = relayerPriceMessage('hako.testnet', print.priceUsdE6, print.publishTimeSec, print.sourceUrl);
    expect(Buffer.from(msg)).toEqual(Buffer.from(sha256(new TextEncoder().encode(`hako:relayer-price:v1:hako.testnet:BTC-USD:74864230000:1778000000:${COINBASE_BTC_USD}`))));
    const sig = Buffer.from(signRelayerPrice(seed, 'hako.testnet', print), 'base64');
    expect(sig.length).toBe(64);
    expect(ed25519.verify(sig, msg, ed25519.getPublicKey(seed))).toBe(true);
    expect(ed25519.verify(sig, relayerPriceMessage('other.testnet', print.priceUsdE6, print.publishTimeSec, print.sourceUrl), ed25519.getPublicKey(seed))).toBe(false);
  });
  it('reads a live Coinbase BTC-USD print', async () => {
    const p = await fetchCoinbaseBtcUsd();
    expect(p.priceUsdE6).toBeGreaterThan(1_000_000_000n);
    expect(Math.abs(Date.now() / 1000 - p.publishTimeSec)).toBeLessThan(600);
  }, 20_000);
});
