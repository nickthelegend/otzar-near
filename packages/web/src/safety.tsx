const RULES = [
  { h: 'Only your quantum key can ask for a spend.', p: 'Spends need an ML-DSA-65 signature that NEAR checks on-chain. Bitcoin’s own keys are the kind a large quantum computer could crack; this one is not.' },
  { h: 'Big moves wait, and your guardian can pull them back.', p: 'Spends over the daily cap are refused. Spends to new addresses wait out a delay, during which your guardian can send the coins to your recovery address instead.' },
  { h: 'Lose your key and two of three guardians can replace it.', p: 'A new key takes over after a timelock, and you can cancel it if it wasn’t you.' },
  { h: 'Stop checking in and the vault passes to your heir.', p: 'Miss the check-in deadline and, after a grace delay, your heir can claim the NFT and the coins it controls.' },
];

/** The four safety rules in plain words, with the honest boundary underneath. */
export default function Safety() {
  return <div className="safety">
    <ul className="safety-list">{RULES.map(r => <li key={r.h}><b>{r.h}</b> {r.p}</li>)}</ul>
    <p className="safety-edge"><b>Where the guarantee stops.</b> The signer network and Bitcoin itself still use classical keys. “Quantum-safe” here means who may <em>ask</em> for a signature is decided by a post-quantum key on NEAR.</p>
  </div>;
}
