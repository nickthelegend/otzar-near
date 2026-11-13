import { useId, useMemo, useRef, useState } from 'react';
import type { Candle } from './live';

export type Level = { value: number; label: string; tone: 'gold' | 'jade' | 'blush' | 'ink' };

/** BTC-USD price (Coinbase candles) as a jade area, the live trade as a pulsing dot, strikes as labelled lines. */
export function PriceChart({ candles, live, levels = [], height = 280, compact = false }: { candles: Candle[] | null; live: number | null; levels?: Level[]; height?: number; compact?: boolean }) {
  const id = useId().replace(/:/g, '');
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000, H = height, padR = compact ? 8 : 86, padT = 16, padB = compact ? 8 : 26;
  const data = useMemo(() => {
    if (!candles?.length) return null;
    const pts = candles.map(c => ({ t: c.t, v: c.close }));
    if (live) pts.push({ t: Date.now(), v: live });
    const vals = [...pts.map(p => p.v), ...levels.map(l => l.value)];
    let lo = Math.min(...vals), hi = Math.max(...vals); const pad = (hi - lo) * 0.12 || hi * 0.01; lo -= pad; hi += pad;
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
    const x = (t: number) => ((t - t0) / (t1 - t0 || 1)) * (W - padR);
    const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
    const area = `${line}L${x(t1).toFixed(1)},${H - padB}L0,${H - padB}Z`;
    const ticks = Array.from({ length: 4 }, (_, i) => lo + ((hi - lo) * (i + 0.5)) / 4);
    return { pts, x, y, line, area, ticks, t0, t1 };
  }, [candles, live, levels.map(l => l.value).join(','), H]);
  if (!data) return <div className="pc pc-empty" style={{ height }} aria-busy="true"><span>Reading BTC-USD from Coinbase…</span></div>;
  const last = data.pts[data.pts.length - 1];
  const h = hover !== null ? data.pts[hover] : null;
  function onMove(e: React.MouseEvent) {
    const r = ref.current!.getBoundingClientRect(); const fx = ((e.clientX - r.left) / r.width) * W;
    let best = 0, d = Infinity; data!.pts.forEach((p, i) => { const dd = Math.abs(data!.x(p.t) - fx); if (dd < d) { d = dd; best = i; } }); setHover(best);
  }
  const fmt = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;
  return <div className={`pc ${compact ? 'pc-compact' : ''}`} style={{ height }}>
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onMouseMove={compact ? undefined : onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={`BTC-USD ${fmt(last.v)}${levels.length ? `; ${levels.map(l => `${l.label} ${fmt(l.value)}`).join(', ')}` : ''}`}>
      <defs><linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--jade)" stopOpacity=".28" /><stop offset="1" stopColor="var(--jade)" stopOpacity="0" /></linearGradient></defs>
      {!compact && data.ticks.map(v => <line key={v} x1="0" x2={W - padR} y1={data.y(v)} y2={data.y(v)} className="pc-grid" />)}
      <path d={data.area} fill={`url(#g${id})`} />
      <path d={data.line} className="pc-line" vectorEffect="non-scaling-stroke" />
      {levels.map(l => <line key={l.label + l.value} x1="0" x2={W - padR} y1={data.y(l.value)} y2={data.y(l.value)} className={`pc-level pc-${l.tone}`} vectorEffect="non-scaling-stroke" />)}
      {h && <line x1={data.x(h.t)} x2={data.x(h.t)} y1={padT} y2={H - padB} className="pc-cross" vectorEffect="non-scaling-stroke" />}
    </svg>
    {!compact && data.ticks.map(v => <span key={v} className="pc-tick" style={{ top: `${(data.y(v) / H) * 100}%` }}>{fmt(v)}</span>)}
    {levels.map(l => <span key={l.label + l.value} className={`pc-tag pc-tag-${l.tone}`} style={{ top: `${(data.y(l.value) / H) * 100}%` }}>{l.label} {fmt(l.value)}</span>)}
    <span className="pc-dot" style={{ left: `${(data.x(last.t) / W) * 100}%`, top: `${(data.y(last.v) / H) * 100}%` }} aria-hidden="true" />
    {h && <span className="pc-tip" style={{ left: `${Math.min(80, (data.x(h.t) / W) * 100)}%` }}><b>{fmt(h.v)}</b><small>{new Date(h.t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC</small></span>}
  </div>;
}

/** A tiny line of recent values (the live ticks this tab has seen). */
export function Spark({ values, width = 84, height = 26, tone = 'jade' }: { values: number[]; width?: number; height?: number; tone?: 'jade' | 'gold' }) {
  if (values.length < 2) return <svg className="spark" width={width} height={height} aria-hidden="true" />;
  const lo = Math.min(...values), hi = Math.max(...values), r = hi - lo || 1;
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - lo) / r) * (height - 4)).toFixed(1)}`).join('');
  return <svg className={`spark spark-${tone}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true"><path d={d} /></svg>;
}
