// QA_SIGNER_MODULE: the QA/demo signer's equivalent of a wallet popup. Imported only by qa-signer.ts, so the production
// bundle never contains it. Shows a plain "Approve transaction" sheet before anything is broadcast.
type Call = { methodName: string; args: object; gas: string | bigint; deposit: string | bigint };
export type SheetInput = { accountId: string; receiverId: string; calls: Call[]; nearKey: string; gas: string; deposit: string };
export type SheetHandle = { sent: (hash: string) => void; close: () => void };

const e6 = (v: unknown, d = 2) => (Number(v) / 1e6).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const short = (t: string, a = 8, b = 6) => (t.length > a + b + 1 ? `${t.slice(0, a)}…${t.slice(-b)}` : t);
const hex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');

// Wallet Selector 10 hands native actions over with the call arguments as JSON bytes; older shapes pass an object.
function argsOf(c: Call): Record<string, string | number> {
  const a = c.args as unknown;
  if (a instanceof Uint8Array) { try { return JSON.parse(new TextDecoder().decode(a)); } catch { return {}; } }
  return (a || {}) as Record<string, string | number>;
}

function plainWords(c: Call): string {
  const a = argsOf(c);
  if (c.methodName === 'write_call') {
    const hours = Math.max(0, Math.round((Number(a.expiry_sec) * 1000 - Date.now()) / 360000) / 10);
    return `Write a covered call on vault ${a.token_id}: strike $${e6(a.strike_usd_e6)} on ${Number(a.size_sats).toLocaleString('en-US')} sats, expires in about ${hours} hours.`;
  }
  if (c.methodName === 'ft_transfer_call') return `Pay ${e6(a.amount, 4)} tUSDC (a test token) to the Otzar contract as the premium for the call on ${String(a.msg).replace(/^buy:/, '')}. The contract forwards it to the writer.`;
  return `Call ${c.methodName}.`;
}

export function approvalSheet(i: SheetInput): Promise<SheetHandle> {
  return new Promise((resolve, rejectSheet) => {
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text = '', kids: Node[] = []) => { const n = document.createElement(tag); n.style.cssText = css; if (text) n.textContent = text; kids.forEach(k => n.append(k)); return n; };
    const call = i.calls[0];
    const sigB64 = String(argsOf(call).signature || '');
    const sig = sigB64 ? Uint8Array.from(atob(sigB64), c => c.charCodeAt(0)) : undefined;
    const row = (k: string, v: string, mono = false) => el('div', 'display:flex;justify-content:space-between;gap:16px;padding:5px 0;border-bottom:1px solid var(--line);font-size:14px', '', [el('span', 'color:var(--muted);flex:none', k), el('b', `text-align:right;overflow-wrap:anywhere;font-weight:700${mono ? ';font-family:var(--mono);font-size:13px' : ''}`, v)]);
    const chip = (t: string, css: string) => el('span', `display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:800;letter-spacing:.02em;${css}`, t);
    const sigBox = (title: string, tag: string, tagCss: string, line1: string, line2: string) => {
      const status = el('span', 'font-size:12.5px;font-weight:800;color:var(--muted)', 'Waiting');
      const box = el('div', 'border:1px solid var(--line-2);border-radius:14px;padding:10px 14px;background:var(--paper);display:grid;gap:4px', '', [
        el('div', 'display:flex;justify-content:space-between;align-items:center;gap:10px', '', [el('span', 'display:flex;gap:8px;align-items:center;font-weight:800;font-size:15px', '', [document.createTextNode(title), chip(tag, tagCss)]), status]),
        el('div', 'font-family:var(--mono);font-size:12.5px;color:var(--ink-2);overflow-wrap:anywhere', line1), el('div', 'font-size:13px;color:var(--muted)', line2)]);
      return { box, status };
    };
    const mark = (s: { status: HTMLElement }, text: string) => { s.status.textContent = text; s.status.style.color = 'var(--jade-d)'; };
    const pq = sigBox('Post-quantum signature', 'ML-DSA-65', 'background:var(--jade-l);color:var(--jade-d)',
      sig ? `${hex(sig.slice(0, 8))}…${hex(sig.slice(-4))} · ${sig.length.toLocaleString('en-US')} bytes` : 'Not part of this payment',
      sig ? 'Signed in this tab with the vault key. NEAR verifies it inside the contract.' : 'The writer’s ML-DSA-65 signature on these terms was already verified on chain. A payment needs only the buyer’s NEAR key.');
    const cl = sigBox('NEAR account signature', 'ed25519', 'background:var(--gold-l);color:var(--gold-ink)', short(i.nearKey, 16, 6), 'Classical key. It signs the transaction when you press Approve.');
    mark(pq, sig ? 'Signed' : 'Already verified');
    const approve = el('button', 'flex:1;height:46px;border-radius:999px;border:0;background:var(--ink);color:var(--ivory);font:800 16px var(--sans);cursor:pointer', 'Approve');
    const rejectBtn = el('button', 'height:46px;padding:0 24px;border-radius:999px;border:1px solid var(--line-3);background:var(--paper);color:var(--ink);font:800 16px var(--sans);cursor:pointer', 'Reject');
    approve.setAttribute('aria-label', 'Approve transaction'); rejectBtn.setAttribute('aria-label', 'Reject transaction');
    const note = el('div', 'font-size:13px;color:var(--muted);min-height:18px;text-align:center', 'Nothing is sent until you approve.');
    const card = el('div', 'width:min(540px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;background:var(--ivory);border-radius:24px;padding:18px 20px 16px;box-shadow:0 30px 80px -20px rgba(20,18,15,.55);display:grid;gap:11px;font-family:var(--sans);color:var(--ink)', '', [
      el('div', 'display:flex;justify-content:space-between;align-items:center', '', [el('h2', 'margin:0;font-size:22px;letter-spacing:-.02em', 'Approve transaction'), chip('Test wallet', 'background:var(--ivory-3);color:var(--ink-2)')]),
      el('div', 'border-radius:14px;background:var(--paper);padding:2px 14px;border:1px solid var(--line)', '', [row('Network', 'NEAR testnet'), row('Signer', i.accountId, true), row('Receiver', i.receiverId, true), row('Method', call.methodName, true), row('Deposit · gas', `${BigInt(i.deposit) === 0n ? 'None' : `${i.deposit} yoctoNEAR`} · ${Math.round(Number(i.gas) / 1e12)} Tgas`)]),
      el('p', 'margin:0;font-size:15px;line-height:1.45;color:var(--ink-2)', plainWords(call)),
      el('div', 'display:grid;gap:8px', '', [pq.box, cl.box]),
      el('div', 'display:flex;gap:10px', '', [rejectBtn, approve]), note]);
    const scrim = el('div', 'position:fixed;inset:0;z-index:2147483000;background:rgba(20,18,15,.5);display:grid;place-items:center;padding:16px 16px 100px', '', [card]);
    scrim.setAttribute('role', 'dialog'); scrim.setAttribute('aria-modal', 'true'); scrim.setAttribute('aria-label', 'Approve transaction');
    const close = () => { scrim.parentNode?.removeChild(scrim); };
    rejectBtn.onclick = () => { close(); rejectSheet(new Error('Rejected in the test wallet. Nothing was sent.')); };
    approve.onclick = () => {
      approve.disabled = true; rejectBtn.disabled = true; approve.style.opacity = '.55'; approve.textContent = 'Signing…'; note.textContent = 'Signing with the NEAR account key and sending to testnet.';
      resolve({ close, sent: (hash: string) => { mark(cl, 'Signed'); approve.textContent = 'Sent'; approve.style.opacity = '1'; approve.style.background = 'var(--jade-d)'; note.textContent = `Transaction ${short(hash, 8, 6)} sent to NEAR testnet.`; setTimeout(close, 2200); } });
    };
    (document.body || document.documentElement).append(scrim); approve.focus();
  });
}
