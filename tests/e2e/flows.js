/* 浏览器交互测试：核销、定价试算、百事通、经理审核、发树洞、发跑腿（托管支付）、外卖全链路（拍照送达）、
 * 领券、代取快递拍照送达、二手确认收货、商家购买推荐位、二手传图、树洞举报 */
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
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const okDialog = async () => { const btns = await p.$$('.dialog .db button'); if (btns[1]) await btns[1].click(); await p.waitForTimeout(600); };
  // 拍照上传弹层：选图 → 确认提交
  const photo = async () => {
    await p.waitForSelector('.sheet .pic.add input', { state: 'attached' });
    await p.setInputFiles('.sheet .pic.add input', { name: 'proof.png', mimeType: 'image/png', buffer: png });
    await p.waitForSelector('.sheet .pic img'); await p.click('.sheet button:has-text("确认提交")'); await p.waitForTimeout(800);
  };

  // 商家核销演示券码
  await p.goto(`${BASE}/app/?as=merchant#/m/verify`); await p.waitForTimeout(900);
  const cells = await p.$$('.cell');
  console.log('demo coupons listed:', cells.length);
  if (cells.length) {
    await cells[0].click();
    await p.click('.card.center .btn');
    await p.waitForTimeout(600);
    console.log('verify toast:', await p.innerText('.toast').catch(() => '无'));
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
  await p.click('.action-bar .btn'); await p.waitForTimeout(300); await okDialog();
  console.log('errand hash:', await p.evaluate(() => location.hash));
  await p.screenshot({ path: __dirname + '/shots/errand_detail.png' });

  // 外卖：学生下单 → 商家出餐 → 骑手取餐 → 送达
  await p.goto(`${BASE}/app/?as=student#/local/deal/2`); await p.waitForTimeout(900);
  const slot = await p.$eval('.chip.on', (e) => e.innerText.trim());
  await p.click('text=提交订单'); await p.waitForTimeout(600);
  await p.click('text=微信支付'); await p.waitForTimeout(600);
  const orderHash = await p.evaluate(() => location.hash);
  await p.goto(`${BASE}/app/?as=merchant#/m/orders?type=takeout`); await p.waitForTimeout(900);
  let clicked = 0;
  for (;;) {
    const btn = await p.$('button:has-text("已出餐")');
    if (!btn || clicked > 10) break;
    await btn.click(); clicked++; await p.waitForTimeout(400);
  }
  console.log('merchant ready clicked:', clicked);
  await p.goto(`${BASE}/app/?as=rider#/r`); await p.waitForTimeout(900);
  await p.screenshot({ path: __dirname + '/shots/rider_home.png' });
  await p.click(`.card.tap:has-text("${slot.split(' ').pop()}")`); await p.waitForTimeout(800);
  let picks = 0;
  for (;;) {
    const btn = await p.$('.pickup-head .btn');
    if (!btn || picks > 10) break;
    await btn.click(); picks++; await p.waitForTimeout(600);
    if (await p.$('.seg button.on:has-text("送达")')) break;
  }
  console.log('rider pickup clicks:', picks);
  await p.screenshot({ path: __dirname + '/shots/rider_drop.png' });
  let drops = 0;
  for (;;) {
    const btn = await p.$('.pickup-head .btn');
    if (!btn || drops > 10) break;
    await btn.click(); await p.waitForTimeout(300);
    await photo(); drops++;
  }
  console.log('rider drop groups (photo):', drops, '| proof shown:', !!(await p.$('.proof img')));
  await p.goto(`${BASE}/app/?as=student${orderHash}`); await p.waitForTimeout(900);
  console.log('student takeout status:', await p.innerText('.status-head h2'), '| slot', slot, '| proof:', !!(await p.$('.proof img')), '| ops:', (await p.$$eval('.ops .btn', (e) => e.map((x) => x.innerText))).join('/'));

  // 领券中心抢券
  await p.goto(`${BASE}/app/?as=student#/coupons`); await p.waitForTimeout(900);
  const grab = await p.$('button:has-text("立即抢")');
  if (grab) { await grab.click(); await p.waitForTimeout(700); }
  console.log('claim toast:', await p.innerText('.toast').catch(() => '无'));

  // 代取快递：接单人拍照送达
  await p.goto(`${BASE}/app/?as=student#/errands/6`); await p.waitForTimeout(900);
  await p.click('.action-bar .btn'); await p.waitForTimeout(300); await photo();
  console.log('errand after deliver:', await p.innerText('.status-head h2'), '| proof:', !!(await p.$('.proof img')));

  // 二手：确认收货
  await p.goto(`${BASE}/app/?as=student#/market/orders`); await p.waitForTimeout(900);
  const confirmBtn = await p.$('button:has-text("确认收货")');
  if (confirmBtn) { await confirmBtn.click(); await p.waitForTimeout(300); await okDialog(); }
  console.log('market trade:', (await p.innerText('.page .card')).split('\n').slice(0, 2).join(' '));

  // 商家购买推荐位（第 3 位）
  await p.goto(`${BASE}/app/?as=merchant#/m/promote`); await p.waitForTimeout(900);
  const slots = await p.$$('.slot');
  await slots[5].click(); await p.waitForTimeout(300); // 校园外卖行业第 3 位
  await p.click('.action-bar .btn'); await p.waitForTimeout(300); await okDialog();
  console.log('promo toast:', await p.innerText('.toast').catch(() => '无'));

  // 二手发布带图片
  await p.goto(`${BASE}/app/?as=student#/market/new`); await p.waitForTimeout(800);
  await p.setInputFiles('.pic.add input', { name: 'a.png', mimeType: 'image/png', buffer: png });
  await p.waitForTimeout(1500);
  console.log('uploaded pics:', (await p.$$('.pic img')).length);
  await p.fill('.form textarea', '带图测试台灯');
  const mins = await p.$$('.form input:not([type=file])');
  await mins[0].fill('20'); await mins[2].fill('wx123');
  await p.click('.action-bar .btn'); await p.waitForTimeout(900);
  console.log('market detail has gallery:', !!(await p.$('.gallery img')));

  // 树洞举报
  await p.goto(`${BASE}/app/?as=student#/treehole/2`); await p.waitForTimeout(900);
  await p.click('button:has-text("举报")'); await p.waitForTimeout(300);
  const chips = await p.$$('.sheet .chip');
  await chips[2].click(); await p.waitForTimeout(400);
  console.log('report toast:', await p.innerText('.toast').catch(() => '无'));

  await b.close();
  console.log(errs.length ? 'ERR ' + errs.join('\n') : 'NO PAGE ERRORS');
})();
