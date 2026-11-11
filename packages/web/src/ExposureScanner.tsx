import { useState } from 'react';
import { Chip, Field, Icon } from './ui';
import { scanBitcoin, scanEthereum, unsignedBitcoinSpend, unsignedEthTransfer, type Exposure } from '@hako/sdk';

type Props = { target: { bitcoin: string; ethereum: string } | null; targetUsable: boolean; bitcoinProxy?: string; anvilRpc: string };
type LocalResult = Exposure & { utxos?: { txid: string; vout: number; sats: string }[] };

export default function ExposureScanner({ target, targetUsable, bitcoinProxy, anvilRpc }: Props) {
  const [input, setInput] = useState('');
  const [network, setNetwork] = useState<'mainnet' | 'local'>('mainnet');
  const [result, setResult] = useState<LocalResult | null>(null);
  const [unsigned, setUnsigned] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function rpc(method: string, params: unknown[]): Promise<string> {
    if (!anvilRpc) throw new Error('Setup required: VITE_ANVIL_RPC_URL');
    const response = await fetch(anvilRpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    if (!response.ok) throw new Error(`Anvil RPC ${response.status}`);
    const body = await response.json();
    if (body.error) throw new Error(JSON.stringify(body.error));
    return body.result;
  }
  async function scan() {
    setBusy(true); setError(''); setUnsigned(''); setResult(null);
    try {
      const address = input.trim();
      if (network === 'mainnet') setResult(address.startsWith('0x') ? await scanEthereum(address) : await scanBitcoin(address));
      else if (address.startsWith('0x')) { if (!anvilRpc) throw new Error('Setup required: VITE_ANVIL_RPC_URL'); setResult(await scanEthereum(address, anvilRpc)); }
      else {
        if (!bitcoinProxy) throw new Error('Setup required: VITE_BITCOIN_ESPLORA_URL');
        if (!address.startsWith('bcrt1')) throw new Error('Use a regtest bcrt1 address for the local demo');
        const response = await fetch(`${bitcoinProxy}/address/${encodeURIComponent(address)}`);
        if (!response.ok) throw new Error(`Bitcoin proxy ${response.status}`);
        const body = await response.json();
        if (body.error) throw new Error(body.error);
        setResult({ chain: 'bitcoin', address, balance: body.confirmed_sats, exposed: null, reasons: ['Regtest proxy checks live UTXOs; it does not index historical key exposure'], source: bitcoinProxy, utxos: body.utxos });
      }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function move() {
    setBusy(true); setError(''); setUnsigned('');
    try {
      if (!result || !target) throw new Error('Setup required: select a Otzar vault');
      if (!targetUsable) throw new Error('Select an unsigned Otzar vault for a fresh sweep destination');
      if (network !== 'local') throw new Error('Setup required: local regtest or Anvil source for sweep demo');
      if (result.chain === 'bitcoin') {
        if (!bitcoinProxy) throw new Error('Setup required: VITE_BITCOIN_ESPLORA_URL');
        const targetResponse=await fetch(`${bitcoinProxy}/address/${target.bitcoin}`);if(!targetResponse.ok)throw new Error(`Bitcoin proxy ${targetResponse.status}`);const targetState=await targetResponse.json();if(BigInt(targetState.confirmed_sats)!==0n)throw new Error('Selected Bitcoin vault address already holds funds');
        if (!result.utxos || result.utxos.length !== 1) throw new Error(`One UTXO required to build a sweep; found ${result.utxos?.length ?? 0}`);
        const utxo = result.utxos[0]; const sats = BigInt(utxo.sats); const fee = 500n;
        if (sats <= fee) throw new Error('Bitcoin balance below sweep fee');
        setUnsigned(unsignedBitcoinSpend({ txid: utxo.txid, vout: utxo.vout, prevoutSats: sats, destination: target.bitcoin, amountSats: sats - fee, feeSats: fee }).rawHex);
      } else {
        const chainId = await rpc('eth_chainId', []);
        if (BigInt(chainId) !== 31337n) throw new Error('Anvil chain ID 31337 required');
        if(BigInt(await rpc('eth_getBalance',[target.ethereum,'latest']))!==0n || BigInt(await rpc('eth_getTransactionCount',[target.ethereum,'latest']))!==0n)throw new Error('Selected Ethereum vault address has prior activity');
        const nonce = Number(BigInt(await rpc('eth_getTransactionCount', [result.address, 'pending'])));
        const gasPrice = BigInt(await rpc('eth_gasPrice', []));
        const fee = gasPrice * 2n * 21000n; if (result.balance === null) throw new Error('Source balance unavailable'); const balance = BigInt(result.balance);
        if (balance <= fee) throw new Error('ETH balance below gas reserve');
        setUnsigned(unsignedEthTransfer({ chainId: 31337, nonce, to: target.ethereum as `0x${string}`, value: balance - fee, maxFeePerGas: gasPrice * 2n, maxPriorityFeePerGas: gasPrice }));
      }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const unit = result?.chain === 'bitcoin' ? 'BTC' : 'ETH';
  const divisor = result?.chain === 'bitcoin' ? 1e8 : 1e18;
  const verdict = result?.exposed === true ? 'bad' : result?.exposed === false ? 'ok' : 'warn';
  return <div className={`scanner ${target ? 'scanner-inline' : ''}`}>
    <form className="scanner-form" onSubmit={e => { e.preventDefault(); if (input.trim() && !busy) scan(); }}>
      <Icon name="scan" size={20} />
      <input aria-label="Address to scan" placeholder="bc1… · 0x… · P2PK public key hex" value={input} onChange={e => setInput(e.target.value)} spellCheck={false} autoComplete="off" />
      <div className="seg" role="radiogroup" aria-label="Scan network">
        <button type="button" role="radio" aria-checked={network === 'mainnet'} className={network === 'mainnet' ? 'on' : ''} onClick={() => setNetwork('mainnet')}>Mainnet</button>
        <button type="button" role="radio" aria-checked={network === 'local'} className={network === 'local' ? 'on' : ''} onClick={() => setNetwork('local')}>Local demo</button>
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy || !input.trim()}>{busy ? 'Reading chain…' : 'Scan'}</button>
    </form>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {!result && !error && <p className="scanner-note">Mainnet reads public Bitcoin and Ethereum data; local demo reads the regtest proxy or Anvil.</p>}
    {result && <div className={`scan-result scan-${verdict}`}>
      <div className="scan-verdict">
        <span className="scan-glyph"><Icon name={verdict === 'ok' ? 'shield' : verdict === 'bad' ? 'key' : 'scan'} size={26} /></span>
        <div>
          <Chip tone={verdict as 'ok' | 'bad' | 'warn'}>{result.chain}</Chip>
          <strong>{result.exposed === true ? 'Public key exposed' : result.exposed === false ? 'No exposure found' : 'Exposure unknown'}</strong>
          <code className="scan-addr">{result.address}</code>
        </div>
        <div className="scan-bal">
          <span>At this address</span>
          <strong>{result.balance === null ? 'Unavailable' : `${(Number(BigInt(result.balance)) / divisor).toFixed(result.chain === 'bitcoin' ? 8 : 6)}`}</strong>
          <small>{result.balance === null ? 'P2PK script balance not indexed' : unit}</small>
        </div>
      </div>
      <ul className="scan-reasons">{result.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
      <p className="scan-source">Source {result.source} · {result.scannedTransactions === undefined ? 'live state' : `${result.scannedTransactions} transactions inspected`}</p>
      {target ? <div className="scan-move">
        <button className="btn btn-ghost" onClick={move} disabled={busy}><Icon name="box" /> Build a sweep into this vault</button>
        <small>Builds an unsigned transaction to this vault's address. The source owner signs and broadcasts it.</small>
      </div> : <p className="scan-source">Open the vault app and pick a vault to build a sweep into it.</p>}
      {unsigned && <Field label="Unsigned transaction to sign"><textarea readOnly value={unsigned} /></Field>}
    </div>}
  </div>;
}
