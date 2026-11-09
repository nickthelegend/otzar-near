import { useEffect, useRef, useState, type ReactNode } from 'react';

// Generated art lives in public/art (carved jade and brushed gold on ivory). The folder is listed at build
// time, so a sticker that has not landed yet is drawn in CSS instead of requesting a missing file.
const files: string[] = typeof __ART__ !== 'undefined' ? __ART__ : [];
const has = (f: string) => files.includes(f);
export const artSrc = (name: string): string | null => {
  const hit = ['webp', 'png', 'jpg'].map(x => `${name}.${x}`).find(has);
  return hit ? `/art/${hit}` : null;
};

export type StickerName = 'vault' | 'coins' | 'key' | 'hourglass' | 'shield' | 'chart' | 'guardians' | 'btc';
const glyph: Record<StickerName, ReactNode> = {
  vault: <><rect x="12" y="14" width="40" height="36" rx="6" /><circle cx="32" cy="32" r="9" fill="none" strokeWidth="3" /><path d="M32 23v-3M32 44v-3M23 32h-3M44 32h-3" strokeWidth="3" /><rect x="16" y="50" width="8" height="4" rx="1" /><rect x="40" y="50" width="8" height="4" rx="1" /></>,
  coins: <><ellipse cx="32" cy="44" rx="16" ry="6" /><ellipse cx="32" cy="36" rx="16" ry="6" /><ellipse cx="32" cy="28" rx="16" ry="6" /><ellipse cx="32" cy="20" rx="16" ry="6" /></>,
  key: <><circle cx="22" cy="24" r="10" fill="none" strokeWidth="5" /><path d="M29 31l19 19M41 43l5-5M46 48l4-4" strokeWidth="5" /></>,
  hourglass: <><path d="M18 10h28M18 54h28" strokeWidth="4" /><path d="M21 12c0 12 22 14 22 20s-22 8-22 20h22c0-12-22-14-22-20s22-8 22-20z" /></>,
  shield: <><path d="M32 8l20 8v14c0 13-9 22-20 26-11-4-20-13-20-26V16z" /><path d="M24 32l6 6 11-12" fill="none" stroke="#fffaf0" strokeWidth="4" /></>,
  chart: <><rect x="12" y="38" width="8" height="14" rx="2" /><rect x="24" y="30" width="8" height="22" rx="2" /><rect x="36" y="22" width="8" height="30" rx="2" /><path d="M12 24l14-10 10 6 16-10" fill="none" strokeWidth="4" /></>,
  guardians: <><circle cx="20" cy="22" r="6" /><circle cx="32" cy="18" r="7" /><circle cx="44" cy="22" r="6" /><path d="M10 46c0-8 5-13 10-13s10 5 10 13zM22 46c0-10 5-16 10-16s10 6 10 16zM34 46c0-8 5-13 10-13s10 5 10 13z" /></>,
  btc: <><circle cx="32" cy="32" r="22" /><circle cx="32" cy="32" r="16" fill="none" stroke="#fffaf0" strokeWidth="2" /><path d="M26 22h9a5 5 0 010 10h-9zM26 32h10a5 5 0 010 10H26z" fill="none" stroke="#fffaf0" strokeWidth="3" /></>,
};
const tone: Record<StickerName, 'jade' | 'gold'> = { vault: 'jade', coins: 'gold', key: 'jade', hourglass: 'gold', shield: 'jade', chart: 'gold', guardians: 'jade', btc: 'gold' };

/** A tilted sticker: the generated art when it exists, otherwise a drawn jade or gold die-cut. */
export function Sticker({ name, className = '', rot = 0 }: { name: StickerName; className?: string; rot?: number }) {
  const src = artSrc(`otzar-st-${name}`);
  const [ok, setOk] = useState(true);
  return <div className={`sticker ${src && ok ? 'sticker-img' : `sticker-drawn sd-${tone[name]}`} ${className}`} style={{ ['--rot' as string]: `${rot}deg` }} aria-hidden="true">
    {src && ok ? <img src={src} alt="" loading="eager" onError={() => setOk(false)} />
      : <svg viewBox="0 0 64 64" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" fill="currentColor">{glyph[name]}</svg>}
  </div>;
}

/** The Otzar mark: the chosen generated logo, else an aleph on a jade tile. */
export const LOGO = artSrc('otzar-logo-a');
export function Mark({ size = 34 }: { size?: number }) {
  if (LOGO) return <img className="mark-img" src={LOGO} alt="" width={size} height={size} />;
  return <span className="mark" style={{ width: size, height: size, fontSize: size * 0.56 }} aria-hidden="true">א</span>;
}
export function Wordmark() { return <span className="wordmark"><Mark /><span className="wm">Otzar</span></span>; }

/** Large hero or feature art with a drawn fallback. */
export function Art({ name, className = '', alt = '' }: { name: string; className?: string; alt?: string }) {
  const src = artSrc(name);
  if (!src) return <div className={`art-fallback ${className}`} aria-hidden="true"><Sticker name="vault" rot={-6} /><Sticker name="coins" rot={8} /></div>;
  return <img className={`art-img ${className}`} src={src} alt={alt} loading="eager" />;
}

/** Counts up to a live number once it is known; static when the user prefers reduced motion. */
export function CountUp({ value, decimals = 2, suffix = '', duration = 1200 }: { value: number | null; decimals?: number; suffix?: string; duration?: number }) {
  const [shown, setShown] = useState<number | null>(null);
  const from = useRef(0);
  useEffect(() => {
    if (value === null) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(value); return; }
    const start = performance.now(), a = from.current;
    let raf = 0;
    const step = (t: number) => { const k = Math.min(1, (t - start) / duration); const e = 1 - Math.pow(1 - k, 3); setShown(a + (value - a) * e); if (k < 1) raf = requestAnimationFrame(step); else from.current = value; };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  if (value === null) return <span className="count count-wait">…</span>;
  return <span className="count">{(shown ?? 0).toFixed(decimals)}{suffix}</span>;
}

export type TickerItem = { k: string; v: ReactNode; tone?: 'jade' | 'gold' | 'ink' };
/** A slow tape of live facts, duplicated once for a seamless loop; static and scrollable when motion is reduced. */
export function Ticker({ items, empty }: { items: TickerItem[]; empty: ReactNode }) {
  if (!items.length) return <div className="ticker ticker-empty"><span className="tick-item">{empty}</span></div>;
  const row = (dup: boolean) => items.map((t, i) => <span key={`${dup}-${i}`} className={`tick-item tick-${t.tone || 'ink'}`} aria-hidden={dup || undefined}><em>{t.k}</em>{t.v}</span>);
  return <div className="ticker" role="marquee" aria-label="Live from NEAR testnet"><div className="ticker-track" style={{ animationDuration: `${Math.max(36, items.length * 7)}s` }}>{row(false)}{row(true)}</div></div>;
}
