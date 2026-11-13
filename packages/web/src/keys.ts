import { useSyncExternalStore } from 'react';

// ML-DSA-65 key files the owner loaded in this tab. Kept in memory only (never in browser storage) and forgotten
// on reload, so a secret key never outlives the page. Matched to vaults by public key.
export type LoadedKey = { name: string; publicKey: string; file: File; fingerprint: string };
let keys: LoadedKey[] = [];
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());

export async function fingerprintOf(bytes: Uint8Array) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
  return [...d.slice(0, 6)].map(b => b.toString(16).padStart(2, '0')).join('').replace(/(.{4})/g, '$1 ').trim();
}

export async function loadKeyFile(file: File): Promise<LoadedKey> {
  let parsed: { publicKey?: unknown; secretKey?: unknown };
  try { parsed = JSON.parse(await file.text()); } catch { throw new Error('That file is not an Otzar key file (JSON expected)'); }
  if (typeof parsed.publicKey !== 'string' || typeof parsed.secretKey !== 'string') throw new Error('Not an ML-DSA-65 key file: publicKey and secretKey are required');
  const pub = Uint8Array.from(atob(parsed.publicKey), c => c.charCodeAt(0));
  if (pub.length !== 1952) throw new Error('ML-DSA-65 public keys are 1,952 bytes; this one is not');
  const k: LoadedKey = { name: file.name, publicKey: parsed.publicKey, file, fingerprint: await fingerprintOf(pub) };
  keys = [...keys.filter(x => x.publicKey !== k.publicKey), k]; emit();
  return k;
}
export function forgetKey(publicKey: string) { keys = keys.filter(k => k.publicKey !== publicKey); emit(); }
export function forgetAll() { keys = []; emit(); }

const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));
/** The loaded key file whose public key is this vault's registered ML-DSA key, if any. */
export function keyForVault(pq: number[] | null | undefined): LoadedKey | undefined { if (!pq) return undefined; const want = b64(pq); return keys.find(k => k.publicKey === want); }

export function useKeys() { return useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb); }, () => keys); }
