/* 浏览器冒烟测试：三端逐页访问，收集 JS 报错并截图（shots/） + 学生下单支付流程 + 预览页 */
const { chromium } = require('playwright-core');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8100';
const CHROMIUM = process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser';
const fs = require('fs');
fs.mkdirSync(__dirname + '/shots', { recursive: true });
const PAGES = {
  student: ['/', '/local', '/local?cat=takeout', '/local/merchant/1', '/local/deal/1', '/local/deal/2', '/errands?type=errand', '/errands?type=express', '/errands/1', '/errands/new?type=express', '/market', '/market/1', '/market/new', '/treehole', '/treehole/1', '/treehole/new', '/ai', '/orders', '/me', '/merchant-apply', '/school'],
  merchant: ['/m', '/m/deals', '/m/deal/new', '/m/deal/1', '/m/verify', '/m/orders', '/m/orders?type=takeout', '/m/shop', '/me'],
  manager: ['/g', '/g/merchants', '/g/calc', '/g/commissions', '/me'],
};
(async () => {
  const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox'] });
  const errors = [];
  for (const [role, paths] of Object.entries(PAGES)) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 693 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('console', (m) => m.type() === 'error' && errors.push(`[${role}] console: ${m.text()}`));
    page.on('pageerror', (e) => errors.push(`[${role}] pageerror: ${e.message}`));
    await page.goto(`${BASE}/app/?as=${role}#${paths[0]}`);
    await page.waitForTimeout(800);
    for (const p of paths) {
      await page.evaluate((h) => (location.hash = h), p);
      await page.waitForTimeout(450);
      const name = `${role}${p.replace(/[\/?=&]/g, '_')}`;
      const text = await page.evaluate(() => document.querySelector('.shell')?.innerText || '');
      if (/加载中…$/.test(text.trim()) || text.includes('页面走丢了')) errors.push(`[${role}] ${p}: 页面异常 -> ${text.slice(0, 80)}`);
      await page.screenshot({ path: `${__dirname}/shots/${name}.png` });
    }
    await ctx.close();
  }
  // 学生购买流程
  const ctx = await browser.newContext({ viewport: { width: 390, height: 693 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[flow] pageerror: ${e.message}`));
  await page.goto(`${BASE}/app/?as=student#/local/deal/1`);
  await page.waitForTimeout(800);
  await page.click('text=提交订单');
  await page.waitForTimeout(600);
  await page.click('text=微信支付');
  await page.waitForTimeout(600);
  const codes = await page.$$eval('.coupon .code', (els) => els.map((e) => e.textContent));
  console.log('flow coupons:', codes);
  await page.screenshot({ path: __dirname + '/shots/flow_paid.png' });
  // 外卖
  await page.evaluate(() => (location.hash = '/local/deal/2'));
  await page.waitForTimeout(600);
  await page.click('.chip >> text=21:00');
  await page.click('text=提交订单');
  await page.waitForTimeout(600);
  await page.click('text=微信支付');
  await page.waitForTimeout(600);
  await page.screenshot({ path: __dirname + '/shots/flow_takeout.png' });
  console.log('takeout:', (await page.innerText('.card')).replace(/\n/g, ' | ').slice(0, 120));
  // 预览页
  const pv = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  pv.on('pageerror', (e) => errors.push(`[preview] pageerror: ${e.message}`));
  await pv.goto(`${BASE}/`);
  await pv.waitForTimeout(1500);
  await pv.screenshot({ path: __dirname + '/shots/preview_student.png' });
  await pv.click('.role[data-role=merchant]');
  await pv.waitForTimeout(1500);
  await pv.screenshot({ path: __dirname + '/shots/preview_merchant.png' });
  console.log('preview route:', await pv.innerText('#route'));
  await browser.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
})().catch((e) => { console.error(e); process.exit(1); });
