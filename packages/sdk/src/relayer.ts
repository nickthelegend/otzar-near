// Testnet price relayer helpers. Pyth Core no longer serves NEAR, so on testnet Hako settles
// covered calls against a public Coinbase BTC-USD spot print, signed by a relayer ed25519 key
// and verified on-chain. Mainnet design: read the Rhea price oracle instead.
import { sha256 } from '@noble/hashes/sha2.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import bs58 from 'bs58';

export const RELAYER_PRICE_LABEL = 'relayer price (testnet)';
export const COINBASE_BTC_USD = 'https://api.exchange.coinbase.com/products/BTC-USD/ticker';

export type SpotPrint = { priceUsdE6: bigint; publishTimeSec: number; sourceUrl: string; price: string; time: string; tradeId: number };

/** Parses a decimal string like "74864.23" into integer micro-dollars without floating point. */
export function usdToE6(price: string): bigint {
  if (!/^\d+(\.\d+)?$/.test(price)) throw new Error(`price is not a plain decimal: ${price}`);
  const [whole, frac = ''] = price.split('.');
  return BigInt(whole) * 1_000_000n + BigInt((frac + '000000').slice(0, 6));
}

/** Fetches the last BTC-USD trade from Coinbase Exchange. Throws on any non-200 or malformed body. */
export async function fetchCoinbaseBtcUsd(fetcher: typeof fetch = fetch): Promise<SpotPrint> {
  const r = await fetcher(COINBASE_BTC_USD, { headers: { accept: 'application/json', 'user-agent': 'hako-price-relayer' } });
  if (!r.ok) throw new Error(`Coinbase BTC-USD ticker HTTP ${r.status}`);
  const body = await r.json() as { price?: string; time?: string; trade_id?: number };
  if (typeof body.price !== 'string' || typeof body.time !== 'string') throw new Error('Coinbase BTC-USD ticker: missing price or time');
  const ms = Date.parse(body.time);
  if (!Number.isFinite(ms)) throw new Error(`Coinbase BTC-USD ticker: bad time ${body.time}`);
  return { priceUsdE6: usdToE6(body.price), publishTimeSec: Math.floor(ms / 1000), sourceUrl: COINBASE_BTC_USD, price: body.price, time: body.time, tradeId: Number(body.trade_id) };
}

/** sha256 of the exact string `post_relayer_price` verifies against the relayer key. */
export function relayerPriceMessage(contractId: string, priceUsdE6: bigint, publishTimeSec: number, sourceUrl: string): Uint8Array {
  return sha256(utf8ToBytes(`hako:relayer-price:v1:${contractId}:BTC-USD:${priceUsdE6}:${publishTimeSec}:${sourceUrl}`));
}

/** Signs a print with a raw 32-byte ed25519 seed; returns the base64 signature for `post_relayer_price`. */
export function signRelayerPrice(seed: Uint8Array, contractId: string, print: Pick<SpotPrint, 'priceUsdE6' | 'publishTimeSec' | 'sourceUrl'>): string {
  return Buffer.from(ed25519.sign(relayerPriceMessage(contractId, print.priceUsdE6, print.publishTimeSec, print.sourceUrl), seed)).toString('base64');
}

/** NEAR-format public key (`ed25519:<base58>`) for a raw 32-byte relayer seed. */
export function relayerPublicKey(seed: Uint8Array): string {
  return `ed25519:${bs58.encode(ed25519.getPublicKey(seed))}`;
}
