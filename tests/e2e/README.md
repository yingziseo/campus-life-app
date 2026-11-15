# 浏览器端到端测试

```bash
cd server && php bin/init-db.php --fresh && bin/serve.sh 8100   # 另开终端
cd tests/e2e && npm install && npm test
```

- `pages.js`：学生 / 商家 / 客户经理三端逐页访问，收集 JS 报错与 404，截图到 `shots/`；跑通团购下单支付、外卖下单、预览页切换身份。
- `flows.js`：券码核销、定价试算（含错误提示）、AI 问答、经理审核商家、发树洞、发代取快递。
- 环境变量：`BASE_URL`（默认 http://127.0.0.1:8100）、`CHROMIUM_PATH`（默认 /usr/bin/chromium-browser）。
