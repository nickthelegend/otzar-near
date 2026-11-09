import { address as btcAddress, networks } from 'bitcoinjs-lib';

const API = 'https://1click.chaindefuser.com/v0';
export type OneClickAsset = {assetId:string; blockchain:string; symbol:string; decimals:number};
export type DryBitcoinQuoteInput = {originAsset:string; amount:string; recipient:string; refundTo:string; jwt?:string};

export async function oneClickTokens():Promise<OneClickAsset[]> {
  const response=await fetch(`${API}/tokens`);
  if(!response.ok)throw new Error(`1Click tokens HTTP ${response.status}`);
  const tokens=await response.json();
  if(!Array.isArray(tokens)||!tokens.every(t=>typeof t.assetId==='string'&&typeof t.blockchain==='string'&&typeof t.symbol==='string'&&Number.isInteger(t.decimals)))throw new Error('Invalid 1Click token response');
  return tokens;
}

/** This endpoint is preview only. It never obtains a deposit address or initiates a swap. */
export async function dryBitcoinQuote(input:DryBitcoinQuoteInput):Promise<unknown> {
  if(!/^\d+$/.test(input.amount)||BigInt(input.amount)<=0n)throw new Error('Amount must be positive base units');
  if(!input.originAsset||!input.refundTo)throw new Error('Origin asset and refund address required');
  try{btcAddress.toOutputScript(input.recipient,networks.bitcoin);}catch{throw new Error('A mainnet Bitcoin recipient is required');}
  if(!input.recipient.startsWith('bc1q'))throw new Error('A native SegWit Bitcoin recipient is required');
  const tokens=await oneClickTokens();
  const origin=tokens.find(t=>t.assetId===input.originAsset);
  const target=tokens.find(t=>t.blockchain==='btc'&&t.symbol==='BTC'&&t.assetId==='nep141:btc.omft.near');
  if(!origin)throw new Error('Origin asset is not supported by live 1Click token list');
  if(!target)throw new Error('Native BTC is not supported by live 1Click token list');
  const request={dry:true,swapType:'EXACT_INPUT',slippageTolerance:100,originAsset:origin.assetId,depositType:'ORIGIN_CHAIN',destinationAsset:target.assetId,amount:input.amount,recipient:input.recipient,recipientType:'DESTINATION_CHAIN',refundTo:input.refundTo,refundType:'ORIGIN_CHAIN',deadline:new Date(Date.now()+3*60_000).toISOString()};
  for(let attempt=0;attempt<2;attempt++){
    const response=await fetch(`${API}/quote`,{method:'POST',headers:{'content-type':'application/json',...(input.jwt?{authorization:`Bearer ${input.jwt}`}:{})},body:JSON.stringify(request)});
    const body=await response.json();
    if(response.status>=500&&attempt===0)continue;
    if(!response.ok)throw new Error(`1Click quote HTTP ${response.status}: ${JSON.stringify(body)}`);
    if(!body||typeof body!=='object'||!body.quote||body.quote.depositAddress)throw new Error('Invalid dry 1Click quote response');
    return body;
  }
  throw new Error('1Click quote unavailable');
}
