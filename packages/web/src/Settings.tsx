import { useEffect, useState } from 'react';
import { Card } from './blocks';
import { useCallConfig } from './data';
import { forgetAll, forgetKey, loadKeyFile, useKeys } from './keys';
import { contractId, esploraUrl, nearblocksAccount, short } from './lib';
import { PageHead } from './shell';
import { Icon } from './ui';
import type { Wallet } from './wallet';

const PROBES: [string, string, () => Promise<Response>][] = [
  ['NEAR RPC (FastNEAR)', 'https://test.rpc.fastnear.com', () => fetch('https://test.rpc.fastnear.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"status","params":[]}' })],
  ['NEAR RPC (dRPC)', 'https://near-testnet.drpc.org', () => fetch('https://near-testnet.drpc.org', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"status","params":[]}' })],
  ['Coinbase BTC-USD', 'api.exchange.coinbase.com', () => fetch('https://api.exchange.coinbase.com/products/BTC-USD/ticker', { cache: 'no-store' })],
  ['NearBlocks activity', 'api-testnet.nearblocks.io', () => fetch(`https://api-testnet.nearblocks.io/v3/accounts/${contractId}/txns/count`)],
];

function Probe({ name, host, run }: { name: string; host: string; run: () => Promise<Response> }) {
  const [s, setS] = useState<{ ms?: number; err?: string }>({});
  const go = () => { setS({}); const t = performance.now(); run().then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); setS({ ms: Math.round(performance.now() - t) }); }).catch(e => setS({ err: (e as Error).message })); };
  useEffect(go, []);
  return <li><span className={`o-dot ${s.ms ? 'ok' : s.err ? 'bad' : ''}`} aria-hidden="true" /><span><b>{name}</b><small className="mono">{host}</small></span><span className="tnum">{s.ms ? `${s.ms} ms` : s.err ? <span className="o-err-inline">{s.err}</span> : 'Checking…'}</span><button className="o-icon-btn" aria-label={`Re-check ${name}`} onClick={go}><Icon name="refresh" size={15} /></button></li>;
}

export default function Settings({ wallet }: { wallet: Wallet }) {
  const keys = useKeys(); const cfg = useCallConfig(); const [err, setErr] = useState('');
  return <div className="o-page o-page-narrow">
    <PageHead title="Settings" sub="Your wallet, your post-quantum keys, and where every number in the app comes from." />
    <Card title="Wallet">
      {wallet.account ? <div className="o-set-row"><span><b>{wallet.account}</b><small>Meteor Wallet · NEAR testnet</small></span><button className="o-btn o-btn-line o-btn-sm" onClick={wallet.disconnect}>Sign out</button></div>
        : <div className="o-set-row"><span><b>Not connected</b><small>Browsing needs no wallet. Writing and buying calls do.</small></span><button className="o-btn o-btn-ink o-btn-sm" onClick={wallet.connect} disabled={!wallet.ready}>Connect</button></div>}
    </Card>
    <Card title="Post-quantum keys in this tab" action={<label className="o-btn o-btn-line o-btn-sm o-file"><input type="file" accept=".json,application/json" aria-label="Load ML-DSA key file" onChange={async e => { const f = e.target.files?.[0]; setErr(''); if (f) try { await loadKeyFile(f); } catch (x) { setErr((x as Error).message); } }} /><Icon name="key" size={14} /> Load key file</label>}>
      <p className="o-mute small">ML-DSA-65 key files are held in memory only and forgotten when you close or reload the tab. They are never uploaded or saved in the browser.</p>
      {err && <p className="o-err">{err}</p>}
      {keys.length ? <ul className="o-set-list">{keys.map(k => <li key={k.publicKey}><Icon name="shield" size={16} /><span><b>{k.name}</b><small className="mono">fingerprint {k.fingerprint}</small></span><button className="o-btn o-btn-line o-btn-sm" onClick={() => forgetKey(k.publicKey)}>Forget</button></li>)}<li><span /><span /><button className="o-btn o-btn-line o-btn-sm" onClick={forgetAll}>Forget all</button></li></ul>
        : <p className="o-empty-line">No key loaded.</p>}
    </Card>
    <Card title="Contract and tokens">
      <dl className="o-kv o-kv-wide">
        <div><dt>Otzar contract</dt><dd>{contractId ? <a href={nearblocksAccount(contractId)} target="_blank" rel="noreferrer" className="mono">{contractId} <Icon name="external" size={11} /></a> : <span className="o-err-inline">Setup required: VITE_HAKO_CONTRACT</span>}</dd></div>
        <div><dt>Premium token</dt><dd className="mono">{cfg.data?.premium_token || (cfg.error ? 'Unavailable' : '…')}</dd></div>
        <div><dt>Settlement price</dt><dd>{cfg.data?.price_label || '…'}</dd></div>
        <div><dt>Relayer key</dt><dd className="mono">{cfg.data?.relayer_public_key ? short(cfg.data.relayer_public_key, 16, 6) : '…'}</dd></div>
        <div><dt>Bitcoin node</dt><dd>{esploraUrl ? <span className="mono">{esploraUrl}</span> : 'Not configured: Bitcoin runs on a local regtest node (README)'}</dd></div>
        <div><dt>MPC signer</dt><dd className="mono">v1.signer-prod.testnet</dd></div>
      </dl>
    </Card>
    <Card title="Data sources"><ul className="o-probes">{PROBES.map(([n, h, r]) => <Probe key={n} name={n} host={h} run={r} />)}</ul></Card>
  </div>;
}
