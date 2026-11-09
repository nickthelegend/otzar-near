import { useState } from 'react';
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
      else if (address.startsWith('0x')) setResult(await scanEthereum(address, anvilRpc));
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
      if (!result || !target) throw new Error('Setup required: select a Hako vault');
      if (!targetUsable) throw new Error('Select an unsigned Hako vault for a fresh sweep destination');
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
  return <section className="scanner" id="scan"><div className="section-head"><div><p className="eyebrow">NO WALLET REQUIRED</p><h2>Quantum exposure scanner</h2></div></div><p>Paste a Bitcoin or Ethereum address, or a P2PK public key. Hako reads the chain to check key exposure and the native balance at risk.</p><div className="scanner-form"><input aria-label="Address to scan" placeholder="bc1… / 0x… / P2PK hex" value={input} onChange={e=>setInput(e.target.value)}/><select aria-label="Scan network" value={network} onChange={e=>setNetwork(e.target.value as 'mainnet'|'local')}><option value="mainnet">Public mainnet</option><option value="local">Local demo</option></select><button onClick={scan} disabled={busy||!input.trim()}>Scan address</button></div>{error&&<div className="notice error" role="alert">{error}</div>}{result&&<div className="scan-result"><strong>{result.exposed === true ? 'Public key exposed' : result.exposed === false ? 'No exposure found' : 'Exposure unknown'}</strong><span>{result.balance === null ? 'Balance unavailable for this P2PK script' : `${(Number(BigInt(result.balance))/divisor).toFixed(result.chain==='bitcoin'?8:6)} ${unit} at this address`}</span><ul>{result.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul><small>Source: {result.source} · {result.scannedTransactions === undefined ? 'live state' : `${result.scannedTransactions} transactions inspected`}</small><div><button onClick={move} disabled={busy}>Move it into Hako</button><small>Builds an unsigned sweep to the selected Hako address. The source owner must sign and broadcast it.</small></div>{unsigned&&<label>Unsigned transaction to sign<textarea readOnly value={unsigned}/></label>}</div>}</section>;
}
