import { useEffect, useRef } from 'react';
import { CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineStyle, createChart, createSeriesMarkers, type IChartApi, type IPriceLine, type ISeriesApi, type ISeriesMarkersPluginApi, type SeriesMarker, type Time, type UTCTimestamp } from 'lightweight-charts';
import type { Candle } from './live';

// Seter's candlestick chart (lightweight-charts), in Otzar's jade and gold. Coinbase BTC-USD candles; the live
// covered call's strike is a gold line and the vault's on-chain events are markers.
export type Mark = { time: number; label: string; tone: 'jade' | 'gold' };
export type Line = { price: number; title: string; tone: 'gold' | 'jade' | 'ink' };
const UP = '#0b8a5a', DOWN = '#c9483a';
const LINE = { gold: '#b97c0c', jade: '#0b5d43', ink: '#14120f' };

export default function Candles({ data, lines = [], marks = [], height }: { data: Candle[]; lines?: Line[]; marks?: Mark[]; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const vol = useRef<ISeriesApi<'Histogram'> | null>(null);
  const priceLines = useRef<IPriceLine[]>([]);
  const markers = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const c = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#6e685c', fontFamily: 'Space Mono, ui-monospace, monospace', fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: 'rgba(20,18,15,0.04)' }, horzLines: { color: 'rgba(20,18,15,0.06)' } },
      rightPriceScale: { borderColor: 'rgba(20,18,15,0.1)', scaleMargins: { top: 0.1, bottom: 0.2 } },
      timeScale: { borderColor: 'rgba(20,18,15,0.1)', timeVisible: true, secondsVisible: false, rightOffset: 4 },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: 'rgba(20,18,15,0.3)', labelBackgroundColor: '#0f1a15' }, horzLine: { color: 'rgba(20,18,15,0.3)', labelBackgroundColor: '#0f1a15' } },
    });
    const s = c.addSeries(CandlestickSeries, { upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN, wickUpColor: UP, wickDownColor: DOWN, priceFormat: { type: 'price', precision: 0, minMove: 1 } });
    const v = c.addSeries(HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    c.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 }, visible: false });
    chart.current = c; series.current = s; vol.current = v; markers.current = createSeriesMarkers(s, []);
    return () => { c.remove(); chart.current = null; series.current = null; vol.current = null; priceLines.current = []; markers.current = null; };
  }, []);

  useEffect(() => {
    if (!series.current || !vol.current) return;
    series.current.setData(data.map(d => ({ time: (d.t / 1000) as UTCTimestamp, open: d.open, high: d.high, low: d.low, close: d.close })));
    vol.current.setData(data.map(d => ({ time: (d.t / 1000) as UTCTimestamp, value: d.high - d.low, color: d.close >= d.open ? 'rgba(11,138,90,0.16)' : 'rgba(201,72,58,0.16)' })));
    const first = data[0]?.t ?? 0, last = data[data.length - 1]?.t ?? 0, step = data.length > 1 ? data[1].t - data[0].t : 3600_000;
    const visible = marks.filter(m => m.time * 1000 >= first && m.time * 1000 <= last + step).map(m => ({ ...m, slot: (m.time * 1000 - ((m.time * 1000 - first) % step)) / 1000 }));
    const grouped = new Map<number, Mark[]>(); visible.forEach(m => grouped.set(m.slot, [...(grouped.get(m.slot) || []), m]));
    markers.current?.setMarkers([...grouped.entries()].sort((a, b) => a[0] - b[0]).map(([slot, ms]): SeriesMarker<Time> => ({ time: slot as UTCTimestamp, position: ms[0].tone === 'gold' ? 'aboveBar' : 'belowBar', color: ms[0].tone === 'gold' ? LINE.gold : LINE.jade, shape: ms[0].tone === 'gold' ? 'arrowDown' : 'circle', text: ms.map(m => m.label).join(' · ') })));
  }, [data, marks]);

  useEffect(() => {
    const s = series.current; if (!s) return;
    priceLines.current.forEach(l => s.removePriceLine(l));
    priceLines.current = lines.map(l => s.createPriceLine({ price: l.price, color: LINE[l.tone], lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: l.title }));
  }, [lines]);

  return <div className="c5-chart" ref={box} style={height ? { height } : undefined} role="img" aria-label="BTC-USD candlestick chart from Coinbase Exchange" />;
}
