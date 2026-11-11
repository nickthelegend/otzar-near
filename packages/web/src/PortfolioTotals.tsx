import { useEffect, useState } from 'react';
import { solanaUrl } from './lib';
import { deriveAddresses, ethBalance, solanaAddress, solanaBalance } from '@hako/sdk';

type Box = { token_id: string; owner_id: string; epoch: number };
type Props = { boxes: Box[]; account: string; contractId?: string; bitcoinProxy?: string; anvilRpc: string };
export default function PortfolioTotals({ boxes, account, contractId, bitcoinProxy, anvilRpc }: Props) {
  const [totals, setTotals] = useState<{ btc: string; eth: string; sol: string }>({ btc: '—', eth: '—', sol: '—' });
  const [error, setError] = useState('');
  useEffect(() => {
    if (!account || !contractId) return;
    let cancelled = false;
    (async () => {
      const owned = boxes.filter(box => box.owner_id === account);
      let btc = 0n, eth = 0n, sol = 0n;
      const missing: string[] = [];
      for (const box of owned) {
        const [addresses, solAddress] = await Promise.all([deriveAddresses(contractId,box.token_id,box.epoch),solanaAddress(contractId,box.token_id,box.epoch)]);
        try { if (!anvilRpc) throw new Error('not configured'); eth += await ethBalance(addresses.ethereum,anvilRpc); } catch { if (!missing.includes('VITE_ANVIL_RPC_URL')) missing.push('VITE_ANVIL_RPC_URL'); }
        try { if (!solanaUrl) throw new Error('not configured'); sol += await solanaBalance(solAddress,solanaUrl); } catch { if (!missing.includes('VITE_SOLANA_RPC_URL')) missing.push('VITE_SOLANA_RPC_URL'); }
        if (bitcoinProxy) {
          try { const response=await fetch(`${bitcoinProxy}/address/${addresses.bitcoin}`); if(!response.ok)throw new Error(String(response.status)); const body=await response.json(); if(body.error)throw new Error(body.error); btc+=BigInt(body.confirmed_sats); } catch { if (!missing.includes('VITE_BITCOIN_ESPLORA_URL')) missing.push('VITE_BITCOIN_ESPLORA_URL'); }
        } else if (!missing.includes('VITE_BITCOIN_ESPLORA_URL')) missing.push('VITE_BITCOIN_ESPLORA_URL');
      }
      if (!cancelled) { setTotals({ btc: missing.includes('VITE_BITCOIN_ESPLORA_URL') ? '—' : `${(Number(btc)/1e8).toFixed(8)} BTC`, eth: missing.includes('VITE_ANVIL_RPC_URL') ? '—' : `${(Number(eth)/1e18).toFixed(6)} ETH`, sol: missing.includes('VITE_SOLANA_RPC_URL') ? '—' : `${(Number(sol)/1e9).toFixed(6)} SOL` }); setError(missing.length ? `Setup required: ${missing.join(', ')}` : ''); }
    })().catch(e=>{if(!cancelled)setError((e as Error).message);});
    return () => { cancelled = true; };
  },[boxes,account,contractId,bitcoinProxy,anvilRpc]);
  return <div className="portfolio">
    <span className="portfolio-k">Across your boxes</span>
    {!account ? <p className="portfolio-note">Connect a wallet to total your boxes.</p> : <div className="portfolio-rows">
      <div><span>BTC</span><strong>{totals.btc.replace(' BTC', '')}</strong></div>
      <div><span>ETH</span><strong>{totals.eth.replace(' ETH', '')}</strong></div>
      <div><span>SOL</span><strong>{totals.sol.replace(' SOL', '')}</strong></div>
    </div>}
    {error && <small className="portfolio-error">{error}</small>}
  </div>;
}
