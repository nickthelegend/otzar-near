import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const deployment=JSON.parse(readFileSync(resolve('../../deployments/testnet-2026-11-09.json'),'utf8'));
describe('live MCP server',()=>{
  it('exposes three tools and reads an actual testnet box',async()=>{
    const transport=new StdioClientTransport({command:'node',args:['dist/main.js'],env:{...process.env,HAKO_CONTRACT_ID:deployment.accounts.contract} as Record<string,string>});
    const client=new Client({name:'hako-test',version:'0.1.0'});
    await client.connect(transport);
    try{
      const tools=await client.listTools();
      expect(tools.tools.map(t=>t.name).sort()).toEqual(['box_info','list_box','request_spend']);
      const info=await client.callTool({name:'box_info',arguments:{token_id:deployment.tokenId}});
      expect(info.isError).not.toBe(true);
      const box=JSON.parse((info.content[0] as {text:string}).text);
      expect(box.box.token_id).toBe(deployment.tokenId);
      expect(box.addresses.bitcoin).toBe(deployment.addresses.bitcoin);
    }finally{await client.close();}
  },30_000);
});
