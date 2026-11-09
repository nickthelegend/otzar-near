import { useEffect, useState } from 'react';
import { setupWalletSelector } from '@near-wallet-selector/core';
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet';
import Landing from './Landing';
import WalletApp from './WalletApp';
import { contractId, navigate, nearblocksAccount, short } from './lib';
import { Icon } from './ui';

function useRoute() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => { const on = () => setPath(location.pathname); addEventListener('popstate', on); return () => removeEventListener('popstate', on); }, []);
  return path.startsWith('/app') ? 'app' : 'home';
}

export default function App() {
  const route = useRoute();
  const [selector, setSelector] = useState<any>(); const [account, setAccount] = useState(''); const [walletError, setWalletError] = useState('');
  useEffect(() => {
    setupWalletSelector({ network: 'testnet', modules: [setupMyNearWallet()] })
      .then(async s => { setSelector(s); const w = await s.wallet('my-near-wallet'); const a = await w.getAccounts(); setAccount(a[0]?.accountId || ''); })
      .catch(e => setWalletError(e.message));
  }, []);
  useEffect(() => { document.title = route === 'app' ? 'Hako · Vaults' : "Hako · Your Bitcoin dies on Q-day. Hako doesn't."; }, [route]);
  async function connect() {
    try {
      if (!contractId) throw new Error('Setup required: VITE_HAKO_CONTRACT');
      if (!selector) throw new Error('Wallet selector is still loading');
      const wallet = await selector.wallet('my-near-wallet'); const a = await wallet.signIn({ contractId }); setAccount(a?.[0]?.accountId || '');
    } catch (e) { setWalletError((e as Error).message); }
  }
  async function disconnect() { const wallet = await selector.wallet('my-near-wallet'); await wallet.signOut(); setAccount(''); }
  const go = (path: string) => (e: React.MouseEvent) => { e.preventDefault(); navigate(path); };

  return <div className={`shell route-${route}`}>
    <header className="topbar">
      <a className="wordmark" href="/" onClick={go('/')}><span className="wm-glyph">箱</span><span>Hako</span></a>
      {route === 'home' ? <nav className="topnav" aria-label="Sections"><a href="#how">How it works</a><a href="#yield">Yield</a><a href="#scan">Scanner</a><a href="#tech">NEAR tech</a></nav>
        : <nav className="topnav" aria-label="Pages"><a href="/" onClick={go('/')}>Overview</a><a href="/app" aria-current="page" onClick={go('/app')}>Vaults</a></nav>}
      <div className="topbar-end">
        <span className="net"><i />Testnet</span>
        {account ? <button className="btn btn-ghost btn-sm acct" onClick={disconnect} title="Disconnect">{short(account, 10, 8)}</button>
          : route === 'home' ? <a className="btn btn-primary btn-sm" href="/app" onClick={go('/app')}>Open app</a>
          : <button className="btn btn-primary btn-sm" onClick={connect} disabled={!selector}>Connect wallet</button>}
      </div>
    </header>
    {walletError && <p className="wallet-error" role="alert">{walletError}</p>}
    <main>{route === 'app' ? <WalletApp selector={selector} account={account} connect={connect} /> : <Landing />}</main>
    <footer className="foot">
      <div className="foot-brand"><span className="wm-glyph">箱</span><div><b>Hako</b><span>Quantum-safe Bitcoin vaults on NEAR. Testnet and local-chain prototype.</span></div></div>
      <div className="foot-links">
        {contractId && <a href={nearblocksAccount(contractId)} target="_blank" rel="noreferrer">Contract on NearBlocks <Icon name="external" size={14} /></a>}
        <span>MIT · © 2026 Nivesh Gajengi</span>
      </div>
    </footer>
  </div>;
}
