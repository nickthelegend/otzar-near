import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { broadcastEth, deriveAddresses, ethBalance, newQuantumKey, rpcQuery, signAuthorization, signedEthTransaction, solanaAddress, solanaBalance, unsignedEthTransfer, verifyAuthorization } from '@hako/sdk';
import BitcoinPanel from './BitcoinPanel';
import EarnPanel from './EarnPanel';
import ExposureScanner from './ExposureScanner';
import PortfolioTotals from './PortfolioTotals';
import SolanaPanel from './SolanaPanel';
import VaultPolicyPanel from './VaultPolicyPanel';
import { anvilUrl, contractId, esploraUrl, formatEth, loadBoxes, nearblocksTx, short, ZERO_ETH, type Box, type Spend } from './lib';
import { Chip, Copyable, Empty, Eyebrow, Field, Icon, Timeline } from './ui';

const gas = '120000000000000';
const solRpc = (import.meta.env.VITE_SOLANA_RPC_URL as string | undefined) || 'http://127.0.0.1:8899';
type Tab = 'overview' | 'rules' | 'send' | 'earn' | 'recovery' | 'sell';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'rules', label: 'Rules' }, { id: 'send', label: 'Send' },
  { id: 'earn', label: 'Earn' }, { id: 'recovery', label: 'Recovery' }, { id: 'sell', label: 'Sell' },
];
type Props = { selector: any; account: string; connect: () => Promise<void> };

async function evm(method: string, params: unknown[]) { const r = await fetch(anvilUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }); if (!r.ok) throw new Error(`Ethereum RPC ${r.status}`); const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error)); return j.result; }
function b64(bytes: Uint8Array) { return Buffer.from(bytes).toString('base64'); }
function toWei(eth: string) { if (!/^\d+(\.\d{1,18})?$/.test(eth.trim())) throw new Error('Enter the daily cap in ETH, e.g. 0.01'); const [w, f = ''] = eth.trim().split('.'); const v = BigInt(w) * 10n ** 18n + BigInt((f + '0'.repeat(18)).slice(0, 18)); if (v <= 0n) throw new Error('Daily cap must be above zero'); return v.toString(); }

function VaultGlyph({ box }: { box: Box }) {
  const hue = [...box.token_id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  return <span className="glyph" style={{ ['--h' as string]: `${170 + (hue % 40)}` }} aria-hidden="true">箱</span>;
}

export default function WalletApp({ selector, account, connect }: Props) {
  const [boxes, setBoxes] = useState<Box[]>([]); const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState(''); const [tab, setTab] = useState<Tab>('overview');
  const [spends, setSpends] = useState<Spend[]>([]);
  const [addresses, setAddresses] = useState<{ ethereum: string; bitcoin: string } | null>(null);
  const [eth, setEth] = useState<{ v: string; err?: string }>({ v: '' }); const [btc, setBtc] = useState<{ v: string; err?: string }>({ v: '', err: 'Setup required: VITE_BITCOIN_ESPLORA_URL' });
  const [sol, setSol] = useState<{ addr: string; v: string; err?: string }>({ addr: '', v: '' });
  const [status, setStatus] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [txHash, setTxHash] = useState('');
  const [clock, setClock] = useState(Date.now());
  const [mintOpen, setMintOpen] = useState(false); const [mintId, setMintId] = useState(''); const [guardian, setGuardian] = useState(''); const [recovery, setRecovery] = useState(''); const [allow, setAllow] = useState(''); const [capEth, setCapEth] = useState('0.01');
  const [price, setPrice] = useState('0.01'); const [sendTo, setSendTo] = useState(''); const [sendAmount, setSendAmount] = useState('0.001');
  const [chain, setChain] = useState<'ETH' | 'BTC' | 'SOL'>('ETH');
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const box = useMemo(() => boxes.find(b => b.token_id === selected), [boxes, selected]);
  const sorted = useMemo(() => [...boxes].sort((a, b) => Number(b.owner_id === account) - Number(a.owner_id === account)), [boxes, account]);
  const mine = box?.owner_id === account && !!account;

  const refresh = useCallback(async () => { const all = await loadBoxes(); setBoxes(all); setLoaded(true); setSelected(s => s || (all.find(b => b.owner_id === account) || all[0])?.token_id || ''); }, [account]);
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
    const wallet = await selector.wallet('my-near-wallet');
    const result = await wallet.signAndSendTransaction({ receiverId: receiver || contractId, actions: [{ type: 'FunctionCall', params: { methodName: method, args, gas, deposit } }] });
    if (!result) { setStatus('Complete the transaction in your wallet, then refresh.'); return; }
    if (result.status?.Failure) throw new Error(JSON.stringify(result.status.Failure));
    const hash = result.transaction?.hash; if (hash) setTxHash(hash); setStatus(`${method} confirmed on NEAR`); await refresh();
  }
  async function run(fn: () => Promise<void>) { setBusy(true); setError(''); setStatus(''); setTxHash(''); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function secretKey() { if (!keyFile) throw new Error('Setup required: ML_DSA_KEY file. Load it with “Load key” above.'); const file = JSON.parse(await keyFile.text()); if (typeof file.secretKey !== 'string') throw new Error('Invalid ML-DSA key file'); return Buffer.from(file.secretKey, 'base64'); }
  function policyFromForm() { return { daily_eth_wei: toWei(capEth), delay_sec: 120, allow_eth: allow ? allow.split(',').map(x => x.trim()).filter(Boolean) : [], guardian, recovery_eth: recovery, emergency_migration: null }; }

  async function mint() { await run(async () => { if (!mintId || !guardian || !recovery) throw new Error('Enter a box ID, a guardian account and a recovery ETH address'); await invoke('mint', { token_id: mintId, policy: policyFromForm() }); setSelected(mintId); dialog.current?.close(); setMintOpen(false); }); }
  async function registerKey() { await run(async () => { if (!box) throw new Error('Select a box'); const key = newQuantumKey(); const payload = JSON.stringify({ type: 'hako-ml-dsa-65', publicKey: b64(key.publicKey), secretKey: b64(key.secretKey) }); const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `hako-${box.token_id}-key.json`; a.click(); URL.revokeObjectURL(url); await invoke('register_pq_key', { token_id: box.token_id, key: b64(key.publicKey) }); setStatus('Quantum key registered. Keep the downloaded key file safe; it is the only copy.'); }); }
  async function activatePolicy() { await run(async () => { if (!box) throw new Error('Select a box'); const secret = await secretKey(); if (!guardian || !recovery) throw new Error('Enter your guardian and recovery address'); const policy = policyFromForm(); const data = Buffer.from(JSON.stringify(policy)); const signature = signAuthorization(secret, box.token_id, box.nonce, data); if (!verifyAuthorization(Uint8Array.from(box.pq_key || []), signature, box.token_id, box.nonce, data)) throw new Error('Key file does not match this box'); await invoke('set_policy', { token_id: box.token_id, policy, nonce: box.nonce, signature: b64(signature) }); }); }
  async function requestSend() { await run(async () => { if (!box || !addresses) throw new Error('Select a box'); const secret = await secretKey(); if (!/^0x[0-9a-fA-F]{40}$/.test(sendTo)) throw new Error('Enter a valid Ethereum destination'); const pub = Uint8Array.from(box.pq_key || []); const nonce = Number(await evm('eth_getTransactionCount', [addresses.ethereum, 'pending'])); const gasPrice = BigInt(await evm('eth_gasPrice', [])); const amount = BigInt(Math.round(Number(sendAmount) * 1e18)); const raw = unsignedEthTransfer({ chainId: 31337, nonce, to: sendTo as `0x${string}`, value: amount, maxFeePerGas: gasPrice * 2n, maxPriorityFeePerGas: gasPrice }); const bytes = Buffer.from(raw.slice(2), 'hex'); const signature = signAuthorization(secret, box.token_id, box.nonce, bytes); if (!verifyAuthorization(pub, signature, box.token_id, box.nonce, bytes)) throw new Error('Key file does not match this box'); await invoke('request_eth_spend', { token_id: box.token_id, raw_unsigned_hex: raw, nonce: box.nonce, signature: b64(signature) }); }); }
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

  return <div className="app">
    <aside className="rail" aria-label="Vaults">
      <div className="rail-head">
        <div><Eyebrow>vaults</Eyebrow><h1>Your boxes</h1></div>
        <button className="btn btn-icon" onClick={() => { setMintOpen(true); dialog.current?.showModal(); }} aria-label="Mint a new vault" title="Mint a new vault"><Icon name="plus" /></button>
      </div>
      <PortfolioTotals boxes={boxes} account={account} contractId={contractId} bitcoinProxy={esploraUrl} anvilRpc={anvilUrl} />
      {!contractId && <Chip tone="warn">Setup required: VITE_HAKO_CONTRACT</Chip>}
      <div className="vault-list" role="listbox" aria-label="Vault NFTs">
        {!loaded && [0, 1, 2].map(i => <div key={i} className="vault-card skeleton" aria-busy="true" />)}
        {loaded && boxes.length === 0 && <Empty title="No boxes yet">Mint the first vault with the + button.</Empty>}
        {sorted.map(b => <button key={b.token_id} role="option" aria-selected={selected === b.token_id} className={`vault-card ${selected === b.token_id ? 'active' : ''}`} onClick={() => setSelected(b.token_id)}>
          <VaultGlyph box={b} />
          <span className="vc-main"><strong>{b.token_id}</strong><small>{b.owner_id === account ? 'You' : short(b.owner_id, 12, 8)}</small></span>
          <span className="vc-chips">
            {b.pq_key?.length ? <Chip tone="ok">ML-DSA</Chip> : <Chip tone="warn">No key</Chip>}
            {b.listed_yocto && <Chip tone="ice">Listed</Chip>}
          </span>
        </button>)}
      </div>
    </aside>

    <section className="vault-main">
      {!account && <div className="readonly"><Icon name="lock" /><span>Read-only view of live contract state. Connect a NEAR testnet wallet to mint, sign and spend.</span><button className="btn btn-ghost btn-sm" onClick={connect}>Connect wallet</button></div>}
      {!box ? <div className="vault-empty"><Empty title={loaded ? 'Pick a vault' : 'Reading the contract…'}>{loaded ? 'Choose a box on the left, or mint a new one.' : 'Loading vault NFTs from NEAR testnet.'}</Empty></div> : <>
        <header className="vault-head">
          <div className="vh-id">
            <VaultGlyph box={box} />
            <div>
              <Eyebrow>{`box · epoch ${box.epoch} · nonce ${box.nonce}`}</Eyebrow>
              <h2>{box.token_id}</h2>
              <p>Owned by <code>{box.owner_id}</code>{mine && <Chip tone="ice">You</Chip>}</p>
            </div>
          </div>
          <div className="vh-chips">
            {box.pq_key?.length ? <Chip tone="ok">Authority · ML-DSA-65</Chip> : <Chip tone="warn">No quantum key</Chip>}
            {policyActive ? <Chip tone="ok">Policy active</Chip> : <Chip tone="warn">Policy not set</Chip>}
            {box.ever_signed && <Chip tone="idle">Has MPC signature</Chip>}
            {box.listed_yocto && <Chip tone="ice">Listed · {formatEth(box.listed_yocto)} NEAR</Chip>}
            {pending.length > 0 && <Chip tone="warn">{pending.length} pending</Chip>}
          </div>
          <div className="keyslot">
            <Icon name="key" />
            <span>{keyFile ? <>Key loaded <code>{short(keyFile.name, 14, 8)}</code></> : box.pq_key?.length ? 'Load your ML-DSA key file to sign actions' : 'This box has no ML-DSA key yet'}</span>
            {box.pq_key?.length ? <label className="btn btn-ghost btn-sm file-btn">{keyFile ? 'Change' : 'Load key'}<input type="file" accept=".json" onChange={e => setKeyFile(e.target.files?.[0] || null)} /></label> : mine && <button className="btn btn-primary btn-sm" onClick={registerKey} disabled={busy}>Generate and register</button>}
          </div>
        </header>

        <nav className="tabs" role="tablist" aria-label="Vault sections">
          {TABS.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}{t.id === 'send' && pending.length > 0 && <i className="tab-dot" />}</button>)}
        </nav>

        <div className="tab-body" role="tabpanel">
          {tab === 'overview' && <>
            <div className="assets">
              <div className="asset"><div className="asset-top"><span className="asset-sym">BTC</span><span>Bitcoin · regtest</span></div><strong className={btc.err ? 'dim' : ''}>{btc.v || '—'}</strong>{btc.err && <small className="asset-err">{btc.err}</small>}<Copyable value={addresses?.bitcoin || ''} label="Bitcoin address" /></div>
              <div className="asset"><div className="asset-top"><span className="asset-sym">ETH</span><span>Ethereum · Anvil</span></div><strong className={eth.err ? 'dim' : ''}>{eth.v || '—'}</strong>{eth.err && <small className="asset-err">{eth.err}</small>}<Copyable value={addresses?.ethereum || ''} label="Ethereum address" /></div>
              <div className="asset"><div className="asset-top"><span className="asset-sym">SOL</span><span>Solana · local validator</span></div><strong className={sol.err ? 'dim' : ''}>{sol.v || '—'}</strong>{sol.err && <small className="asset-err">{sol.err}</small>}<Copyable value={sol.addr} label="Solana address" /></div>
            </div>
            <p className="fineprint">Addresses are derived live from the NEAR signer for path <code>hako/{box.token_id}/{box.epoch}</code>. Local test coins have no market value.</p>
            <div className="card">
              <div className="card-head"><div><h3>Sweep exposed coins in</h3><p>Scan an address you control. If its key is exposed, build an unsigned sweep into this box.</p></div></div>
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
              {mine && box.pq_key?.length && !policyActive && <div className="form">
                <h4>Activate your rules</h4>
                <p className="fineprint">A transferred box resets its policy. Set your own guardian and recovery address before sending. Signed with your ML-DSA key.</p>
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
                {!mine ? <p className="fineprint">Only the owner can request a spend.</p> : !box.pq_key?.length ? <p className="fineprint">Register an ML-DSA key first.</p> : !policyActive ? <p className="fineprint">Set your rules first (Rules tab).</p> : <div className="form">
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
            {box.ever_signed && <p className="warn-line"><Icon name="shield" /> This box has issued an MPC signature, so the contract will not let it be resold.</p>}
            {box.listed_yocto ? <div className="sale">
              <div className="sale-price"><span>Asking</span><strong>{formatEth(box.listed_yocto)}</strong><small>NEAR</small></div>
              <button className="btn btn-primary" onClick={() => run(() => invoke('buy', { token_id: box.token_id }, box.listed_yocto!))} disabled={busy || !account || pending.length > 0}>Buy this box</button>
            </div> : mine && !box.ever_signed ? <div className="form">
              <div className="form-grid"><Field label="Price (NEAR)"><input value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" /></Field></div>
              <button className="btn btn-primary" onClick={() => run(() => invoke('list', { token_id: box.token_id, price: (BigInt(Math.round(Number(price) * 1e6)) * 10n ** 18n).toString() }))} disabled={busy || pending.length > 0}><Icon name="tag" /> List for sale</button>
            </div> : !box.ever_signed && <p className="fineprint">Only the owner can list this box.</p>}
          </div>}
        </div>
      </>}
    </section>

    {(status || error) && <div className={`toast ${error ? 'toast-bad' : ''}`} role={error ? 'alert' : 'status'}>
      <span>{error || status}</span>
      {txHash && !error && <a href={nearblocksTx(txHash)} target="_blank" rel="noreferrer">View on NearBlocks <Icon name="external" size={14} /></a>}
      <button className="toast-x" onClick={() => { setError(''); setStatus(''); }} aria-label="Dismiss">×</button>
    </div>}

    <dialog ref={dialog} className="sheet" onClose={() => setMintOpen(false)}>
      {mintOpen && <form method="dialog" onSubmit={e => { e.preventDefault(); mint(); }}>
        <div className="sheet-head"><div><Eyebrow>new vault</Eyebrow><h3>Mint a box</h3></div><button type="button" className="btn btn-icon" aria-label="Close" onClick={() => dialog.current?.close()}>×</button></div>
        <p className="fineprint">The NFT gets its own BTC, ETH and SOL addresses. You register the ML-DSA key right after minting.</p>
        <div className="form-grid">
          <Field label="Box ID" hint="Letters, digits and dashes"><input value={mintId} onChange={e => setMintId(e.target.value)} placeholder="my-box" /></Field>
          <Field label="Guardian NEAR account"><input value={guardian} onChange={e => setGuardian(e.target.value)} placeholder="guardian.testnet" /></Field>
          <Field label="Recovery ETH address"><input value={recovery} onChange={e => setRecovery(e.target.value)} placeholder="0x…" /></Field>
          <Field label="Daily cap (ETH)"><input value={capEth} onChange={e => setCapEth(e.target.value)} inputMode="decimal" /></Field>
          <Field label="Allowlisted ETH addresses" hint="Optional, comma separated"><input value={allow} onChange={e => setAllow(e.target.value)} placeholder="0x…" /></Field>
        </div>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <div className="sheet-actions"><button type="button" className="btn btn-ghost" onClick={() => dialog.current?.close()}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy || !account}>{account ? 'Mint on NEAR' : 'Connect a wallet first'}</button></div>
      </form>}
    </dialog>
  </div>;
}
