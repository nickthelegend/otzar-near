import {readFileSync,writeFileSync} from 'node:fs';
import {deriveAddresses,bitcoinAddress,oneClickTokens,dryBitcoinQuote} from '@hako/sdk';

const deployment=JSON.parse(readFileSync('deployments/testnet-2026-11-09.json','utf8'));
const output='deployments/oneclick-dry-2026-11-09.json';
const evidence={date:new Date().toISOString(),api:'https://1click.chaindefuser.com/v0/quote',dry:true,status:'running'};
try{
  const assets=await oneClickTokens();const origin=assets.find(t=>t.blockchain==='eth'&&t.symbol==='ETH');const target=assets.find(t=>t.assetId==='nep141:btc.omft.near');
  if(!origin||!target)throw new Error('Live 1Click token list lacks ETH or native BTC');
  const derived=await deriveAddresses(deployment.accounts.contract,deployment.tokenId,1);
  const recipient=bitcoinAddress(Buffer.from(derived.bitcoinPublicKey,'hex'),'mainnet');
  const response=await dryBitcoinQuote({originAsset:origin.assetId,amount:'10000000000000000',recipient,refundTo:derived.ethereum});
  if(response.quote?.depositAddress)throw new Error('Dry quote unexpectedly issued a deposit address');
  evidence.status='verified';evidence.originAsset=origin.assetId;evidence.destinationAsset=target.assetId;evidence.recipient=recipient;evidence.amountIn=response.quote.amountIn;evidence.amountOut=response.quote.amountOut;evidence.correlationId=response.correlationId;evidence.signature=response.signature;
}catch(error){evidence.status='BLOCKED';evidence.error=error.message;process.exitCode=1;}
writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');console.log(`${evidence.status}: ${evidence.correlationId||evidence.error}`);
