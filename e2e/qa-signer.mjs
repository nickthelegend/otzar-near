// Real browser writes. NEAR credentials stay in Node/page memory; no traces, HAR, or key logging.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'); process.chdir(root);
const scratch = '/private/tmp/claude-501/-Volumes-Extreme-SSD-Projects-grokbot/0f121b7c-0081-4ec0-81a9-0ccb4f7f8b48/scratchpad';
const out = join(scratch, 'flow-qa/hako/qa-signer'); mkdirSync(out, { recursive: true });
const { withChromeLock } = await import(pathToFileURL(process.env.CHROME_LOCK_MODULE || join(scratch, 'chrome-lock.mjs')).href);
const exec = promisify(execFile), pause = ms => new Promise(r => setTimeout(r, ms));
const RPC = 'https://near-testnet.drpc.org', contract = 'hako-contract-mw984kpp.testnet', token = 'husdc-3177b477.testnet';
const cap = 3n * 10n ** 23n, yocto = 10n ** 24n;
const prior = JSON.parse(readFileSync('deployments/flow-qa-2026-11-11.json', 'utf8'));
const baseline = prior.budget.before;
const ids = { contract, seller: 'hako-seller-mw984kqa.testnet', buyer: 'hako-buyer-mw984kqb.testnet', guardian: 'hako-guardian-mw984kqc.testnet' };
const date = new Date().toISOString().slice(0, 10), recordFile = `deployments/qa-browser-${date}.json`;
const record = existsSync(recordFile) ? JSON.parse(readFileSync(recordFile, 'utf8')) : { date, network: 'NEAR testnet + Bitcoin Core regtest', capNEAR: 0.3, runs: [] };
const resume = process.env.QA_RESUME_RUN ? record.runs.find(r => r.id === process.env.QA_RESUME_RUN) : null;
if (process.env.QA_RESUME_RUN) assert(resume, 'Unknown QA resume run');
if (resume?.status === 'PASS') throw new Error('QA run already passed; its regtest fixture is consumed. See the saved receipts. Do not repeat spending or delete evidence to bypass the cumulative cap.');
const id = resume?.id || Date.now().toString(36), run = resume || { id, started: new Date().toISOString(), status: 'RUNNING', tokenId: `qa-web-${id}`, resaleTokenId: prior.tokenId, steps: [], screenshots: [], checks: [], consoleErrors: [], failures: [] };
if (!resume) record.runs.push(run);
run.attempts ||= []; run.attempts.push({ started: new Date().toISOString(), previousStatus: run.status, previousError: run.error || null });
run.status = 'RUNNING'; delete run.error; const attemptId = `${id}-a${run.attempts.length}`;
const save = () => writeFileSync(recordFile, JSON.stringify(record, null, 2) + '\n');
const children = []; let browser, bitcoinPort;
function stopChildren() { for (const { child } of [...children].reverse()) if (child) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} } }
process.on('exit', stopChildren);
const safe = e => String(e?.message || e).replace(/ed25519:[1-9A-HJ-NP-Za-km-z]{80,100}/g, '[redacted]');
async function rpc(method, params) {
  for (let i = 0; i < 5; i++) {
    try { const r = await fetch([RPC, 'https://testnet-rpc.intea.rs', 'https://test.rpc.fastnear.com'][i % 3], { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'qa-browser', method, params }), signal: AbortSignal.timeout(20000) }); if (!r.ok) throw Error(`NEAR RPC HTTP ${r.status}`); const j = await r.json(); if (j.error) throw Error(`NEAR RPC ${method} failed`); return j.result; }
    catch (e) { if (i === 4) throw e; await pause(1000 * (i + 1)); }
  }
}
async function view(method, args, account = contract) { const r = await rpc('query', { request_type: 'call_function', finality: 'final', account_id: account, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') }); return JSON.parse(Buffer.from(r.result).toString()); }
async function balances() { return Object.fromEntries(await Promise.all(Object.entries(ids).map(async ([name, account_id]) => [name, await rpc('query', { request_type: 'view_account', finality: 'final', account_id })]))); }
async function budget() {
  const now = await balances();
  const loss = Object.keys(ids).reduce((n, k) => n + BigInt(baseline[k].amount) - BigInt(now[k].amount), 0n);
  const storage = Object.keys(ids).reduce((n, k) => n + BigInt(now[k].storage_usage - baseline[k].storage_usage) * 10n ** 19n, 0n);
  const deposits = record.runs.flatMap(r => r.steps).reduce((n, s) => n + BigInt(s.deposit || '0'), 0n) + BigInt(prior.budget.grossInternalSalePaymentYocto);
  const total = loss + storage + deposits;
  run.budget = { gasNetYocto: loss.toString(), addedStorageYocto: storage.toString(), grossDepositsYocto: deposits.toString(), totalYocto: total.toString(), totalNEAR: Number(total) / 1e24, remainingNEAR: Number(cap - total) / 1e24, includesPriorQA: true };
  return { now, total };
}
async function guard(tx) {
  assert(Object.values(ids).includes(tx.accountId), 'QA account is outside this repo');
  assert([contract, token].includes(tx.receiverId), 'QA receiver is outside this repo');
  const b = await budget(), name = Object.keys(ids).find(k => ids[k] === tx.accountId);
  const gasPrice = BigInt((await rpc('gas_price', [null])).gas_price);
  const available = BigInt(b.now[name].amount) - BigInt(b.now[name].storage_usage) * 10n ** 19n;
  assert(available >= yocto / 5n, 'QA stopped: funded demo account balance is low');
  const storageReserve = tx.methods.includes('register_pq_key') ? 3n * 10n ** 22n : tx.methods.includes('request_btc_spend') ? 12n * 10n ** 21n : tx.methods.some(m => ['register_btc', 'write_call'].includes(m)) ? 2n * 10n ** 22n : 5n * 10n ** 21n;
  assert(b.total + BigInt(tx.gas) * gasPrice + BigInt(tx.deposit) + storageReserve <= cap, 'QA stopped: 0.3 NEAR cumulative budget would be exceeded');
}
async function receipt(tx) {
  assert(/^[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(tx.hash), 'Invalid receipt hash');
  const step = { accountId: tx.accountId, receiverId: tx.receiverId, methods: tx.methods, txHash: tx.hash, deposit: tx.deposit || '0', final: tx.final, success: tx.success, source: tx.source || 'browser', explorer: `https://testnet.nearblocks.io/txns/${tx.hash}` };
  const previous = run.steps.find(s => s.txHash === tx.hash);
  if (previous) Object.assign(previous, step); else run.steps.push(step); save();
  if (!tx.final) return;
  const current = previous || step;
  const actual = await rpc('tx', { tx_hash: tx.hash, sender_account_id: tx.accountId, wait_until: 'FINAL' });
  current.independentlyVerified = actual.transaction.hash === tx.hash && !actual.status?.Failure && actual.final_execution_status === 'FINAL'; save();
  assert(current.independentlyVerified && tx.success, 'QA transaction failed or was not final');
  await budget(); save(); console.log(`FINAL ${tx.methods.join(', ')} ${tx.hash}`);
}
async function checkSwap() { for (;;) { const { stdout } = await exec('sysctl', ['vm.swapusage']); const free = Number(stdout.match(/free = ([\d.]+)M/)?.[1]); if (free >= 500) return; console.log('Swap free below 500 MB; waiting two minutes'); await pause(60000); await pause(60000); } }
async function command(args, name, env = {}) { await checkSwap(); try { const r = await exec('pnpm', args, { cwd: root, env: { ...process.env, ...env }, maxBuffer: 8 * 1024 * 1024 }); writeFileSync(join(out, name + '.log'), r.stdout + r.stderr); } catch (e) { writeFileSync(join(out, name + '.log'), (e.stdout || '') + (e.stderr || '')); throw new Error(`${name} failed; see ${join(out, name + '.log')}`); } }
async function freePort() { for (let port = 5760; port <= 5999; port++) { if (children.some(c => c.port === port)) continue; const ok = await new Promise(r => { const s = createServer(); s.once('error', () => r(false)); s.listen(port, '127.0.0.1', () => s.close(() => r(true))); }); if (ok) return port; } throw Error('No free QA port'); }
function start(cmd, args, env = {}, port) { const child = spawn(cmd, args, { cwd: root, env: { ...process.env, ...env }, stdio: 'ignore', detached: true }); children.push({ child, port }); return child; }
async function waitFor(fn, message, timeout = 90000) { const until = Date.now() + timeout; while (Date.now() < until) { try { if (await fn()) return; } catch {} await pause(500); } throw Error(message); }
async function btc(method, params = [], wallet = '') { const cookie = readFileSync('.demo/bitcoin/regtest/.cookie', 'utf8').trim(); const r = await fetch(`http://127.0.0.1:${bitcoinPort}/${wallet ? `wallet/${wallet}` : ''}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Basic ${Buffer.from(cookie).toString('base64')}` }, body: JSON.stringify({ jsonrpc: '1.0', id: 'qa-browser', method, params }), signal: AbortSignal.timeout(15000) }); const j = await r.json(); if (j.error) throw Error(`Regtest ${method} failed`); return j.result; }
async function snap(page, label) {
  const original = page.viewportSize();
  for (const width of [1440, 375]) { await page.setViewportSize({ width, height: width === 1440 ? 1000 : 900 }); await page.waitForTimeout(250); const path = join(out, `${attemptId}-${width}-${label}.png`); await page.screenshot({ path, fullPage: true }); const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth); run.screenshots.push({ label, width, path, fits }); save(); assert(fits, `Horizontal overflow: ${label} at ${width}`); }
  await page.setViewportSize(original); save();
}
async function click(locator) { await locator.evaluate(e => e.scrollIntoView({ block: 'center' })); await locator.page().waitForTimeout(180); await locator.click(); }
async function txClick(page, locator, method) { const n = run.steps.length; await click(locator); await waitFor(() => run.steps.slice(n).some(s => s.methods.includes(method) && s.independentlyVerified), `No final browser receipt for ${method}`, 180000); await page.waitForTimeout(700); }
async function connectIfNeeded(page) { const button = page.locator('.bar').getByRole('button', { name: 'Connect', exact: true }); if (await button.count()) await click(button); }
async function contextFor(label, base) {
  // The existing testnet key is read only here in Node and injected into page memory, never logged/copied to another file.
  const credential = JSON.parse(readFileSync(resolve(`.near-credentials/${label}.json`), 'utf8'));
  assert(credential.id === ids[label], 'Credential does not belong to this repo demo account');
  const ctx = await browser.newContext({ viewport: { width: label === 'buyer' ? 375 : 1440, height: 1000 }, acceptDownloads: true });
  await ctx.addInitScript(data => { window.__OTZAR_QA_SIGNER__ = data; window.__OTZAR_QA_AUTO_APPROVE__ = true; }, { accountId: credential.id, privateKey: credential.key, rpcUrl: RPC });
  credential.key = '';
  const page = await ctx.newPage(); page.qaActor = label; await page.exposeFunction('__OTZAR_QA_BUDGET_CHECK__', guard); await page.exposeFunction('__OTZAR_QA_RECORD__', receipt);
  page.on('pageerror', e => { run.failures.push(safe(e)); save(); });
  page.on('console', m => { if (m.type() === 'error') { run.consoleErrors.push(m.text().replace(/ed25519:[1-9A-HJ-NP-Za-km-z]{80,100}/g, '[redacted]')); save(); } });
  await page.goto(base + '/app'); await page.locator('a.vt-row').first().waitFor({ timeout: 90000 });
  await snap(page, label + '-before-connect'); await connectIfNeeded(page);
  await page.getByRole('button', { name: 'New vault', exact: true }).first().waitFor(); await page.locator('.s-widget-big').filter({ hasText: /[0-9]/ }).waitFor({ timeout: 60000 }); await snap(page, label + '-connected');
  return { ctx, page };
}
async function mint(page, name) {
  await click(page.getByRole('button', { name: 'New vault', exact: true }).first());
  await page.getByLabel(/^Vault ID/).fill(name);
  await page.getByLabel('Guardian NEAR account', { exact: true }).fill(ids.guardian);
  await page.getByLabel('Recovery ETH address', { exact: true }).fill('0x1111111111111111111111111111111111111111');
  await snap(page, 'mint-form-' + name);
  await txClick(page, page.getByRole('button', { name: 'Mint on NEAR testnet', exact: true }), 'mint');
  await page.waitForURL('**/vault/' + name); await page.locator('.s-vhead h1').waitFor(); await snap(page, 'minted-' + name);
}
async function tools(page, tab) { const fold = page.locator('#manage'); if (!await fold.getAttribute('open')) { if (!await fold.evaluate(e => e.open)) await click(fold.locator('summary')); } await click(page.getByRole('tab', { name: tab, exact: true })); }
async function profile(page, name, selector = 'a.vt-row') { await click(page.locator('a[href="/you"]:visible').first()); await page.locator('.s-balance').waitFor(); await page.locator(selector).filter({ hasText: name }).first().waitFor({ timeout: 90000 }); await snap(page, 'profile-' + page.qaActor + '-' + name); }

try {
  const b = await budget(); assert(b.total + (resume ? 2n : 6n) * 10n ** 22n < cap, `QA stopped before writes: less than ${resume ? '0.02' : '0.06'} NEAR remains in the cumulative budget`); save();
  console.log(`QA preflight: cumulative ${run.budget.totalNEAR.toFixed(6)} NEAR, cap 0.3`);
  const prodDir = join(out, 'production-build'), qaDir = join(out, 'qa-build');
  await command(['--filter', '@hako/sdk', 'build'], 'sdk-build');
  await command(['--filter', '@hako/web', 'test'], 'types');
  const { checkQaSigner } = await import('./check-qa-signer.mjs');
  run.adapterChecks = await checkQaSigner(out); save();
  const common = { VITE_HAKO_CONTRACT: contract, VITE_ANVIL_RPC_URL: '', VITE_SOLANA_RPC_URL: '', VITE_BITCOIN_ESPLORA_URL: '', VITE_QA_SIGNER: '1' };
  await command(['--filter', '@hako/web', 'exec', 'vite', 'build', '--mode', 'production', '--outDir', prodDir, '--emptyOutDir'], 'production-build', common);
  const js = readdirSync(join(prodDir, 'assets')).filter(f => f.endsWith('.js'));
  assert(!js.some(f => /qa-signer/.test(f) || /QA_SIGNER_MODULE|__OTZAR_QA_|setupQaSelector|QA signer/.test(readFileSync(join(prodDir, 'assets', f), 'utf8'))), 'Production bundle contains QA signer');
  run.checks.push('Production mode with VITE_QA_SIGNER=1 excludes the QA module, injection globals and signer strings'); save();
  const webPort = await freePort(); children.push({ port: webPort }); const proxyPort = await freePort(); children.push({ port: proxyPort }); bitcoinPort = await freePort();
  const ownsBitcoin = true;
  start('.tools/bitcoin-31.2/bin/bitcoind', ['-regtest', `-datadir=${root}/.demo/bitcoin`, '-server=1', '-txindex=1', `-rpcport=${bitcoinPort}`, '-listen=0', '-fallbackfee=0.0001', '-printtoconsole=0'], {}, bitcoinPort);
  await waitFor(() => btc('getblockcount').then(() => true), 'Bitcoin Core did not start');
  assert.equal((await btc('getblockchaininfo')).chain, 'regtest');
  const base = `http://127.0.0.1:${webPort}`;
  start('node', ['scripts/bitcoin-proxy.mjs'], { HAKO_WEB_ORIGIN: base, HAKO_BITCOIN_PROXY_PORT: String(proxyPort), HAKO_BITCOIN_RPC_URL: `http://127.0.0.1:${bitcoinPort}/` }, proxyPort);
  await command(['--filter', '@hako/web', 'exec', 'vite', 'build', '--mode', 'qa', '--outDir', qaDir, '--emptyOutDir'], 'qa-build', { ...common, VITE_BITCOIN_ESPLORA_URL: `http://127.0.0.1:${proxyPort}` });
  start('pnpm', ['--filter', '@hako/web', 'exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort', '--outDir', qaDir], {}, webPort);
  await waitFor(() => fetch(base).then(r => r.ok), 'QA preview did not start');
  await checkSwap();
  console.log('Waiting for the shared Chrome lock');
  await withChromeLock(async () => {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
      for (const injection of [{ accountId: 'refuse.near', privateKey: 'invalid', rpcUrl: RPC }, { accountId: ids.seller, privateKey: 'invalid', rpcUrl: 'https://rpc.mainnet.near.org' }]) {
        const ctx = await browser.newContext(); await ctx.addInitScript(data => { window.__OTZAR_QA_SIGNER__ = data; }, injection); const p = await ctx.newPage(); await p.goto(base + '/app'); await p.getByRole('alert').filter({ hasText: 'QA signer requires a .testnet account' }).waitFor(); await ctx.close();
      }
      run.checks.push('Mainnet account and mainnet RPC rejected before signing'); save();
      const seller = await contextFor('seller', base), page = seller.page;
      if (!await view('nft_token', { token_id: run.tokenId })) await mint(page, run.tokenId);
      else { await page.goto(base + '/vault/' + run.tokenId); await page.locator('.s-vhead h1').waitFor(); }
      await snap(page, 'before-register-key');
      const keyPath = resolve(`.near-credentials/${run.tokenId}-pq.json`);
      // An earlier timeout may have registered a key before its temporary download was saved.
      // This unfunded NFT has no signature or call. A self-purchase resets its old key through the real sale UI.
      if ((await view('nft_token', { token_id: run.tokenId })).pq_key && !existsSync(keyPath)) {
        await tools(page, 'Sell'); await page.getByLabel('Price (NEAR)', { exact: true }).fill('0.000001');
        await txClick(page, page.getByRole('button', { name: 'List for sale', exact: true }), 'list');
        await txClick(page, page.getByRole('button', { name: 'Buy this vault', exact: true }), 'buy');
        run.checks.push('Unfunded QA NFT key reset by a 0.000001 NEAR self-purchase after the old download was lost'); save();
      }
      if (!(await view('nft_token', { token_id: run.tokenId })).pq_key) {
        const downloaded = page.waitForEvent('download').then(d => d.saveAs(keyPath));
        await txClick(page, page.getByRole('button', { name: 'Generate and register', exact: true }), 'register_pq_key');
        await downloaded;
      }
      // This is the product's generated ML-DSA backup, kept in the repo's ignored credential directory.
      // The injected NEAR key is never downloaded or written. File upload exercises the real owner flow.
      await page.locator('.keyslot input[type=file]').setInputFiles(keyPath); await page.getByText('Key loaded', { exact: false }).waitFor(); await snap(page, 'key-registered-loaded');
      const wallets = await btc('listwallets'); if (!wallets.includes('hako-miner')) await btc('loadwallet', ['hako-miner']);
      const destination = run.bitcoin?.destination || await btc('getnewaddress', ['qa-browser-return', 'bech32'], 'hako-miner');
      const addrButton = page.getByRole('button', { name: 'Copy Bitcoin deposit address', exact: true }); await addrButton.waitFor(); const address = await addrButton.getAttribute('title'); assert(address?.startsWith('bcrt1'));
      run.bitcoin ||= { address, destination }; assert.equal(run.bitcoin.address, address); save();
      await tools(page, 'Rules');
      if (!await view('btc_state', { token_id: run.tokenId })) {
        await page.getByLabel('Allowlisted regtest address', { exact: true }).fill(destination); await page.getByLabel('Recovery regtest address', { exact: true }).fill(destination);
        await txClick(page, page.getByRole('button', { name: 'Sign and register Bitcoin rules', exact: true }), 'register_btc');
      }
      await snap(page, 'bitcoin-rules-registered');
      if (!run.bitcoin.fundingTx) { run.bitcoin.fundingTx = await btc('sendtoaddress', [address, 0.00101], 'hako-miner'); await btc('generatetoaddress', [1, destination]); save(); }
      await waitFor(async () => (await page.locator('body').innerText()).includes('0.00101000'), 'App did not read the real regtest deposit', 45000); await snap(page, 'funded-vault');
      await tools(page, 'Rounds');
      let current = await view('call_state', { token_id: run.tokenId });
      if (current?.state === 'auction' && current.auction_end_ns / 1e6 <= Date.now()) {
        await txClick(page, page.getByRole('button', { name: 'Close unfilled round', exact: true }), 'close_unfilled_call');
        current = await view('call_state', { token_id: run.tokenId });
      }
      if (!current || ['unfilled', 'lapsed', 'unsettled'].includes(current.state)) {
        const { fetchCoinbaseBtcUsd } = await import('@hako/sdk'); const spot = await fetchCoinbaseBtcUsd(); run.strikeSource = { price: spot.price, source: spot.sourceUrl, time: spot.time }; const strike = String(Math.ceil(Number(spot.price) * 1.25));
        await page.getByLabel('Strike (USD)', { exact: true }).fill(strike); await page.getByLabel('Size (sats)', { exact: true }).fill('100000'); await page.getByLabel('Term (hours)', { exact: true }).fill('0.06'); await page.getByLabel('Opening premium (tUSDC)', { exact: true }).fill('0.001'); await page.getByLabel('Minimum premium (tUSDC)', { exact: true }).fill('0.0005');
        await snap(page, 'covered-call-form'); await txClick(page, page.getByRole('button', { name: 'Sign and write call', exact: true }), 'write_call'); await page.getByText('write_call confirmed on NEAR', { exact: false }).waitFor();
      }
      await snap(page, 'call-written-receipt');
      const buyer = await contextFor('buyer', base); await buyer.page.goto(base + '/vault/' + run.tokenId); await buyer.page.getByRole('button', { name: 'Details', exact: true }).waitFor();
      const bought = await view('call_state', { token_id: run.tokenId });
      if (bought.state === 'auction') {
        const balanceRead = buyer.page.waitForResponse(r => { try { return r.status() === 200 && r.request().postDataJSON()?.params?.method_name === 'ft_balance_of'; } catch { return false; } }, { timeout: 60000 });
        await click(buyer.page.getByRole('button', { name: 'Details', exact: true })); await (await balanceRead).finished(); await buyer.page.waitForTimeout(250);
        await txClick(buyer.page, buyer.page.getByRole('button', { name: 'Buy with tUSDC', exact: true }), 'ft_transfer_call'); await buyer.page.getByText('Premium sent.', { exact: false }).waitFor();
      } else {
        assert.equal(bought.holder, ids.buyer); assert(['sold', 'otm'].includes(bought.state));
        await click(buyer.page.getByRole('button', { name: 'Details', exact: true }));
      }
      await snap(buyer.page, 'buyer-premium-receipt');
      await click(buyer.page.getByRole('button', { name: 'Close', exact: true })); await profile(buyer.page, run.tokenId, '.rt-row');
      // Reuse this repo's empty QA NFT; no foreign assets or authority key are transferred.
      const sale = await view('nft_token', { token_id: prior.tokenId });
      if (sale.owner_id === ids.buyer) {
        await buyer.page.goto(base + '/vault/' + prior.tokenId); await buyer.page.locator('.s-vhead h1').waitFor(); await tools(buyer.page, 'Sell');
        if (!sale.listed_yocto) {
          await buyer.page.getByLabel('Price (NEAR)', { exact: true }).fill('0.001'); await snap(buyer.page, 'nft-sale-form');
          await txClick(buyer.page, buyer.page.getByRole('button', { name: 'List for sale', exact: true }), 'list');
        } else assert.equal(sale.listed_yocto, '1000000000000000000000');
        await buyer.page.locator('.sale-price').waitFor(); await snap(buyer.page, 'nft-listed-receipt');
        await page.goto(base + '/vault/' + prior.tokenId); await page.locator('.s-vhead h1').waitFor(); await connectIfNeeded(page); await tools(page, 'Sell');
        await txClick(page, page.getByRole('button', { name: 'Buy this vault', exact: true }), 'buy'); await page.locator('.sale-price').waitFor({ state: 'detached' }); await snap(page, 'nft-bought-receipt');
      } else assert.equal(sale.owner_id, ids.seller, 'Empty QA sale vault owner changed');
      assert.equal((await view('nft_token', { token_id: prior.tokenId })).owner_id, ids.seller); await profile(page, prior.tokenId);
      await page.goto(base + '/vault/' + run.tokenId); await page.locator('.s-vhead h1').waitFor(); await connectIfNeeded(page); await page.getByText('your vault', { exact: false }).first().waitFor(); await snap(page, 'writer-sold-round');
      const callState = await view('call_state', { token_id: run.tokenId }); assert(['sold', 'otm'].includes(callState.state)); assert.equal(callState.holder, ids.buyer); run.call = { premium: callState.premium_paid_usdc, expiryNs: callState.expiry_ns, strike: callState.strike_usd_e6 }; save();
      if (callState.state === 'sold') {
        console.log('Waiting for the real call expiry and the relayer-signed Coinbase print');
        while (Date.now() < callState.expiry_ns / 1e6 + 1200) await pause(Math.min(10000, callState.expiry_ns / 1e6 + 1200 - Date.now()));
        process.env.NEAR_RPC = 'https://testnet-rpc.intea.rs';
        const { relayPrice } = await import('../scripts/price-relayer.mjs'), { account, call } = await import('../scripts/near-lib.mjs');
        const poster = account('guardian'), owner = account('seller');
        const operatorSend = async (actor, receiver, action) => { const method = action.functionCall.methodName, gas = action.functionCall.gas.toString(), deposit = action.functionCall.deposit.toString(); await guard({ accountId: actor.accountId, receiverId: receiver, methods: [method], gas, deposit }); const r = await actor.signAndSendTransaction({ receiverId: receiver, actions: [action], waitUntil: 'FINAL' }); await receipt({ accountId: actor.accountId, receiverId: receiver, methods: [method], gas, deposit, hash: r.transaction.hash, success: !r.status?.Failure, final: true, source: 'relayer operator script' }); return r; };
        const price = await relayPrice({ send: operatorSend, poster, contractId: contract, notBeforeSec: Math.ceil(callState.expiry_ns / 1e9) });
        assert(BigInt(price.args.price_usd_e6) < BigInt(callState.strike_usd_e6), 'Real price crossed the test strike; refusing to fabricate OTM settlement');
        await operatorSend(owner, contract, call('settle_call', { token_id: run.tokenId, ...price.args }, 60));
      }
      assert.equal((await view('call_state', { token_id: run.tokenId })).state, 'otm');
      await page.reload(); await page.locator('.s-vhead h1').waitFor(); await connectIfNeeded(page); await page.locator('.keyslot input[type=file]').setInputFiles(keyPath);
      await waitFor(async () => (await page.locator('body').innerText()).includes('Expired, BTC kept'), 'App did not show OTM settlement'); await click(page.getByRole('tab', { name: 'Withdraw', exact: true })); await snap(page, 'otm-unlocked');
      await click(page.getByRole('button', { name: 'Withdraw BTC', exact: true })); await page.getByLabel('Destination', { exact: true }).fill(destination); await page.getByLabel(/^Amount \(sats\)/).fill('100000');
      await txClick(page, page.getByRole('button', { name: 'Sign and request spend', exact: true }), 'request_btc_spend'); await page.getByRole('button', { name: 'Sign via NEAR MPC', exact: true }).waitFor(); await snap(page, 'withdrawal-request-receipt');
      await txClick(page, page.getByRole('button', { name: 'Sign via NEAR MPC', exact: true }), 'execute_btc'); await page.getByRole('button', { name: 'Broadcast to Bitcoin Core', exact: true }).waitFor(); await snap(page, 'withdrawal-signature-receipt');
      await click(page.getByRole('button', { name: 'Broadcast to Bitcoin Core', exact: true })); await page.getByText('Bitcoin Core accepted', { exact: false }).waitFor();
      const accepted = await page.getByText('Bitcoin Core accepted', { exact: false }).innerText(), hash = accepted.match(/[a-f0-9]{64}/)?.[0]; assert(hash); await btc('generatetoaddress', [1, destination]); const foreign = await btc('getrawtransaction', [hash, true]); assert(foreign.confirmations > 0); assert(foreign.vout.some(v => v.scriptPubKey.address === destination && Math.round(v.value * 1e8) === 100000)); run.bitcoin.withdrawalTx = hash; run.bitcoin.confirmations = foreign.confirmations; save(); await snap(page, 'bitcoin-broadcast-result');
      await profile(page, run.tokenId); await click(page.getByRole('button', { name: 'Sign out', exact: true })); await page.locator('.s-connect').waitFor(); await snap(page, 'signed-out');
      for (const p of [page, buyer.page]) assert(await p.evaluate(() => [...Object.values(localStorage), ...Object.values(sessionStorage)].every(v => !/ed25519:[1-9A-HJ-NP-Za-km-z]{80,100}/.test(v))), 'Private key found in browser storage');
      run.checks.push('No NEAR private key in localStorage or sessionStorage');
      await seller.ctx.close(); await buyer.ctx.close();
      assert.equal(run.failures.length, 0, 'Browser page error'); run.status = 'PASS'; run.completed = new Date().toISOString(); await budget(); save();
    } catch (e) { for (const [c, ctx] of browser.contexts().entries()) for (const [n, p] of ctx.pages().entries()) await snap(p, `failure-${c}-${n}`).catch(() => {}); throw e; } finally { await browser.close(); browser = undefined; }
  });
  if (ownsBitcoin) await btc('stop');
  console.log(`PASS: ${recordFile}; ${run.steps.length} final NEAR receipts; cumulative ${run.budget.totalNEAR.toFixed(6)} NEAR`);
} catch (e) { run.status = 'FAILED'; run.error = safe(e); save(); console.error('QA browser stopped:', safe(e)); process.exitCode = 1; }
finally { if (browser) await browser.close().catch(() => {}); stopChildren(); }
