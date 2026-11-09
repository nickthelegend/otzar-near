import { useEffect, useState } from 'react';
import { rpcQuery } from '@hako/sdk';
import evidence from './evidence/live-calls.json';
import { annualisedPct, callStateLabel, callTenorSec, contractId, e6, nearblocksAccount, nearblocksTx, short, tenorLabel, TUSDC_SYMBOL, type CoveredCall, type RelayerPrice } from './lib';
import { Chip, Icon } from './ui';

type Row = (typeof evidence.calls)[number];
type Live = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ok'; calls: (CoveredCall | null)[]; price: RelayerPrice | null };

function TxLink({ hash, label }: { hash: string | null; label: string }) {
  if (!hash) return null;
  return <a className="earned-link" href={nearblocksTx(hash)} target="_blank" rel="noreferrer">{label}<Icon name="external" size={13} /></a>;
}

/** The covered calls Hako actually wrote, sold and settled on NEAR testnet; every figure is a live contract read. */
export default function EarnedProof() {
  const [live, setLive] = useState<Live>({ state: 'loading' });
  useEffect(() => {
    let on = true;
    const load = async () => {
      if (!contractId) throw new Error('Setup required: VITE_HAKO_CONTRACT');
      const calls = await Promise.all(evidence.calls.map(c => rpcQuery(contractId!, 'call_state', { token_id: c.tokenId }) as Promise<CoveredCall | null>));
      const price = await rpcQuery(contractId, 'relayer_price', {}) as RelayerPrice | null;
      return { calls, price };
    };
    const tick = () => load().then(v => on && setLive({ state: 'ok', ...v })).catch(e => on && setLive({ state: 'error', message: (e as Error).message }));
    tick(); const t = setInterval(tick, 60000);
    return () => { on = false; clearInterval(t); };
  }, []);

  const calls = live.state === 'ok' ? live.calls : [];
  const paid = calls.filter((c): c is CoveredCall => !!c?.premium_paid_usdc);
  const earned = paid.reduce((a, c) => a + BigInt(c.premium_paid_usdc!), 0n);
  // Blended: total premium over the sum of (strike notional x tenor), annualised.
  const notionalTime = paid.reduce((a, c) => a + Number(BigInt(c.strike_usd_e6) * BigInt(c.size_sats) / 100_000_000n) * callTenorSec(c), 0);
  const tenor = paid.length ? paid.reduce((a, c) => a + callTenorSec(c), 0) / paid.length : 0;
  const blended = paid.length && notionalTime > 0 ? Number(earned) / notionalTime * 365 * 86400 * 100 : null;

  return <div className="earned" aria-live="polite">
    <div className="earned-head">
      <div>
        <span className="earned-k">It earned · NEAR testnet</span>
        <div className="earned-total">
          <strong className={live.state !== 'ok' ? 'stat-dim' : ''}>{live.state === 'ok' ? e6(earned, 2) : '—'}</strong>
          <span>{TUSDC_SYMBOL} premium paid to the writer</span>
        </div>
      </div>
      <div className="earned-apy">
        <strong className={blended === null ? 'stat-dim' : ''}>{blended === null ? '—' : `${blended.toFixed(1)}%`}</strong>
        <span>annualised yield, computed from that premium</span>
        <small>premium ÷ (strike × size) × 365 d ÷ {tenor ? tenorLabel(tenor) : 'tenor'}</small>
      </div>
    </div>
    {live.state === 'error' && <p className="inline-error" role="alert">{live.message}</p>}
    <div className="earned-rows">
      {evidence.calls.map((row: Row, i) => {
        const c = calls[i] || null; const y = c ? annualisedPct(c) : null;
        const done = c && (c.state === 'signed' || c.state === 'otm');
        return <article key={row.tokenId} className="earned-row">
          <div className="earned-row-top">
            <span className="earned-kind">{row.kind === 'itm' ? 'In the money' : 'Out of the money'}</span>
            {live.state === 'loading' ? <Chip>Reading…</Chip> : c ? <Chip tone={done ? 'ok' : 'idle'}>{callStateLabel[c.state] || c.state}</Chip> : <Chip tone="bad">Not found</Chip>}
          </div>
          <dl className="earned-kv">
            <div><dt>Premium</dt><dd>{c?.premium_paid_usdc ? `${e6(c.premium_paid_usdc, 2)} ${TUSDC_SYMBOL}` : '—'}</dd></div>
            <div><dt>Annualised</dt><dd>{y === null ? '—' : `${y.toFixed(1)}%`}</dd></div>
            <div><dt>Strike</dt><dd>{c ? `$${e6(c.strike_usd_e6, 0)}` : '—'}</dd></div>
            <div><dt>Settled at</dt><dd>{c?.oracle_price_usd_e6 ? `$${e6(c.oracle_price_usd_e6, 2)}` : '—'}</dd></div>
            <div><dt>Size</dt><dd>{c ? `${(Number(c.size_sats) / 1e8).toFixed(2)} BTC` : '—'}</dd></div>
            <div><dt>Tenor</dt><dd>{c ? tenorLabel(callTenorSec(c)) : '—'}</dd></div>
          </dl>
          <p className="earned-outcome">{row.kind === 'itm'
            ? <>BTC closed above the strike. The buyer paid the strike in {TUSDC_SYMBOL}; the contract MPC-signed 0.1 regtest BTC to the buyer{row.btcTx ? <> in <code title={row.btcTx}>{short(row.btcTx, 8, 6)}</code></> : null}.</>
            : <>BTC closed below the strike. The call expired worthless, the encumbrance lifted and the writer's own MPC-signed spend returned the collateral{row.btcTx ? <> in <code title={row.btcTx}>{short(row.btcTx, 8, 6)}</code></> : null}.</>}</p>
          <div className="earned-links">
            <TxLink hash={row.write} label="Write" />
            <TxLink hash={row.buy} label="Premium" />
            <TxLink hash={row.settle} label="Settle" />
            <TxLink hash={row.strike} label="Strike" />
            <TxLink hash={row.release} label="Release" />
            <TxLink hash={row.mpc} label="MPC sign" />
          </div>
        </article>;
      })}
    </div>
    <p className="earned-foot">
      <span>{TUSDC_SYMBOL} is Hako's own testnet token (<a href={nearblocksAccount(evidence.premiumToken)} target="_blank" rel="noreferrer"><code>{evidence.premiumToken}</code></a>), no value. Bitcoin is Bitcoin Core regtest. Prices are a Coinbase BTC-USD print signed by the Hako relayer key and checked on-chain: <b>relayer price (testnet)</b>{live.state === 'ok' && live.price ? <>, last ${e6(live.price.price_usd_e6, 2)}</> : null}{evidence.price ? <> · <a href={nearblocksTx(evidence.price)} target="_blank" rel="noreferrer">settlement price tx</a></> : null}.</span>
      <span>A four-minute tenor annualises a tiny premium; the auction was quoted between 5% and 20% APR of notional. Demo terms, not an options-model price and not a forecast.</span>
    </p>
  </div>;
}
