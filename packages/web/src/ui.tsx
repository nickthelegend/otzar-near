import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
export { Mark, Wordmark } from './art';
import { Obj, type ObjName } from './art';
import { countdown, navigate } from './lib';

export type IconName = 'key' | 'lock' | 'clock' | 'coin' | 'shield' | 'arrow' | 'copy' | 'check' | 'external' | 'send' | 'heir' | 'tag' | 'scan' | 'plus' | 'box' | 'spark' | 'x' | 'back' | 'user' | 'grid' | 'wave' | 'refresh' | 'wallet';
const paths: Record<IconName, string> = {
  key: 'M14 10a4 4 0 1 0-3.9 4H11l2 2h2v2h2v2h3v-3l-5.3-5.3A4 4 0 0 0 14 10Zm-6-.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-8a.5.5 0 0 1 .5-.5ZM12 15v2',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4.5l3 2',
  coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v10m-3-7.5h4.5a1.75 1.75 0 0 1 0 3.5H9h5a1.75 1.75 0 0 1 0 3.5H9',
  shield: 'M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Zm-3 9 2.2 2.2L15.5 10',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  external: 'M14 5h5v5m0-5-8 8M17 14v5H5V7h5',
  send: 'M4 12 20 4l-6 16-3-7-7-1Z',
  heir: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9a6 6 0 0 1 12 0m2-11h4m-2-2v4',
  tag: 'M3 12V4h8l9 9-8 8-9-9Zm4.5-4.5h.01',
  scan: 'M4 8V4h4m8 0h4v4m0 8v4h-4m-8 0H4v-4M4 12h16',
  plus: 'M12 5v14M5 12h14',
  box: 'M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Zm0 0v9m0 0 8-4.5M12 12l-8-4.5M12 12v9',
  spark: 'M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5m7 7L18 18M6 18l2.5-2.5m7-7L18 6',
  x: 'M6 6l12 12M18 6 6 18',
  back: 'M19 12H5m5-5-5 5 5 5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  wave: 'M3 15c3 0 3-6 6-6s3 6 6 6 3-6 6-6',
  refresh: 'M20 11a8 8 0 0 0-14.6-4.5M4 4v4h4m12 8a8 8 0 0 1-14.6 4.5M20 20v-4h-4',
  wallet: 'M4 7a2 2 0 0 1 2-2h12v4M4 7v10a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2Zm12 7h.01',
};
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export type Tone = 'ok' | 'warn' | 'bad' | 'idle' | 'ice';
export function Chip({ tone = 'idle', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`chip chip-${tone}`}><i />{children}</span>;
}

export function Copyable({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  if (!value) return <span className="copyable muted">Deriving…</span>;
  return <button type="button" className="copyable" title={value} aria-label={`Copy ${label || 'value'}`} onClick={() => navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); })}>
    <code>{value}</code><Icon name={done ? 'check' : 'copy'} size={15} />
  </button>;
}

export function Eyebrow({ children }: { children: ReactNode }) { return <div className="eyebrow"><span>{'{'}</span>{children}<span>{'}'}</span></div>; }

export function Empty({ icon = 'box', title, children }: { icon?: IconName; title: string; children?: ReactNode }) {
  return <div className="empty"><span className="empty-icon"><Icon name={icon} size={22} /></span><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>;
}

export type TimelineItem = {
  key: string;
  chain: 'ETH' | 'BTC' | 'SOL';
  title: string;
  detail?: string;
  state: string;
  recovery?: boolean;
  createdMs?: number;
  readyMs?: number;
  actions?: ReactNode;
};

const stateTone: Record<string, Tone> = { pending: 'warn', signing: 'ice', signed: 'ok', broadcast: 'ok', executed: 'ok', clawed: 'bad', cancelled: 'bad', rejected: 'bad' };

export function Timeline({ items, clock }: { items: TimelineItem[]; clock: number }) {
  return <ol className="timeline">{items.map(item => {
    const waiting = item.state === 'pending' && item.readyMs !== undefined && item.readyMs > clock;
    const total = item.createdMs !== undefined && item.readyMs !== undefined ? item.readyMs - item.createdMs : 0;
    const progress = waiting && total > 0 ? Math.min(1, Math.max(0, (clock - item.createdMs!) / total)) : 1;
    const tone: Tone = waiting ? 'warn' : item.state === 'pending' ? 'ice' : stateTone[item.state] || 'idle';
    return <li key={item.key} className={`tl-item tl-${tone}`}>
      <span className="tl-dot" aria-hidden="true" />
      <div className="tl-body">
        <div className="tl-top">
          <span className="tl-chain">{item.chain}{item.recovery ? ' · guardian recovery' : ''}</span>
          <Chip tone={tone}>{waiting ? 'In delay' : item.state === 'pending' ? 'Ready to sign' : item.state}</Chip>
        </div>
        <strong className="tl-title">{item.title}</strong>
        {item.detail && <code className="tl-detail">{item.detail}</code>}
        {waiting && <div className="tl-wait">
          <div className="tl-bar"><span style={{ transform: `scaleX(${progress})` }} /></div>
          <span className="tl-count">{countdown(item.readyMs! - clock)} <small>until it can be signed</small></span>
        </div>}
        {item.actions && <div className="tl-actions">{item.actions}</div>}
      </div>
    </li>;
  })}</ol>;
}

/** Art-directed image panel. If the file is not there yet it falls back to an intentional gradient plate with a line icon. */
export function Art({ src, label, icon, className = '' }: { src: string; label: string; icon: IconName; className?: string }) {
  const [missing, setMissing] = useState(false);
  return <div className={`art ${missing ? 'art-missing' : ''} ${className}`} role="img" aria-label={label}>
    {!missing && <img src={src} alt="" decoding="async" onError={() => setMissing(true)} />}
    {missing && <span className="art-plate" aria-hidden="true"><Icon name={icon} size={64} /></span>}
  </div>;
}

export function Link({ to, className, children, ...rest }: { to: string; className?: string; children: ReactNode; 'aria-current'?: 'page' | undefined; 'aria-label'?: string; title?: string }) {
  const onClick = (e: MouseEvent) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); navigate(to); };
  return <a href={to} className={className} onClick={onClick} {...rest}>{children}</a>;
}

/** Fixed-point 6-decimal amount split into whole and dimmed fraction, e.g. 0.019547 → "0" ".019547". */
export function Amount({ e6, unit, digits = 4, className = '' }: { e6: bigint | string | null | undefined; unit?: string; digits?: number; className?: string }) {
  if (e6 === null || e6 === undefined) return <span className={`amt amt-empty ${className}`}>—</span>;
  // Round half up to `digits` decimals, so 0.010369 shows as 0.0104, matching the sentences and the wallet.
  const step = 10n ** BigInt(6 - digits); const n = (BigInt(e6) + step / 2n) / step * step;
  const whole = (n / 1_000_000n).toLocaleString('en-US'); const frac = (n % 1_000_000n).toString().padStart(6, '0').slice(0, digits);
  return <span className={`amt ${className}`}>{whole}<span className="amt-frac">.{frac}</span>{unit && <small className="amt-unit">{unit}</small>}</span>;
}

/** Bottom sheet on phones, right-hand drawer on desktop. Escape or the scrim closes it. */
export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', key); document.body.classList.add('sheet-open');
    return () => { removeEventListener('keydown', key); document.body.classList.remove('sheet-open'); prev?.focus?.(); };
  }, []);
  return <div className="sheet-wrap" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <aside ref={ref} className="sheet" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
      <button className="sheet-x" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
      {children}
    </aside>
  </div>;
}

/** A word with its one-line plain meaning: a dotted underline and an i; the meaning shows on hover, focus or tap. */
export function Term({ children, tip }: { children: ReactNode; tip: string }) {
  return <span className="term" tabIndex={0} role="note" aria-label={`${typeof children === 'string' ? children : ''}: ${tip}`} data-tip={tip}>{children}</span>;
}

/** Plain-language meanings for the few terms the app cannot avoid. */
export const TERMS = {
  apy: 'Realised APY uses paid rounds lasting at least one day. Shorter terms are demo rounds, excluded from blended APY; their actual premiums are still shown.',
  premium: 'Premium: what a buyer pays you up front for the right to buy your BTC at a set price. You keep it either way.',
  strike: 'Strike: the set price a buyer may pay for your BTC when the round ends.',
  call: 'Covered call: you offer to sell BTC you already hold at a set price, and get paid now for the offer.',
  round: 'Round: one offer, from writing it to settling it. Each one runs until its end date.',
  relayer: 'Relayer price: a Coinbase BTC-USD trade signed by the Otzar relayer key and checked on-chain (testnet).',
  tusdc: 'tUSDC: Otzar’s own test token on NEAR testnet, deployed as “tUSDC (Hako test)”. It has no value.',
  mldsa: 'ML-DSA-65: a post-quantum signature. Only this key can ask to move the vault’s coins.',
} as const;

// Empty, setup and error states carry one 3D object; loading keeps the small pulse.
const STATE_OBJ: Partial<Record<'loading' | 'empty' | 'error' | 'setup', ObjName>> = { empty: 'empty-vault', setup: 'key', error: 'warning' };
export function State({ kind, title, children, action }: { kind: 'loading' | 'empty' | 'error' | 'setup'; title: string; children?: ReactNode; action?: ReactNode }) {
  const obj = STATE_OBJ[kind];
  return <div className={`state state-${kind} ${obj ? 'state-art' : ''}`} role={kind === 'error' ? 'alert' : 'status'}>
    {obj ? <Obj name={obj} size={88} className="state-img" alt="" /> : <span className="state-mark" aria-hidden="true"><i className="pulse" /></span>}
    <div><strong>{title}</strong>{children && <p>{children}</p>}{action}</div>
  </div>;
}
