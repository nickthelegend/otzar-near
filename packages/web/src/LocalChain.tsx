import type { ReactNode } from 'react';
import { anvilUrl, solanaUrl } from './lib';

export type VaultChain = 'ETH' | 'BTC' | 'SOL';
export const bitcoinNodeNote = 'Bitcoin runs on local regtest in this demo; balances need a local node (README)';
export const chainConfigured = (chain: VaultChain) => chain === 'BTC' || !!(chain === 'ETH' ? anvilUrl : solanaUrl);
export const configuredVaultChains = () => (['ETH', 'BTC', 'SOL'] as const).filter(chainConfigured);

/** Optional local-chain panels are available only in builds configured for those nodes. */
export function LocalChain({ chain, children }: { chain: VaultChain; children: ReactNode }) {
  return chainConfigured(chain) ? <>{children}</> : null;
}
