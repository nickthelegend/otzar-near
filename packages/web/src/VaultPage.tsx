import { useCallback, useEffect, useMemo, useState } from 'react';
import { broadcastEth, deriveAddresses, ethBalance, newQuantumKey, rpcQuery, signAuthorization, signedEthTransaction, solanaAddress, solanaBalance, unsignedEthTransfer, verifyAuthorization } from '@hako/sdk';
import BitcoinPanel from './BitcoinPanel';
import EarnPanel from './EarnPanel';
import ExposureScanner from './ExposureScanner';
import SolanaPanel from './SolanaPanel';
import VaultPolicyPanel from './VaultPolicyPanel';
import { annualisedPct, anvilUrl, contractId, e6, earnedSummary, esploraUrl, formatEth, loadBoxes, nearblocksAccount, nearblocksTx, roundPhase, short, TUSDC_SYMBOL, utcDay, ZERO_ETH, type Box, type Round, type Spend } from './lib';
import { Amount, Chip, Copyable, Empty, Field, Icon, Link, State, Term, TERMS, Timeline } from './ui';
import { CountUp } from './art';
import { useNow, useRelayer, useRounds } from './data';
import { PhasePill, PLAIN, roundSentence, StrikeSpot, TYPE_LABEL, vaultType } from './cards';
import { RoundSheet } from './RoundSheet';
import { Loop, pct } from './rounds';
import { signAndSend, type Wallet } from './wallet';

const gas = '120000000000000';
const solRpc = (import.meta.env.VITE_SOLANA_RPC_URL as string | undefined) || 'http://127.0.0.1:8899';
type Tab = 'overview' | 'rules' | 'send' | 'earn' | 'recovery' | 'sell';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'rules', label: 'Rules' }, { id: 'send', label: 'Send' },
  { id: 'earn', label: 'Rounds' }, { id: 'recovery', label: 'Recovery' }, { id: 'sell', label: 'Sell' },
];
type Props = { id: string; wallet: Wallet };

async function evm(method: string, params: unknown[]) { const r = await fetch(anvilUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }); if (!r.ok) throw new Error(`Ethereum RPC ${r.status}`); const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error)); return j.result; }
function b64(bytes: Uint8Array) { return Buffer.from(bytes).toString('base64'); }
function toWei(eth: string) { if (!/^\d+(\.\d{1,18})?$/.test(eth.trim())) throw new Error('Enter the daily cap in ETH, e.g. 0.01'); const [w, f = ''] = eth.trim().split('.'); const v = BigInt(w) * 10n ** 18n + BigInt((f + '0'.repeat(18)).slice(0, 18)); if (v <= 0n) throw new Error('Daily cap must be above zero'); return v.toString(); }

export default function VaultPage({ id, wallet }: Props) {
  const { selector, account, connect } = wallet;
  const [boxes, setBoxes] = useState<Box[]>([]); const [loaded, setLoaded] = useState(false);
  const selected = id; const [tab, setTab] = useState<Tab>('overview');
  const [spends, setSpends] = useState<Spend[]>([]);
  const [addresses, setAddresses] = useState<{ ethereum: string; bitcoin: string } | null>(null);
  const [eth, setEth] = useState<{ v: string; err?: string }>({ v: '' }); const [btc, setBtc] = useState<{ v: string; err?: string }>({ v: '', err: 'Setup required: VITE_BITCOIN_ESPLORA_URL' });
  const [sol, setSol] = useState<{ addr: string; v: string; err?: string }>({ addr: '', v: '' });
  const [status, setStatus] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [txHash, setTxHash] = useState('');
  const [clock, setClock] = useState(Date.now());
  const [guardian, setGuardian] = useState(''); const [recovery, setRecovery] = useState(''); const [allow, setAllow] = useState(''); const [capEth, setCapEth] = useState('0.01');
  const [price, setPrice] = useState('0.01'); const [sendTo, setSendTo] = useState(''); const [sendAmount, setSendAmount] = useState('0.001');
  const [chain, setChain] = useState<'ETH' | 'BTC' | 'SOL'>('ETH');
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const box = useMemo(() => boxes.find(b => b.token_id === selected), [boxes, selected]);
  const mine = box?.owner_id === account && !!account;

  const refresh = useCallback(async () => { const all = await loadBoxes(); setBoxes(all); setLoaded(true); }, [account]);
  useEffect(() => { refresh().catch(e => { setLoaded(true); setError(e.message); }); const t = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(t); }, [refresh]);
  useEffect(() => { setKeyFile(null); }, [selected]);
  useEffect(() => {
    if (!box || !contractId) return; let cancelled = false;
    Promise.all([deriveAddresses(contractId, box.token_id, box.epoch), rpcQuery(contractId, 'spends_for_box', { token_id: box.token_id })]).then(async ([a, s]) => {
      if (cancelled) return; setAddresses(a); setSpends(s);
      try { setEth({ v: formatEth(await ethBalance(a.ethereum, anvilUrl)) }); } catch (e) { setEth({ v: '', err: `Setup required: VITE_ANVIL_RPC_URL (${(e as Error).message})` }); }
      if (esploraUrl) { try { const r = await fetch(`${esploraUrl}/address/${a.bitcoin}`); if (!r.ok) throw new Error(`HTTP ${r.status}`); const j = await r.json(); if (j.error) throw new Error(j.error); const sats = j.confirmed_sats !== undefined ? BigInt(j.confirmed_sats) : BigInt(j.chain_stats.funded_txo_sum - j.chain_stats.spent_txo_sum); setBtc({ v: (Number(sats) / 1e8).toFixed(8) }); } catch (e) { setBtc({ v: '', err: (e as Error).message }); } }
    }).catch(e => setError(e.message));
    solanaAddress(contractId, box.token_id, box.epoch).then(async addr => { if (cancelled) return; try { setSol({ addr, v: (Number(await solanaBalance(addr, solRpc)) / 1e9).toFixed(6) }); } catch (e) { setSol({ addr, v: '', err: `Setup required: VITE_SOLANA_RPC_URL (${(e as Error).message})` }); } }).catch(() => {});
    return () => { cancelled = true; };
  }, [box?.token_id, box?.epoch, Math.floor(clock / 15000)]);

  async function invoke(method: string, args: object, deposit = '0', receiver?: string) {
    if (!contractId) throw new Error('Setup required: VITE_HAKO_CONTRACT');
    if (!selector || !account) throw new Error('Connect a NEAR testnet wallet first');
    const result = await signAndSend(selector, receiver || contractId, method, args, deposit, gas);
    if (!result) { setStatus('Complete the transaction in your wallet, then refresh.'); return; }
    if (result.status?.Failure) throw new Error(JSON.stringify(result.status.Failure));
    const hash = result.transaction?.hash; if (hash) setTxHash(hash); setStatus(`${method} confirmed on NEAR`); await refresh();
  }
  async function run(fn: () => Promise<void>) { setBusy(true); setError(''); setStatus(''); setTxHash(''); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function secretKey() { if (!keyFile) throw new Error('Setup required: ML_DSA_KEY file. Load it with “Load key” above.'); const file = JSON.parse(await keyFile.text()); if (typeof file.secretKey !== 'string') throw new Error('Invalid ML-DSA key file'); return Buffer.from(file.secretKey, 'base64'); }
  function policyFromForm() { return { daily_eth_wei: toWei(capEth), delay_sec: 120, allow_eth: allow ? allow.split(',').map(x => x.trim()).filter(Boolean) : [], guardian, recovery_eth: recovery, emergency_migration: null }; }

  async function registerKey() { await run(async () => { if (!box) throw new Error('Select a vault'); const key = newQuantumKey(); const payload = JSON.stringify({ type: 'hako-ml-dsa-65', publicKey: b64(key.publicKey), secretKey: b64(key.secretKey) }); const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `otzar-${box.token_id}-key.json`; a.click(); URL.revokeObjectURL(url); await invoke('register_pq_key', { token_id: box.token_id, key: b64(key.publicKey) }); setStatus('Quantum key registered. Keep the downloaded key file safe; it is the only copy.'); }); }
  async function activatePolicy() { await run(async () => { if (!box) throw new Error('Select a vault'); const secret = await secretKey(); if (!guardian || !recovery) throw new Error('Enter your guardian and recovery address'); const policy = policyFromForm(); const data = Buffer.from(JSON.stringify(policy)); const signature = signAuthorization(secret, box.token_id, box.nonce, data); if (!verifyAuthorization(Uint8Array.from(box.pq_key || []), signature, box.token_id, box.nonce, data)) throw new Error('Key file does not match this vault'); await invoke('set_policy', { token_id: box.token_id, policy, nonce: box.nonce, signature: b64(signature) }); }); }
  async function requestSend() { await run(async () => { if (!box || !addresses) throw new Error('Select a box'); const secret = await secretKey(); if (!/^0x[0-9a-fA-F]{40}$/.test(sendTo)) throw new Error('Enter a valid Ethereum destination'); const pub = Uint8Array.from(box.pq_key || []); const nonce = Number(await evm('eth_getTransactionCount', [addresses.ethereum, 'pending'])); const gasPrice = BigInt(await evm('eth_gasPrice', [])); const amount = BigInt(Math.round(Number(sendAmount) * 1e18)); const raw = unsignedEthTransfer({ chainId: 31337, nonce, to: sendTo as `0x${string}`, value: amount, maxFeePerGas: gasPrice * 2n, maxPriorityFeePerGas: gasPrice }); const bytes = Buffer.from(raw.slice(2), 'hex'); const signature = signAuthorization(secret, box.token_id, box.nonce, bytes); if (!verifyAuthorization(pub, signature, box.token_id, box.nonce, bytes)) throw new Error('Key file does not match this vault'); await invoke('request_eth_spend', { token_id: box.token_id, raw_unsigned_hex: raw, nonce: box.nonce, signature: b64(signature) }); }); }
  async function clawback(s: Spend) { await run(async () => { if (!box || !addresses) throw new Error('Select a box'); const nonce = Number(await evm('eth_getTransactionCount', [addresses.ethereum, 'pending'])); const gasPrice = BigInt(await evm('eth_gasPrice', [])); const raw = unsignedEthTransfer({ chainId: 31337, nonce, to: box.policy.recovery_eth as `0x${string}`, value: BigInt(s.amount_wei), maxFeePerGas: gasPrice * 2n, maxPriorityFeePerGas: gasPrice }); await invoke('guardian_clawback_eth', { spend_id: s.id, recovery_tx_hex: raw }); }); }
  async function broadcast(s: Spend) { await run(async () => { if (!s.signature_json) throw new Error('MPC signature unavailable'); const signed = signedEthTransaction(s.raw_unsigned_hex as `0x${string}`, s.signature_json); const hash = await broadcastEth(signed, anvilUrl); setStatus(`Anvil accepted transaction ${hash}`); setTxHash(''); }); }

  const pending = spends.filter(s => s.state === 'pending' || s.state === 'signing');
  const policyActive = !!box && box.policy.recovery_eth !== ZERO_ETH;
  const panelProps = box ? { box, contractId: contractId!, account, busy, keyFile, invoke, run } : null;

  const ethTimeline = spends.slice().reverse().map(s => ({
    key: `eth-${s.id}`, chain: 'ETH' as const, recovery: s.clawback, state: s.state,
    title: `${formatEth(s.amount_wei)} ETH → ${short(s.destination, 8, 6)}`, detail: `request #${s.id}`,
    createdMs: s.created_ns / 1e6, readyMs: s.ready_ns / 1e6,
    actions: <>
      {s.state === 'pending' && s.ready_ns / 1e6 <= clock && <button className="btn btn-primary btn-sm" onClick={() => run(() => invoke('execute_eth', { spend_id: s.id }))} disabled={busy}>Sign via NEAR MPC</button>}
      {s.state === 'pending' && s.ready_ns / 1e6 > clock && account === box?.policy.guardian && <button className="btn btn-danger btn-sm" onClick={() => clawback(s)} disabled={busy}>Claw back</button>}
      {s.state === 'signed' && <button className="btn btn-ghost btn-sm" onClick={() => broadcast(s)} disabled={busy}>Broadcast to Anvil</button>}
    </>,
  }));

  const rounds = useRounds(); const now = useNow(5000);
  const boxRounds = (rounds.data || []).filter(r => r.token_id === id);
  const latest = boxRounds[0];
  const earned = earnedSummary(boxRounds);

  const relayer = useRelayer();
  const [side, setSide] = useState<'deposit' | 'withdraw'>('deposit');
  const [sheet, setSheet] = useState<Round | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  useEffect(() => { if (mine) setToolsOpen(true); }, [mine]);
  const goManage = (t: Tab, c?: 'ETH' | 'BTC' | 'SOL') => {
    setTab(t); if (c) setChain(c); setToolsOpen(true);
    requestAnimationFrame(() => document.getElementById('manage')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  };

  if (!box) return <div className="page vault s-app">
    <Link to="/app" className="back"><Icon name="back" size={16} /> Vaults</Link>
    {error ? <State kind="error" title="Could not read this vault">{error}</State>
      : loaded ? <State kind="empty" title={`No vault called ${id}`} action={<Link to="/app" className="pill pill-line pill-sm">Back to vaults</Link>}>The contract has no NFT with this ID.</State>
      : <div className="s-vhead skeleton" aria-busy="true" />}
  </div>;

  const ph = latest ? roundPhase(latest, now) : null;
  const locked = !!latest && ['auction', 'purchasing', 'sold', 'settling', 'itm', 'paying', 'paid', 'signing'].includes(latest.state) && !(latest.state === 'auction' && ph?.phase === 'unfilled');
  const live = ph?.phase === 'live';
  const spot = latest?.oracle_price_usd_e6 || relayer.data?.price_usd_e6 || null;
  const apy = earned.blended;
  const type = vaultType(box.token_id, boxRounds.length > 0);
  const sealed = !!box.pq_key?.length;

  return <div className="page vault s-app">
    <Link to="/app" className="back"><Icon name="back" size={16} /> Vaults</Link>
    <header className="s-vhead">
      <div className="s-vhead-copy">
        <p className="s-k">{TYPE_LABEL[type]}{mine ? ' · your vault' : ''}</p>
        <h1>{box.token_id}</h1>
        <p className="s-vhead-say">Holds native Bitcoin and sells covered calls on it. Owned by <a href={nearblocksAccount(box.owner_id)} target="_blank" rel="noreferrer" className="mono">{short(box.owner_id, 16, 8)}</a>{sealed ? <>, sealed with a <Term tip={TERMS.mldsa}>post-quantum key</Term>.</> : '. No quantum key yet.'}</p>
      </div>
      <dl className="s-vfigs">
        <div><dt><Term tip={TERMS.apy}>Earned</Term></dt><dd className="gold-num">{rounds.data ? pct(apy, 2) : '…'}</dd></div>
        <div><dt><Term tip={TERMS.premium}>Premium</Term></dt><dd>{rounds.data ? <Amount e6={earned.earned} unit={TUSDC_SYMBOL} /> : '…'}</dd></div>
        <div><dt><Term tip={TERMS.round}>Rounds</Term></dt><dd>{rounds.data ? boxRounds.length : '…'}</dd></div>
      </dl>
    </header>

    <div className="v-grid">
      <div className="v-main">
        <section className="card s-thisround" aria-label="Latest round">
          <div className="s-list-head"><h2>{latest ? `Latest round · ${utcDay(latest.opened_ns)}` : 'Latest round'}</h2>{latest && <><PhasePill c={latest} now={now} plain /><button className="pill pill-line pill-sm" onClick={() => setSheet(latest)}>Details <Icon name="arrow" size={14} /></button></>}</div>
          {latest ? <>
            <p className="s-round-say">{roundSentence(latest, now)}</p>
            <StrikeSpot c={latest} spotE6={spot} spotLabel={latest.oracle_price_usd_e6 ? 'BTC settled' : 'BTC now (relayer)'} />
            <div className="cr-loop"><Loop c={latest} now={now} horizontal /></div>
          </> : <State kind="empty" title="No rounds yet" action={mine ? <button className="pill pill-jade pill-sm" onClick={() => goManage('earn')}>Write a covered call</button> : undefined}>The owner writes a round from Owner tools, signed with the vault's quantum key.</State>}
        </section>

        {boxRounds.length > 1 && <section className="card s-list" aria-label="Every round">
          <div className="s-list-head"><h2>Every round</h2></div>
          <div className="s-rounds">{boxRounds.map(r => <button key={r.key} className="s-rounds-row" onClick={() => setSheet(r)}>
            <span><b>#{r.id}</b><small>{utcDay(r.opened_ns)} · ${e6(r.strike_usd_e6, 0)}</small></span>
            <PhasePill c={r} now={now} plain />
            <span className="gold-num">{pct(annualisedPct(r))}</span>
            <Icon name="arrow" size={15} />
          </button>)}</div>
        </section>}

        <div className="s-folds">
          <details className="s-fold">
            <summary><span><b>How this vault earns</b><small>The covered call, step by step</small></span><Icon name="plus" size={18} /></summary>
            <div className="strat-grid">
              <div className="strat-copy">
                <p>The owner offers to sell this vault's BTC at a set price. A buyer pays a premium in <Term tip={TERMS.tusdc}>{TUSDC_SYMBOL}</Term> for that right, and the vault keeps it either way.</p>
                <ol className="strat-steps">
                  <li><b>Write</b><span>Price (the strike), amount, end date and a falling premium range, signed with the quantum key. The vault's BTC can't move while it runs.</span></li>
                  <li><b>Auction</b><span>The asking premium falls until a buyer pays it with <code>ft_transfer_call</code>.</span></li>
                  <li><b>Settle</b><span>A signed Coinbase BTC-USD price ends the round. Above the strike the buyer pays it and NEAR signs the BTC over; below it the BTC stays.</span></li>
                </ol>
              </div>
              <figure className="payoff">
                <svg viewBox="0 0 320 180" role="img" aria-label="Covered call payoff: rises with BTC until the strike, then flat">
                  <line x1="20" y1="160" x2="310" y2="160" className="axis" /><line x1="20" y1="14" x2="20" y2="160" className="axis" />
                  <line x1="180" y1="14" x2="180" y2="160" className="strike" />
                  <path d="M20 146 L180 56 L310 56" className="pay" /><path d="M20 158 L180 70 L310 0" className="hold" />
                  <text x="186" y="28">strike</text><text x="226" y="50">covered call</text><text x="226" y="92" className="dim">BTC alone</text><text x="250" y="176">BTC price →</text>
                </svg>
                <figcaption>The shape of the payoff, not a forecast. The lift on the left is the premium; the flat part on the right is the upside you give up.</figcaption>
              </figure>
            </div>
          </details>

          <details className="s-fold">
            <summary><span><b>Safety locks</b><small>{[sealed ? 'Quantum key' : 'No key', policyActive ? `${box.policy.delay_sec}s delay` : 'No rules', box.policy.guardian ? 'Guardian' : 'No guardian'].join(' · ')}</small></span><Icon name="plus" size={18} /></summary>
            <div className="tumblers">
              <div className={sealed ? 'on' : ''}><Icon name="key" size={18} /><b>{sealed ? 'ML-DSA-65' : 'No key'}</b><span>who can spend</span></div>
              <div className={policyActive ? 'on' : ''}><Icon name="clock" size={18} /><b>{policyActive ? `${box.policy.delay_sec}s delay` : 'Not set'}</b><span>spending rules</span></div>
              <div className={box.policy.guardian ? 'on' : ''}><Icon name="shield" size={18} /><b>{box.policy.guardian ? short(box.policy.guardian, 10, 6) : 'None'}</b><span>guardian</span></div>
              <div className={box.ever_signed ? 'on' : ''}><Icon name="spark" size={18} /><b>{box.ever_signed ? 'Signed' : 'Never'}</b><span>NEAR signature</span></div>
            </div>
            <Link to="/how#safety" className="s-textlink">What each lock does, in plain words <Icon name="arrow" size={13} /></Link>
          </details>

          <details className="s-fold" id="manage" open={toolsOpen} onToggle={e => setToolsOpen((e.currentTarget as HTMLDetailsElement).open)}>
            <summary><span><b>Owner tools</b><small>Key, rules, send, rounds, recovery and sale</small></span><Icon name="plus" size={18} /></summary>
            <div className="manage">
              {!account && <div className="readonly"><Icon name="lock" /><span>You're viewing live contract state. Connect a NEAR testnet wallet to sign.</span><button className="pill pill-line pill-sm" onClick={connect}>Connect</button></div>}
              <div className="keyslot">
                <Icon name="key" />
                <span>{keyFile ? <>Key loaded <code>{short(keyFile.name, 14, 8)}</code></> : sealed ? 'Load your ML-DSA key file to sign actions on this vault' : 'This vault has no ML-DSA key yet'}</span>
                {sealed ? <label className="pill pill-line pill-sm file-btn">{keyFile ? 'Change' : 'Load key'}<input type="file" accept=".json" onChange={e => setKeyFile(e.target.files?.[0] || null)} /></label> : mine && <button className="pill pill-jade pill-sm" onClick={registerKey} disabled={busy}>Generate and register</button>}
              </div>
              <nav className="vtabs" role="tablist" aria-label="Owner tools">
                {TABS.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}{t.id === 'send' && pending.length > 0 && <i className="tab-dot" />}</button>)}
              </nav>

              <div className="tab-body" role="tabpanel">
                {tab === 'overview' && <>
                  <div className="assets">
                    <div className="asset"><div className="asset-top"><span className="asset-sym">BTC</span><span>Bitcoin · regtest</span></div><strong className={btc.err ? 'dim' : ''}>{btc.v || '—'}</strong>{btc.err && <small className="asset-err">{btc.err}</small>}<Copyable value={addresses?.bitcoin || ''} label="Bitcoin address" /></div>
                    <div className="asset"><div className="asset-top"><span className="asset-sym">ETH</span><span>Ethereum · Anvil</span></div><strong className={eth.err ? 'dim' : ''}>{eth.v || '—'}</strong>{eth.err && <small className="asset-err">{eth.err}</small>}<Copyable value={addresses?.ethereum || ''} label="Ethereum address" /></div>
                    <div className="asset"><div className="asset-top"><span className="asset-sym">SOL</span><span>Solana · local validator</span></div><strong className={sol.err ? 'dim' : ''}>{sol.v || '—'}</strong>{sol.err && <small className="asset-err">{sol.err}</small>}<Copyable value={sol.addr} label="Solana address" /></div>
                  </div>
                  <p className="fineprint">Addresses are derived live from the NEAR signer for the path <code>hako/{box.token_id}/{box.epoch}</code> (an on-chain ID that keeps Otzar's former name). Local test coins have no market value.</p>
                  <div className="card">
                    <div className="card-head"><div><h3>Sweep exposed coins in</h3><p>Scan an address you control. If its key is exposed, build an unsigned sweep into this vault.</p></div></div>
                    <ExposureScanner target={addresses} targetUsable={!box.ever_signed} bitcoinProxy={esploraUrl} anvilRpc={anvilUrl} />
                  </div>
                </>}

                {tab === 'rules' && <>
                  <div className="card">
                    <div className="card-head"><div><h3>Ethereum rules</h3><p>Enforced by the contract before any signature is requested.</p></div>{policyActive ? <Chip tone="ok">Active</Chip> : <Chip tone="warn">Not set</Chip>}</div>
                    <dl className="kv">
                      <div><dt>Daily cap</dt><dd>{formatEth(box.policy.daily_eth_wei)} ETH</dd></div>
                      <div><dt>Clawback delay</dt><dd>{box.policy.delay_sec}s outside the allowlist</dd></div>
                      <div><dt>Guardian</dt><dd><code>{box.policy.guardian}</code></dd></div>
                      <div><dt>Recovery address</dt><dd><code>{box.policy.recovery_eth}</code></dd></div>
                      <div><dt>Allowlist</dt><dd>{box.policy.allow_eth.length ? box.policy.allow_eth.map(a => <code key={a}>{a}</code>) : 'None'}</dd></div>
                      <div><dt>Emergency migration</dt><dd>{box.policy.emergency_migration || 'Not registered'}</dd></div>
                    </dl>
                    {mine && sealed && !policyActive && <div className="form">
                      <h4>Activate your rules</h4>
                      <p className="fineprint">A transferred vault resets its rules. Set your own guardian and recovery address before sending. Signed with your ML-DSA key.</p>
                      <div className="form-grid">
                        <Field label="Guardian NEAR account"><input value={guardian} onChange={e => setGuardian(e.target.value)} placeholder="guardian.testnet" /></Field>
                        <Field label="Recovery ETH address"><input value={recovery} onChange={e => setRecovery(e.target.value)} placeholder="0x…" /></Field>
                        <Field label="Allowlisted ETH addresses" hint="Comma separated; these skip the delay"><input value={allow} onChange={e => setAllow(e.target.value)} placeholder="0x…, 0x…" /></Field>
                        <Field label="Daily cap (ETH)"><input value={capEth} onChange={e => setCapEth(e.target.value)} inputMode="decimal" /></Field>
                      </div>
                      <button className="btn btn-primary" onClick={activatePolicy} disabled={busy}>Sign and set rules</button>
                    </div>}
                  </div>
                  <BitcoinPanel {...panelProps!} view="rules" bitcoinAddress={addresses?.bitcoin || ''} clock={clock} />
                  <SolanaPanel {...panelProps!} view="rules" />
                </>}

                {tab === 'send' && <>
                  <div className="seg seg-lg" role="radiogroup" aria-label="Chain">
                    {(['ETH', 'BTC', 'SOL'] as const).map(c => <button key={c} role="radio" aria-checked={chain === c} className={chain === c ? 'on' : ''} onClick={() => setChain(c)}>{c}</button>)}
                  </div>
                  {chain === 'ETH' && <>
                    <div className="card">
                      <div className="card-head"><div><h3>Send ETH</h3><p>Your ML-DSA key signs the exact Anvil transaction. The contract checks the cap and starts the delay.</p></div></div>
                      {!mine ? <p className="fineprint">Only the owner can request a spend.</p> : !sealed ? <p className="fineprint">Register an ML-DSA key first.</p> : !policyActive ? <p className="fineprint">Set your rules first (Rules tab).</p> : <div className="form">
                        <div className="form-grid">
                          <Field label="Destination"><input value={sendTo} onChange={e => setSendTo(e.target.value)} placeholder="0x…" spellCheck={false} /></Field>
                          <Field label="Amount (ETH)"><input value={sendAmount} onChange={e => setSendAmount(e.target.value)} inputMode="decimal" /></Field>
                        </div>
                        <button className="btn btn-primary" onClick={requestSend} disabled={busy}><Icon name="send" /> Sign and request spend</button>
                      </div>}
                    </div>
                    <div className="card">
                      <div className="card-head"><div><h3>ETH spend requests</h3><p>Each request waits out the delay; the guardian can claw it back until then.</p></div><Chip tone={pending.length ? 'warn' : 'idle'}>{pending.length} pending</Chip></div>
                      {spends.length === 0 ? <Empty icon="clock" title="No spend requests yet" /> : <Timeline items={ethTimeline} clock={clock} />}
                    </div>
                  </>}
                  {chain === 'BTC' && <BitcoinPanel {...panelProps!} view="send" bitcoinAddress={addresses?.bitcoin || ''} clock={clock} />}
                  {chain === 'SOL' && <SolanaPanel {...panelProps!} view="send" />}
                </>}

                {tab === 'earn' && <EarnPanel {...panelProps!} clock={clock} />}

                {tab === 'recovery' && <VaultPolicyPanel {...panelProps!} />}

                {tab === 'sell' && <div className="card">
                  <div className="card-head"><div><h3>Sell the whole vault</h3><p>The buyer receives the NFT, and with it the addresses and coins. No foreign-chain transfer at sale time.</p></div>{box.listed_yocto ? <Chip tone="ice">Listed</Chip> : <Chip>Not listed</Chip>}</div>
                  {box.ever_signed && <p className="warn-line"><Icon name="shield" /> This vault has issued a NEAR signature, so the contract will not let it be resold.</p>}
                  {box.listed_yocto ? <div className="sale">
                    <div className="sale-price"><span>Asking</span><strong>{formatEth(box.listed_yocto)}</strong><small>NEAR</small></div>
                    <button className="btn btn-primary" onClick={() => run(() => invoke('buy', { token_id: box.token_id }, box.listed_yocto!))} disabled={busy || !account || pending.length > 0}>Buy this vault</button>
                  </div> : mine && !box.ever_signed ? <div className="form">
                    <div className="form-grid"><Field label="Price (NEAR)"><input value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" /></Field></div>
                    <button className="btn btn-primary" onClick={() => run(() => invoke('list', { token_id: box.token_id, price: (BigInt(Math.round(Number(price) * 1e6)) * 10n ** 18n).toString() }))} disabled={busy || pending.length > 0}><Icon name="tag" /> List for sale</button>
                  </div> : !box.ever_signed && <p className="fineprint">Only the owner can list this vault.</p>}
                </div>}
              </div>
            </div>
          </details>
        </div>
      </div>

      <aside className="v-side" aria-label="Deposit and withdraw">
        <div className="panel s-panel">
          <div className="seg2" role="tablist" aria-label="Deposit or withdraw">
            <button role="tab" aria-selected={side === 'deposit'} className={side === 'deposit' ? 'on' : ''} onClick={() => setSide('deposit')}>Deposit</button>
            <button role="tab" aria-selected={side === 'withdraw'} className={side === 'withdraw' ? 'on' : ''} onClick={() => setSide('withdraw')}>Withdraw</button>
          </div>
          {side === 'deposit' ? <div className="panel-body">
            <div className="s-box">
              <div className="s-box-top"><span className="coin">BTC</span><b>Bitcoin</b><small>You send</small></div>
              <Copyable value={addresses?.bitcoin || ''} label="Bitcoin deposit address" />
              <p className="s-box-foot"><span>In the vault</span><span>{btc.v ? `${btc.v} BTC` : <span className="warn">{btc.err || '…'}</span>}</span></p>
            </div>
            <span className="s-swap" aria-hidden="true"><Icon name="arrow" size={16} /></span>
            <div className="s-box">
              <div className="s-box-top"><span className="coin coin-jade">%</span><b>The vault earns</b><small>premium in {TUSDC_SYMBOL}</small></div>
              <p className="s-box-big"><CountUp value={rounds.data ? apy : null} decimals={2} suffix="%" /><small><Term tip={TERMS.apy}>realised APY</Term></small></p>
              <p className="s-box-foot"><span>Right now</span><span>{ph ? (ph.phase === 'other' ? ph.label : PLAIN[ph.phase]) : 'No round yet'}</span></p>
            </div>
            {!account ? <button className="pill pill-gold pill-block pill-lg" onClick={connect} disabled={!wallet.ready}><Icon name="wallet" size={17} /> Connect wallet</button>
              : live && latest ? <button className="pill pill-gold pill-block pill-lg" onClick={() => setSheet(latest)}>Buy this round's call</button>
              : mine ? <button className="pill pill-gold pill-block pill-lg" onClick={() => goManage('earn')}>Write a covered call</button>
              : <button className="pill pill-gold pill-block pill-lg" disabled>Only the owner writes rounds</button>}
            <button className="link-btn" onClick={() => goManage('earn')}>Deposit from ETH, SOL or USDC (quote only) <Icon name="arrow" size={13} /></button>
            <p className="panel-note">Bitcoin Core regtest. Anyone can send BTC here; only the vault's quantum key can move it.</p>
          </div> : <div className="panel-body">
            <div className={`lock-state ${locked ? 'is-locked' : ''}`}><Icon name={locked ? 'lock' : 'check'} size={18} /><div><b>{locked ? `Locked by round #${latest!.id}` : 'Free to withdraw'}</b><span>{locked ? 'The BTC waits until the round settles or is released.' : latest?.state === 'signed' ? 'The last round ended above the strike; its BTC went to the buyer.' : 'No open round holds this vault’s BTC.'}</span></div></div>
            <div className="s-box">
              <div className="s-box-top"><span className="coin">BTC</span><b>Bitcoin</b><small>You receive</small></div>
              <p className="s-box-text">To any address you choose, signed with the vault's quantum key.</p>
              <p className="s-box-foot"><span>Safety delay</span><span>{box.policy.delay_sec}s, guardian can pull it back</span></p>
            </div>
            {!account ? <button className="pill pill-gold pill-block pill-lg" onClick={connect} disabled={!wallet.ready}><Icon name="wallet" size={17} /> Connect wallet</button>
              : mine ? <button className="pill pill-gold pill-block pill-lg" onClick={() => goManage('send', 'BTC')} disabled={locked}>{locked ? 'Waiting for the round to settle' : 'Withdraw BTC'}</button>
              : <button className="pill pill-gold pill-block pill-lg" disabled>Only the owner can withdraw</button>}
            <p className="panel-note">A withdrawal waits out the delay. During it the guardian can send the coins to your recovery address instead.</p>
          </div>}
        </div>
      </aside>
    </div>

    {(status || error) && <div className={`toast ${error ? 'toast-bad' : ''}`} role={error ? 'alert' : 'status'}>
      <span>{error || status}</span>
      {txHash && !error && <a href={nearblocksTx(txHash)} target="_blank" rel="noreferrer">View on NearBlocks <Icon name="external" size={14} /></a>}
      <button className="toast-x" onClick={() => { setError(''); setStatus(''); }} aria-label="Dismiss">×</button>
    </div>}

    {sheet && <RoundSheet r={sheet} wallet={wallet} onClose={() => setSheet(null)} />}
  </div>;
}
