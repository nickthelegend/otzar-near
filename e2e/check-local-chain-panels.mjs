// Compiles the actual configuration gate with four build-time RPC settings. No RPC or signing.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
const require=createRequire(resolve('packages/web/package.json'));
const esbuild=createRequire(require.resolve('vite'))('esbuild');
const dir=mkdtempSync(join(tmpdir(),'otzar-local-panels-'));
try{
 for(const [name,eth,sol,expected] of [
  ['unset','','',['BTC']],
  ['ethereum','http://127.0.0.1:5997','',['ETH','BTC']],
  ['solana','','http://127.0.0.1:5998',['BTC','SOL']],
  ['both','http://127.0.0.1:5997','http://127.0.0.1:5998',['ETH','BTC','SOL']],
 ]){
  const file=join(dir,name+'.cjs');
  await esbuild.build({stdin:{contents:"export {LocalChain, configuredVaultChains, bitcoinNodeNote} from './LocalChain'; export {createElement} from 'react'; export {renderToStaticMarkup} from 'react-dom/server';",resolveDir:resolve('packages/web/src'),loader:'tsx'},bundle:true,platform:'node',format:'cjs',jsx:'automatic',outfile:file,define:{'import.meta.env':JSON.stringify({VITE_ANVIL_RPC_URL:eth,VITE_SOLANA_RPC_URL:sol})},logLevel:'error'});
  const m=require(file);assert.deepEqual(m.configuredVaultChains(),expected);
  for(const chain of ['BTC','ETH','SOL']){
   const html=m.renderToStaticMarkup(m.createElement(m.LocalChain,{chain},m.createElement('section',{'data-chain':chain},chain+' panel')));
   assert.equal(html.includes(chain+' panel'),expected.includes(chain),name+': '+chain);
  }
  assert.equal(m.bitcoinNodeNote,'Bitcoin runs on local regtest in this demo; balances need a local node (README)');
 }
 console.log('PASS: 4 build-time RPC configurations; 12 actual panel-gate render checks; Bitcoin always available; zero network requests or transactions.');
}finally{rmSync(dir,{recursive:true})}
