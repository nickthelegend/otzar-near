// Zero transactions: financial-duration boundaries and public/private catalog rendering.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
const require=createRequire(resolve('packages/web/package.json'));
const esbuild=createRequire(require.resolve('vite'))('esbuild');
const dir=mkdtempSync(join(tmpdir(),'otzar-display-'));
try{
 const file=join(dir,'display.cjs');
 await esbuild.build({stdin:{contents:"export * from './lib'; export {VaultTable, RoundBars, plainRoundLabel, roundSentence} from './cards'; export {AprRange} from './rounds'; export {renderToStaticMarkup} from 'react-dom/server'; export {createElement} from 'react';",resolveDir:resolve('packages/web/src'),loader:'tsx'},outfile:file,bundle:true,platform:'node',format:'cjs',jsx:'automatic',define:{'import.meta.env':'{}'},logLevel:'error'});
 const m=require(file),{createElement:h,renderToStaticMarkup:render}=m;
 const source=JSON.parse(readFileSync('deployments/film-browser-2026-11-12.json','utf8')).capture.call;
 // The source round is real; these copies deliberately change only the clock for boundary tests.
 const at=seconds=>({...source,opened_ns:0,expiry_ns:seconds*1e9,key:'boundary#0'});
 const minute=at(240),below=at(86399),day=at(86400),above=at(86401);
 for(const round of [minute,below]){assert.equal(m.annualisedPct(round),null);assert.equal(m.aprFor(round,round.opening_premium_usdc),null);assert.match(m.roundYieldLabel(round),/^Demo round \(\d+ min\)$/)}
 for(const round of [day,above]){assert(m.annualisedPct(round)>0);assert(m.aprFor(round,round.opening_premium_usdc)>0);assert.match(m.roundYieldLabel(round),/%$/)}
 const demo=m.earnedSummary([minute,below]);assert.equal(demo.blended,null);assert.equal(demo.earned,2n*BigInt(source.premium_paid_usdc));assert.equal(m.summaryYieldLabel(demo),'Demo rounds (minutes)');
 const mixed=m.earnedSummary([minute,day]);assert.equal(mixed.blended,m.annualisedPct(day));assert.equal(mixed.earned,2n*BigInt(source.premium_paid_usdc));assert.equal(m.summaryYieldLabel(mixed),'Realised APY');
 assert(m.isPublicVault('public-qa-vault'));assert(!m.isPublicVault('qa-web-vault'));assert(!m.isPublicVault('QA-vault'));
 const owner=source.writer,qa={...minute,token_id:'qa-web-vault',key:'qa-web-vault#0'},publicRound={...minute,token_id:'public-vault',key:'public-vault#0'};
 const boxes=[{token_id:qa.token_id,owner_id:owner},{token_id:publicRound.token_id,owner_id:owner}],rounds=[qa,publicRound];
 for(const filter of ['all','rounds']){const html=render(h(m.VaultTable,{boxes,rounds,account:owner,filter}));assert(!html.includes('/vault/qa-web-vault'));assert(html.includes('/vault/public-vault'));assert(html.includes('Demo round (4 min)'));assert(!/\d(?:\.\d+)?%/.test(html.replace(/style="[^"]*"/g,'')))}
 const mine=render(h(m.VaultTable,{boxes,rounds,account:owner,filter:'mine'}));assert(mine.includes('/vault/qa-web-vault'));
 const band=render(h(m.AprRange,{c:minute}));assert(band.includes('Demo round (4 min)'));assert(band.includes('tUSDC'));assert(!/\d(?:\.\d+)?% APR/.test(band));
 const chart=render(h(m.RoundBars,{rounds:[minute]}));assert(chart.includes('Premium paid in tUSDC'));assert(chart.includes('Demo round (4 min)'));assert(!chart.includes('% annualised'));
 const expired={...minute,state:'sold'};assert.equal(m.plainRoundLabel(expired,300000),'Sold, awaiting settlement');assert(m.roundSentence(expired,300000).includes('has ended and is awaiting'));assert(m.roundSentence(expired,1000).includes('round is running'));
 assert.equal(m.annualisedPct({...minute,expiry_ns:0}),null);assert.equal(m.annualisedPct({...day,premium_paid_usdc:null}),null);
 console.log('PASS: sub-day, exact-day and mixed-history yield boundaries; premiums retained; public QA filtering; private QA visibility; demo chart/range; expired-round copy. Zero transactions.');
}finally{rmSync(dir,{recursive:true})}
