import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const port=Number(process.env.HAKO_BITCOIN_PROXY_PORT||3007);
const webOrigin=process.env.HAKO_WEB_ORIGIN||'http://127.0.0.1:5173';
const cookieFile=resolve('.demo/bitcoin/regtest/.cookie');
createServer(async(req,res)=>{
  if(req.headers.origin && req.headers.origin!==webOrigin){res.writeHead(403);res.end();return;}
  res.setHeader('access-control-allow-origin',webOrigin);
  res.setHeader('access-control-allow-methods','GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers','content-type');
  res.setHeader('content-type','application/json');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  const match=req.url?.match(/^\/address\/(bcrt1[023456789acdefghjklmnpqrstuvwxyz]{20,90})$/);
  if(!(req.method==='GET'&&match) && !(req.method==='POST'&&req.url==='/broadcast')){res.writeHead(404);res.end(JSON.stringify({error:'unknown route'}));return;}
  try{
    const cookie=readFileSync(cookieFile,'utf8').trim();
    let method,params;
    if(req.method==='POST'){
      let body='';for await (const chunk of req){body+=chunk;if(body.length>10000)throw new Error('transaction too large');}
      const raw=JSON.parse(body).rawHex;
      if(typeof raw!=='string'||!/^[0-9a-f]{100,8000}$/i.test(raw))throw new Error('invalid signed transaction');
      method='sendrawtransaction';params=[raw];
    }else{method='scantxoutset';params=['start',[`addr(${match[1]})`]];}
    const response=await fetch('http://127.0.0.1:18443/',{method:'POST',headers:{'content-type':'application/json',authorization:`Basic ${Buffer.from(cookie).toString('base64')}`},body:JSON.stringify({jsonrpc:'1.0',id:'hako',method,params})});
    if(!response.ok)throw new Error(`bitcoind HTTP ${response.status}`);
    const result=await response.json();if(result.error)throw new Error(JSON.stringify(result.error));
    if(req.method==='POST'){res.end(JSON.stringify({txid:result.result}));return;}
    const utxos=result.result.unspents.map(u=>({txid:u.txid,vout:u.vout,sats:String(Math.round(u.amount*1e8)),height:u.height}));
    const sats=utxos.reduce((n,u)=>n+BigInt(u.sats),0n);
    res.end(JSON.stringify({address:match[1],confirmed_sats:sats.toString(),height:result.result.height,utxos}));
  }catch(e){res.writeHead(502);res.end(JSON.stringify({error:e.message}));}
}).listen(port,'127.0.0.1',()=>console.log(`Hako Bitcoin proxy listening on 127.0.0.1:${port}`));
