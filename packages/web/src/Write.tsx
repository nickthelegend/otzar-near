import { useEffect, useMemo, useState } from 'react';
import { deriveAddresses, rpcQuery, signAuthorization, verifyAuthorization } from '@hako/sdk';
import { Card, LockBadge, v3art } from './blocks';
import { PriceChart } from './charts';
import { invalidateLiveCache, useBoxes, useRounds } from './data';
import { keyForVault, loadKeyFile, useKeys } from './keys';
import { useBtcPrice, useCandles, usd } from './live';
import { callLocksVault, contractId, esploraUrl, nearblocksTx, short, TUSDC_SYMBOL } from './lib';
import { PageHead } from './shell';
import { Field, Icon, Link, State } from './ui';
import { signAndSend, type Wallet } from './wallet';

function units(value: string, decimals: number, what: string): string {
  if (!/^\d+(?:\.\d+)?$/.test(value.trim())) throw new Error(`${what}: enter a positive number`);
  const [w, f = ''] = value.trim().split('.'); if (f.length > decimals) throw new Error(`${what}: at most ${decimals} decimals`);
  const n = BigInt(w) * 10n ** BigInt(decimals) + BigInt((f + '0'.repeat(decimals)).slice(0, decimals) || '0');
  if (n <= 0n) throw new Error(`${what} must be above zero`); return n.toString();
}
type Utxo = { txid: string; vout: number; sats: number };
type Stage = 'idle' | 'sign' | 'send' | 'done';

export default function Write({ wallet, initial }: { wallet: Wallet; initial: string }) {
  const boxes = useBoxes(); const rounds = useRounds(); const btc = useBtcPrice(); const candles = useCandles(900); useKeys();
  const mine = (boxes.data || []).filter(b => b.owner_id === wallet.account);
  const [vault, setVault] = useState(initial);
  const box = mine.find(b => b.token_id === vault) || (initial ? undefined : mine.find(b => b.pq_key));
  useEffect(() => { if (!vault && box) setVault(box.token_id); }, [box?.token_id]);
  const latest = (rounds.data || []).find(r => r.token_id === box?.token_id);
  const busyVault = callLocksVault(latest);
  const key = keyForVault(box?.pq_key);
  const [strike, setStrike] = useState(''); const [size, setSize] = useState('100000'); const [hours, setHours] = useState('4');
  const [opening, setOpening] = useState('0.001'); const [minimum, setMinimum] = useState('0.0005');
  const [utxo, setUtxo] = useState<{ list: Utxo[] | null; err: string }>({ list: null, err: '' });
  const [stage, setStage] = useState<Stage>('idle'); const [err, setErr] = useState(''); const [hash, setHash] = useState(''); const [keyErr, setKeyErr] = useState('');
  const spot = btc.price;
  useEffect(() => { if (!strike && spot) setStrike(String(Math.ceil((spot * 1.1) / 100) * 100)); }, [spot]);

  useEffect(() => {
    if (!box || !contractId) return; let on = true; setUtxo({ list: null, err: '' });
    (async () => {
      if (!esploraUrl) throw new Error('Setup required: VITE_BITCOIN_ESPLORA_URL (Bitcoin runs on a local regtest node)');
      const state = await rpcQuery(contractId!, 'btc_state', { token_id: box.token_id });
      if (!state) throw new Error('Register this vault’s Bitcoin rules first (vault page → Manage → Rules)');
      const a = await deriveAddresses(contractId!, box.token_id, state.epoch);
      const r = await fetch(`${esploraUrl}/address/${a.bitcoin}`); if (!r.ok) throw new Error(`Bitcoin service HTTP ${r.status}`);
      const j = await r.json(); if (!Array.isArray(j.utxos)) throw new Error('Bitcoin service returned no UTXO list');
      return (j.utxos as Utxo[]).map(u => ({ ...u, sats: Number(u.sats) }));
    })().then(list => { if (on) { setUtxo({ list, err: '' }); if (list.length === 1) setSize(String(Math.min(list[0].sats, 100000))); } }).catch(e => on && setUtxo({ list: null, err: (e as Error).message }));
    return () => { on = false; };
  }, [box?.token_id, esploraUrl]);

  const strikeN = Number(strike) || 0;
  const above = spot && strikeN ? ((strikeN - spot) / spot) * 100 : null;
  const levels = useMemo(() => strikeN ? [{ value: strikeN, label: 'Your strike', tone: 'gold' as const }] : [], [strikeN]);

  async function write() {
    setErr(''); setHash('');
    try {
      if (!contractId) throw new Error('Setup required: VITE_HAKO_CONTRACT');
      if (!box) throw new Error('Choose one of your vaults');
      if (!box.pq_key) throw new Error('Lock this vault with an ML-DSA key first (vault page → Manage → Keys)');
      if (!key) throw new Error('Load this vault’s ML-DSA key file first');
      if (!utxo.list) throw new Error(utxo.err || 'Still reading the Bitcoin collateral');
      if (utxo.list.length !== 1) throw new Error(`The vault needs exactly one confirmed UTXO as collateral (found ${utxo.list.length})`);
      const u = utxo.list[0];
      const strikeUnits = units(strike, 6, 'Strike'), openingUnits = units(opening, 6, 'Opening premium'), minimumUnits = units(minimum, 6, 'Minimum premium');
      if (!/^\d+$/.test(size) || BigInt(size) <= 0n || BigInt(size) > BigInt(u.sats)) throw new Error(`Size must be between 1 and ${u.sats.toLocaleString()} sats`);
      if (BigInt(minimumUnits) > BigInt(openingUnits)) throw new Error('The minimum premium cannot be above the opening premium');
      const outpoint = Buffer.concat([Buffer.from(u.txid, 'hex').reverse(), Buffer.alloc(4)]); outpoint.writeUInt32LE(u.vout, 32);
      const expirySec = Math.floor(Date.now() / 1000) + Math.floor(Number(hours) * 3600);
      if (!(Number(hours) > 0)) throw new Error('Term must be above zero hours');
      const payload = Buffer.from(JSON.stringify([strikeUnits, expirySec, size, openingUnits, minimumUnits, outpoint.toString('hex'), String(u.sats)]));
      setStage('sign');
      const file = JSON.parse(await key.file.text());
      await new Promise(r => setTimeout(r, 30));
      const signature = signAuthorization(Buffer.from(file.secretKey, 'base64'), box.token_id, box.nonce, payload);
      if (!verifyAuthorization(Uint8Array.from(box.pq_key), signature, box.token_id, box.nonce, payload)) throw new Error('This key file does not match the vault’s on-chain key');
      setStage('send');
      const result = await signAndSend(wallet.selector, contractId, 'write_call', { token_id: box.token_id, strike_usd_e6: strikeUnits, expiry_sec: expirySec, size_sats: size, opening_premium_usdc: openingUnits, minimum_premium_usdc: minimumUnits, collateral_outpoint_hex: outpoint.toString('hex'), collateral_sats: String(u.sats), nonce: box.nonce, signature: Buffer.from(signature).toString('base64') });
      if (result?.status?.Failure) throw new Error(`Rejected on chain: ${JSON.stringify(result.status.Failure).slice(0, 200)}`);
      setHash(result?.transaction?.hash || ''); setStage('done'); invalidateLiveCache(); boxes.reload(); rounds.reload();
    } catch (e) { setErr((e as Error).message); setStage('idle'); }
  }

  if (!wallet.account) return <div className="o-page"><PageHead title="Write a call" sub="Earn a premium on Bitcoin in your vault." />
    <div className="o-hero-empty"><img src={v3art('otzar-strike-dial')} alt="A jade and gold strike dial" /><div><h2>Connect to write a call</h2><p>You need a vault you own, locked with your ML-DSA key and holding Bitcoin.</p><button className="o-btn o-btn-ink o-btn-lg" onClick={wallet.connect} disabled={!wallet.ready}><Icon name="wallet" size={16} /> Connect wallet</button></div></div></div>;

  return <div className="o-page">
    <PageHead title="Write a call" sub="Offer your BTC at a price above today’s. Buyers pay you a premium for that offer, and you keep it whatever BTC does." />
    {!boxes.data ? <State kind="loading" title="Reading your vaults…" /> : !mine.length ? <div className="o-hero-empty"><img src={v3art('otzar-empty')} alt="" /><div><h2>You don’t own a vault yet</h2><p>Mint one from the Vaults page, lock it with your post-quantum key and fund its Bitcoin address.</p><Link to="/app" className="o-btn o-btn-ink">Go to vaults</Link></div></div> :
    <div className="o-grid o-grid-write">
      <div className="o-stack">
        <Card title="1 · Vault">
          {mine.length > 4 ? <div className="o-vsel">
            <img src={v3art('otzar-icon-128')} alt="" width="44" height="44" />
            <label className="field"><span className="field-label">Vault</span><select value={box?.token_id || ''} onChange={e => { setVault(e.target.value); setStage('idle'); setHash(''); }}>{[...mine].sort((x, y) => Number(!!y.pq_key) - Number(!!x.pq_key)).map(b => <option key={b.token_id} value={b.token_id}>{b.token_id}{b.pq_key ? '' : ' (not locked)'}</option>)}</select></label>
            {box && <LockBadge box={box} />}
          </div> : <div className="o-vpick">{mine.map(b => <button key={b.token_id} className={`o-vpick-i ${b.token_id === box?.token_id ? 'on' : ''}`} onClick={() => { setVault(b.token_id); setStage('idle'); setHash(''); }} aria-pressed={b.token_id === box?.token_id}>
            <img src={v3art('otzar-icon-128')} alt="" width="34" height="34" /><span><b>{short(b.token_id, 18, 6)}</b><LockBadge box={b} /></span></button>)}</div>}
          {busyVault && <p className="o-warn"><Icon name="clock" size={15} /> This vault already has an active round. You can write the next one after it settles.</p>}
        </Card>
        <Card title="2 · Your post-quantum key" className={key ? 'o-card-ok' : ''}>
          {!box?.pq_key ? <p className="o-warn">This vault has no ML-DSA key yet. <Link to={`/vault/${encodeURIComponent(box?.token_id || '')}`}>Lock it on the vault page</Link>.</p>
            : key ? <div className="o-keyok"><Icon name="shield" size={18} /><div><b>Key loaded · matches the vault’s on-chain key</b><small className="mono">ML-DSA-65 · fingerprint {key.fingerprint}</small></div></div>
            : <label className="o-drop"><input type="file" accept="application/json,.json" aria-label="Load ML-DSA key file" onChange={async e => { const f = e.target.files?.[0]; setKeyErr(''); if (f) try { const k = await loadKeyFile(f); if (keyForVault(box.pq_key)?.publicKey !== k.publicKey) setKeyErr('That key belongs to a different vault.'); } catch (x) { setKeyErr((x as Error).message); } }} />
              <img src={v3art('otzar-key')} alt="" /><span><b>Load the vault’s key file</b><small>It stays in this tab’s memory and is used to sign the terms. It is never uploaded.</small></span></label>}
          {keyErr && <p className="o-err">{keyErr}</p>}
        </Card>
        <Card title="3 · Terms">
          <div className="o-strikes" role="group" aria-label="Strike presets">{[5, 10, 15, 25].map(p => <button key={p} disabled={!spot} onClick={() => spot && setStrike(String(Math.ceil((spot * (1 + p / 100)) / 100) * 100))} className={above !== null && Math.abs(above - p) < 0.6 ? 'on' : ''}>+{p}%</button>)}</div>
          <div className="o-form">
            <Field label="Strike (USD)" hint={above !== null ? `${above >= 0 ? '+' : ''}${above.toFixed(1)}% vs live ${usd(spot, 0)}` : 'Live price loading'}><input value={strike} onChange={e => setStrike(e.target.value)} inputMode="decimal" /></Field>
            <Field label="Size (sats)" hint={utxo.list?.length === 1 ? `Collateral ${utxo.list[0].sats.toLocaleString()} sats` : undefined}><input value={size} onChange={e => setSize(e.target.value)} inputMode="numeric" /></Field>
            <Field label="Term (hours)" hint="Expiry, counted from now"><input value={hours} onChange={e => setHours(e.target.value)} inputMode="decimal" /></Field>
            <Field label={`Opening premium (${TUSDC_SYMBOL})`} hint="The ask starts here"><input value={opening} onChange={e => setOpening(e.target.value)} inputMode="decimal" /></Field>
            <Field label={`Minimum premium (${TUSDC_SYMBOL})`} hint="…and falls to this"><input value={minimum} onChange={e => setMinimum(e.target.value)} inputMode="decimal" /></Field>
          </div>
        </Card>
      </div>
      <aside className="o-side o-side-sticky">
        <Card title="Your strike vs BTC today">
          <PriceChart candles={candles.data?.slice(-96) || null} live={spot} levels={levels} height={210} />
          <p className="o-mute small">Above the gold line, the buyer may buy your BTC at the strike. Below it, you keep the BTC and the premium.</p>
        </Card>
        <Card title="Review and sign" className="o-card-review">
          <dl className="o-kv">
            <div><dt>Vault</dt><dd>{box ? short(box.token_id, 18, 6) : '—'}</dd></div>
            <div><dt>Collateral</dt><dd>{utxo.list ? utxo.list.length === 1 ? `${utxo.list[0].sats.toLocaleString()} sats · 1 UTXO` : `${utxo.list.length} UTXOs` : utxo.err ? <span className="o-err-inline" title={utxo.err}>Unavailable</span> : 'Checking…'}</dd></div>
            <div><dt>Sell up to</dt><dd className="tnum">{(Number(size) / 1e8).toFixed(4)} BTC at {strikeN ? usd(strikeN, 0) : '—'}</dd></div>
            <div><dt>Premium</dt><dd className="tnum">{opening} → {minimum} {TUSDC_SYMBOL}</dd></div>
            <div><dt>Signed with</dt><dd><Icon name="shield" size={13} /> ML-DSA-65</dd></div>
          </dl>
          <ol className={`o-sign o-sign-${stage}`} aria-live="polite">
            <li className={stage !== 'idle' ? 'did' : ''}>Sign the terms with your ML-DSA-65 key</li>
            <li className={stage === 'send' ? 'doing' : stage === 'done' ? 'did' : ''}>NEAR verifies the signature in the contract</li>
            <li className={stage === 'done' ? 'did' : ''}>Your call opens to buyers</li>
          </ol>
          {stage === 'done' ? <div className="o-done" role="status"><Icon name="check" size={16} /><span>write_call confirmed on NEAR. Buyers can pay you a premium now. {hash && <a href={nearblocksTx(hash)} target="_blank" rel="noreferrer">View transaction <Icon name="external" size={12} /></a>}</span></div>
            : <button className="o-btn o-btn-ink o-btn-block o-btn-lg" onClick={write} disabled={stage !== 'idle' || !box || busyVault}>{stage === 'sign' ? 'Signing with ML-DSA-65…' : stage === 'send' ? 'Waiting for NEAR…' : 'Sign and write call'}</button>}
          {err && <p className="o-err" role="alert">{err}</p>}
          {stage === 'done' && <Link to="/market" className="o-link">See it in Buy calls <Icon name="arrow" size={13} /></Link>}
        </Card>
      </aside>
    </div>}
  </div>;
}
