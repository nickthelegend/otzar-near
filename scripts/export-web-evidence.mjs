// Copies the pointers (token IDs, tx hashes, regtest txids) of the latest live covered-call run into
// the web app. Every number the web shows (premium, strike, price, state) is read live from NEAR.
import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
const runs=readdirSync('deployments').filter(f=>/^calls-live-testnet-.*\.json$/.test(f)).sort();
const pick=runs.map(f=>[f,JSON.parse(readFileSync(`deployments/${f}`,'utf8'))]).filter(([,r])=>r.calls?.itm?.premiumPaid&&r.calls?.otm?.premiumPaid).pop();
if(!pick)throw new Error('no completed live run in deployments/');
const [file,r]=pick;const tx=re=>r.steps.find(s=>re.test(s.name)&&!s.rejected&&!s.error)?.txHash||null;const rej=re=>r.steps.find(s=>re.test(s.name)&&s.rejected)?.txHash||null;
const out={source:`deployments/${file}`,date:r.date,premiumToken:r.premiumToken.account,writer:r.accounts.writer,buyer:r.accounts.buyer,
  calls:['itm','otm'].map(k=>({kind:k,tokenId:r.calls[k].tokenId,write:tx(new RegExp(`^${k}: write`)),buy:tx(new RegExp(`^${k}: buy`)),settle:tx(new RegExp(`^${k}: settle`)),
    strike:tx(/^itm: buyer pays strike/)&&k==='itm'?tx(/^itm: buyer pays strike/):null,mpc:k==='itm'?tx(/^itm: contract MPC-signs/):tx(/^otm: MPC signs/),release:k==='otm'?tx(/^otm: writer spend accepted/):null,
    blockedSpend:k==='itm'?rej(/^itm: writer front-run/):rej(/^otm: writer spend of sold-call/),btcTx:k==='itm'?r.calls.itm.exerciseBtcTx||null:r.calls.otm.releaseBtcTx||null})),
  price:tx(/^relay Coinbase/)};
writeFileSync('packages/web/src/evidence/live-calls.json',JSON.stringify(out,null,2)+'\n');console.log(`exported ${file}`);
