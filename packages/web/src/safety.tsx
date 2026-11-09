import type { StickerName } from './art';

const RULES = [
  { glow: 'key' as StickerName, k: 'Quantum key', h: 'Only your quantum key can ask for a spend.', p: 'Bitcoin keys are elliptic-curve keys a large quantum computer could crack. Otzar puts the decision of who may spend behind an ML-DSA-65 signature that NEAR checks on-chain. No valid signature, no spend.' },
  { glow: 'hourglass' as StickerName, k: 'Delay and guardian', h: 'Big moves wait, and someone you trust can pull them back.', p: 'Spends over the daily cap are refused. Spends to new addresses wait out a delay, and during it your guardian can send the coins to your recovery address instead.' },
  { glow: 'guardians' as StickerName, k: 'Lost key', h: 'Lose your key and two of three guardians can replace it.', p: 'Each guardian holds their own ML-DSA key. When enough of them agree, a new owner key takes over after a timelock, and you can cancel during that time if it was not you.' },
  { glow: 'shield' as StickerName, k: 'Heir', h: 'Stop checking in and the vault passes to your heir.', p: 'Set an heir and a check-in deadline. Miss it, and after the grace delay the heir can claim the NFT, and with it the addresses and coins inside.' },
];

/** The guardian and quantum safety story in plain words, with the honest boundary underneath. */
export default function Safety({ compact = false }: { compact?: boolean }) {
  return <div className={`safety ${compact ? 'safety-compact' : ''}`}>
    <ol className="safety-grid">{RULES.map((r, i) => <li key={r.k} className={`safe safe-${i}`}>
      <div className="safe-copy">
        <span className="safe-k"><b>0{i + 1}</b>{r.k}</span>
        <h3>{r.h}</h3>
        <p>{r.p}</p>
      </div>
    </li>)}</ol>
    <p className="safety-edge"><b>Where the guarantee stops.</b> The signer network that produces the Bitcoin, Ethereum and Solana signatures still uses classical keys, and so do those chains. "Quantum-safe" here means who may <em>ask</em> for a signature is decided by a post-quantum key on NEAR; it does not change Bitcoin itself.</p>
  </div>;
}
