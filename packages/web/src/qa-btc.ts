// QA_SIGNER_MODULE: the test wallet's Bitcoin testnet3 side. Imported only in a VITE_QA_SIGNER=1 build. The Bitcoin
// key never enters the page: the e2e/film harness exposes a send function that signs and broadcasts in Node, and
// this sheet asks for approval first, like a wallet popup.
type Handle = { sent: (txid: string) => void; close: () => void };
declare global {
  interface Window {
    __OTZAR_QA_BTC__?: { address: string };
    __OTZAR_QA_BTC_SEND__?: (to: string, sats: number, feeSats: number) => Promise<{ txid: string; vout: number }>;
  }
}
export const FEE_SATS = 300;
const short = (t: string, a = 10, b = 8) => (t.length > a + b + 1 ? `${t.slice(0, a)}…${t.slice(-b)}` : t);
const btc = (n: number) => (n / 1e8).toFixed(8).replace(/0+$/, '').replace(/\.$/, '');

function sheet(i: { from: string; to: string; sats: number; feeSats: number; purpose: string }): Promise<Handle> {
  return new Promise((resolve, reject) => {
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text = '', kids: Node[] = []) => { const n = document.createElement(tag); n.style.cssText = css; if (text) n.textContent = text; kids.forEach(k => n.append(k)); return n; };
    const row = (k: string, v: string, mono = false) => el('div', 'display:flex;justify-content:space-between;gap:16px;padding:6px 0;border-bottom:1px solid var(--line);font-size:14px', '', [el('span', 'color:var(--muted);flex:none', k), el('b', `text-align:right;overflow-wrap:anywhere;font-weight:700${mono ? ';font-family:var(--mono);font-size:13px' : ''}`, v)]);
    const chip = (t: string, css: string) => el('span', `display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:800;${css}`, t);
    const approve = el('button', 'flex:1;height:46px;border-radius:999px;border:0;background:var(--ink);color:var(--ivory);font:800 16px var(--sans);cursor:pointer', 'Approve');
    const rejectBtn = el('button', 'height:46px;padding:0 24px;border-radius:999px;border:1px solid var(--line-3);background:var(--paper);color:var(--ink);font:800 16px var(--sans);cursor:pointer', 'Reject');
    approve.setAttribute('aria-label', 'Approve transaction'); rejectBtn.setAttribute('aria-label', 'Reject transaction');
    const note = el('div', 'font-size:13px;color:var(--muted);min-height:18px;text-align:center', 'Nothing is sent until you approve.');
    const card = el('div', 'width:min(540px,calc(100vw - 32px));background:var(--ivory);border-radius:24px;padding:18px 20px 16px;box-shadow:0 30px 80px -20px rgba(20,18,15,.55);display:grid;gap:12px;font-family:var(--sans);color:var(--ink)', '', [
      el('div', 'display:flex;justify-content:space-between;align-items:center', '', [el('h2', 'margin:0;font-size:22px;letter-spacing:-.02em', 'Approve transaction'), chip('Test wallet', 'background:var(--ivory-3);color:var(--ink-2)')]),
      el('div', 'display:flex;align-items:baseline;gap:10px', '', [el('b', 'font-size:34px;letter-spacing:-.03em', `${btc(i.sats)} tBTC`), el('span', 'color:var(--muted);font-size:14px', `${i.sats.toLocaleString('en-US')} sats`)]),
      el('div', 'border-radius:14px;background:var(--paper);padding:2px 14px;border:1px solid var(--line)', '', [row('Network', 'Bitcoin testnet3'), row('From', i.from, true), row('To (bridge deposit)', i.to, true), row('Network fee', `${i.feeSats.toLocaleString('en-US')} sats`), row('Signature', 'Bitcoin key · secp256k1')]),
      el('p', 'margin:0;font-size:15px;line-height:1.45;color:var(--ink-2)', i.purpose),
      el('div', 'display:flex;gap:10px', '', [rejectBtn, approve]), note]);
    const scrim = el('div', 'position:fixed;inset:0;z-index:2147483000;background:rgba(20,18,15,.5);display:grid;place-items:center;padding:16px', '', [card]);
    scrim.setAttribute('role', 'dialog'); scrim.setAttribute('aria-modal', 'true'); scrim.setAttribute('aria-label', 'Approve transaction');
    const close = () => { scrim.parentNode?.removeChild(scrim); };
    rejectBtn.onclick = () => { close(); reject(new Error('Rejected in the test wallet. Nothing was sent.')); };
    approve.onclick = () => {
      approve.disabled = true; rejectBtn.disabled = true; approve.style.opacity = '.55'; approve.textContent = 'Signing…'; note.textContent = 'Signing with the Bitcoin key and broadcasting to testnet.';
      resolve({ close, sent: txid => { approve.textContent = 'Sent'; approve.style.opacity = '1'; approve.style.background = 'var(--jade-d)'; note.textContent = `Bitcoin transaction ${short(txid)} broadcast.`; setTimeout(close, 2200); } });
    };
    (document.body || document.documentElement).append(scrim); approve.focus();
  });
}

export type QaBitcoin = { address: string; send: (to: string, sats: number, purpose: string) => Promise<{ txid: string; vout: number }> };
export function qaBitcoin(): QaBitcoin | null {
  if (import.meta.env.MODE !== 'qa' || import.meta.env.VITE_QA_SIGNER !== '1') return null;
  const w = window.__OTZAR_QA_BTC__, send = window.__OTZAR_QA_BTC_SEND__;
  if (!w || !send || !/^tb1q[a-z0-9]{38}$/.test(w.address)) return null;
  return {
    address: w.address,
    async send(to, sats, purpose) {
      if (!/^tb1[a-z0-9]{39,59}$/.test(to) || !(sats > 0)) throw new Error('A Bitcoin testnet address and amount are required');
      const h = await sheet({ from: w.address, to, sats, feeSats: FEE_SATS, purpose });
      try { const r = await send(to, sats, FEE_SATS); h.sent(r.txid); return r; }
      catch (e) { h.close(); throw e; }
    },
  };
}
