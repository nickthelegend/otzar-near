// Screenshot every Otzar v3 route at 1440 and 390 (read-only, no wallet). Records page errors and overflow.
// Usage: node e2e/shots-v3.mjs <baseUrl> <outDir> [route ...]
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { withChromeLock } from '/Volumes/Extreme SSD/Projects/grokbot/orchestration/chrome-lock.mjs';
const [base = 'http://127.0.0.1:5380', out = '/Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/otzar-v3/r1', ...only] = process.argv.slice(2);
const ROUTES = { landing: '/', vaults: '/app', vault: '/vault/call-itm-mw9irlhd', market: '/market', write: '/write', positions: '/positions', activity: '/activity', security: '/security', settings: '/settings', how: '/how', missing: '/vault/no-such-vault' };
mkdirSync(out, { recursive: true });
const report = {};
await withChromeLock(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  try {
    for (const [name, path] of Object.entries(ROUTES)) {
      if (only.length && !only.includes(name)) continue;
      for (const [w, h] of [[1440, 900], [390, 844]]) {
        const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
        const errors = [];
        p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
        await p.goto(base + path, { waitUntil: 'domcontentloaded' });
        await p.waitForTimeout(9000);
        const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        await p.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: true });
        report[`${name}-${w}`] = { overflow, errors };
        console.log(name, w, 'overflow', overflow, 'errors', errors.length);
        await p.close();
      }
    }
  } finally { await b.close(); }
});
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
