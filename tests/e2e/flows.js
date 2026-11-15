/* 浏览器交互测试：核销、定价试算、AI 问答、经理审核、发树洞、发跑腿 */
const { chromium } = require('playwright-core');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8100';
const CHROMIUM = process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser';
const fs = require('fs');
fs.mkdirSync(__dirname + '/shots', { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox'] });
  const errs = [];
  const p = await b.newPage({ viewport: { width: 390, height: 693 } });
  p.on('pageerror', (e) => errs.push(e.message));

  // 商家核销演示券码
  await p.goto(`${BASE}/app/?as=merchant#/m/verify`); await p.waitForTimeout(900);
  const cells = await p.$$('.cell');
  console.log('demo coupons listed:', cells.length);
  if (cells.length) {
    await cells[0].click();
    await p.click('.card.center .btn');
    await p.waitForTimeout(600);
    console.log('history rows:', (await p.$$('.tag.ok')).length);
  }

  // 商品编辑试算
  await p.evaluate(() => (location.hash = '/m/deal/new')); await p.waitForTimeout(500);
  const inputs = await p.$$('.form input[type=number]');
  await inputs[1].fill('20'); await inputs[2].fill('13'); await inputs[3].fill('3'); await inputs[4].fill('1.5');
  await p.waitForTimeout(800);
  console.log('quote:', (await p.innerText('.quote')).replace(/\n/g, ' | '));
  await inputs[4].fill('3'); await p.waitForTimeout(800);
  console.log('quote err:', (await p.innerText('.quote')).replace(/\n/g, ' | '));

  // AI
  await p.goto(`${BASE}/app/?as=student#/ai`); await p.waitForTimeout(900);
  await p.fill('.chat-input input', '外卖几点送'); await p.click('.chat-input .btn'); await p.waitForTimeout(800);
  const msgs = await p.$$eval('.msg', (els) => els.map((e) => e.innerText));
  console.log('ai:', msgs[msgs.length - 1].slice(0, 80));

  // 经理审核
  await p.goto(`${BASE}/app/?as=manager#/g/merchants`); await p.waitForTimeout(900);
  const approveBtn = await p.$('text=审核通过');
  if (approveBtn) {
    await approveBtn.click(); await p.waitForTimeout(300);
    const btns = await p.$$('.dialog .db button');
    await btns[1].click(); await p.waitForTimeout(600);
  }
  console.log('pending left:', (await p.$$('text=审核通过')).length);

  // 学生发树洞、跑腿
  await p.goto(`${BASE}/app/?as=student#/treehole/new`); await p.waitForTimeout(800);
  await p.fill('textarea', '测试：图书馆空调好冷'); await p.click('.action-bar .btn'); await p.waitForTimeout(800);
  console.log('treehole hash:', await p.evaluate(() => location.hash));
  await p.evaluate(() => (location.hash = '/errands/new?type=express')); await p.waitForTimeout(500);
  const ins = await p.$$('.form input');
  await ins[0].fill('取快递'); await ins[1].fill('菜鸟'); await ins[2].fill('1-1-1'); await ins[3].fill('5号楼');
  await p.click('.action-bar .btn'); await p.waitForTimeout(800);
  console.log('errand hash:', await p.evaluate(() => location.hash));
  await p.screenshot({ path: __dirname + '/shots/errand_detail.png' });

  await b.close();
  console.log(errs.length ? 'ERR ' + errs.join('\n') : 'NO PAGE ERRORS');
})();
