import { useState } from 'react';
import { Card, Feed, Stat } from './blocks';
import { useRelayer, useTxns } from './data';
import { useNearBlock } from './live';
import { ago, contractId, e6, nearblocksAccount, type ChainTx } from './lib';
import { PageHead } from './shell';
import { Icon } from './ui';

const GROUPS: Record<string, { label: string; test: (t: ChainTx) => boolean }> = {
  all: { label: 'All', test: () => true },
  calls: { label: 'Calls and premiums', test: t => /call|ft_on_transfer|premium|settle|exercise|relayer/.test(t.method) },
  security: { label: 'Keys and security', test: t => /pq|guardian|recovery|register|policy|inheritance|transfer|list/.test(t.method) },
  rejected: { label: 'Refused by the contract', test: t => !t.ok },
};

export default function Activity() {
  const txns = useTxns(50); const block = useNearBlock(); const relayer = useRelayer();
  const [g, setG] = useState<keyof typeof GROUPS>('all');
  const list = txns.data || [];
  const rejected = list.filter(t => !t.ok).length;
  const signers = new Set(list.map(t => t.signer)).size;
  return <div className="o-page">
    <PageHead title="Activity" sub="Every transaction to the Otzar contract, newest first, read from NEAR testnet through NearBlocks. Refused calls are the contract’s checks doing their job."
      actions={contractId && <a className="o-btn o-btn-line" href={nearblocksAccount(contractId)} target="_blank" rel="noreferrer">Open in NearBlocks <Icon name="external" size={13} /></a>} />
    <section className="o-kpis">
      <Stat live k="NEAR block" v={block.height ? block.height.toLocaleString('en-US') : '…'} sub={block.error || (block.time ? `Final ${ago(block.time * 1e6)}` : 'Connecting…')} />
      <Stat k="Last 50 transactions" v={txns.data ? list.length : '…'} sub={txns.data ? `${signers} accounts signed them` : txns.error || 'Reading…'} />
      <Stat k="Refused on chain" v={txns.data ? rejected : '…'} sub="Missing or forged keys, caps, replays" />
      <Stat k="Settlement price" v={relayer.data ? `$${e6(relayer.data.price_usd_e6, 2)}` : '…'} sub={relayer.data ? `Relayer print · ${ago(relayer.data.publish_time_sec * 1e9)}` : relayer.error || 'Reading…'} />
    </section>
    <Card className="o-card-flush" title={<div className="o-seg" role="tablist" aria-label="Filter activity">{Object.entries(GROUPS).map(([k, v]) => <button key={k} role="tab" aria-selected={g === k} className={g === k ? 'on' : ''} onClick={() => setG(k as keyof typeof GROUPS)}>{v.label}<small>{txns.data ? list.filter(v.test).length : ''}</small></button>)}</div>} action={<span className="o-mute small"><i className="o-live" aria-hidden="true" />Refreshes every 25 s</span>}>
      <div className="o-pad"><Feed txns={txns.data} error={txns.error} loading={txns.loading} limit={50} filter={GROUPS[g].test} /></div>
    </Card>
  </div>;
}
