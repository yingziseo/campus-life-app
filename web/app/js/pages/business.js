/* 商家端 + 客户经理端 */

/* ---------- 定价试算组件（商家录入商品、客户经理谈判共用） ---------- */
const PricingCalc = {
  props: { modelValue: Object, compact: Boolean },
  emits: ['update:modelValue', 'quote'],
  template: `<div>
      <div class="form">
        <div class="field"><label>定价模式</label><div class="chips" style="justify-content:flex-end;flex:1">
          <span class="chip" :class="{ on: v.pricing_mode === 'voucher' }" @click="v.pricing_mode = 'voucher'">代金券</span>
          <span class="chip" :class="{ on: v.pricing_mode === 'fixed' }" @click="v.pricing_mode = 'fixed'">平台定价</span></div></div>
        <div class="field"><label>美团售价</label><input v-model="v.competitor_price" type="number" placeholder="用户在美团实付"><span class="unit">元</span></div>
        <div class="field"><label>商家到手</label><input v-model="v.merchant_settle" type="number" :placeholder="v.pricing_mode === 'voucher' ? '商家在美团的到手价' : '与商家约定的到手价'"><span class="unit">元</span></div>
        <template v-if="v.pricing_mode === 'voucher'">
          <div class="field"><label>券面额</label><input v-model="v.voucher_face" type="number" placeholder="如 2"><span class="unit">元</span></div>
          <div class="field"><label>券售价</label><input v-model="v.voucher_cost" type="number" placeholder="如 1"><span class="unit">元</span></div>
        </template>
        <div v-else class="field"><label>平台售价</label><input v-model="v.sale_price" type="number" placeholder="用户实付"><span class="unit">元</span></div>
      </div>
      <div class="hint" v-if="!compact">{{ v.pricing_mode === 'voucher' ? '代金券模式：商家到手不变，平台卖"1 元抵 2 元"券，用户实付 = 到手价 + 券售价' : '平台定价模式：压缩商家到手价换取渠道销量，售价须比美团至少便宜 1 元' }}</div>
      <div class="card">
        <div class="card-title">试算结果</div>
        <div v-if="err" class="quote"><span class="err">⚠️ {{ err }}</span></div>
        <div v-else-if="!q" class="quote muted">填写价格后实时试算</div>
        <div v-else class="quote">
          <div class="line"><span>用户实付</span><b class="price" style="font-size:18px">¥{{ yuan(q.sale_price) }}</b></div>
          <div class="line"><span>比美团省</span><b style="color:var(--save)">¥{{ yuan(q.user_saving) }}</b></div>
          <div class="line" v-if="q.pricing_mode === 'voucher'"><span>到店标价</span><b>¥{{ yuan(q.list_price) }}</b></div>
          <div class="flow">
            <i :style="{ width: w(q.merchant_settle), background: '#36c28a' }"></i>
            <i :style="{ width: w(q.manager_commission), background: '#7048e8' }"></i>
            <i :style="{ width: w(q.platform_margin), background: '#ff6a2b' }"></i>
          </div>
          <div class="line"><span><span style="color:#36c28a">●</span> 商家到手（美团价的 {{ pct(q.merchant_ratio) }}）</span><b>¥{{ yuan(q.merchant_settle) }}</b></div>
          <div class="line"><span><span style="color:#7048e8">●</span> 客户经理佣金</span><b>¥{{ yuan(q.manager_commission) }}</b></div>
          <div class="line"><span><span style="color:#ff6a2b">●</span> 平台留存</span><b>¥{{ yuan(q.platform_margin) }}</b></div>
        </div>
      </div>
    </div>`,
  setup(props, { emit }) {
    const v = reactive(props.modelValue);
    const q = ref(null), err = ref('');
    let timer = null;
    const ready = () => v.competitor_price && v.merchant_settle && (v.pricing_mode === 'voucher' ? v.voucher_face && v.voucher_cost : v.sale_price);
    async function calc() {
      if (!ready()) { q.value = null; err.value = ''; emit('quote', null); return; }
      try { q.value = await post('/merchant/quote', v, { silent: true }); err.value = ''; emit('quote', q.value); }
      catch (e) { q.value = null; err.value = e.message; emit('quote', null); }
    }
    watch(v, () => { clearTimeout(timer); timer = setTimeout(calc, 250); emit('update:modelValue', v); }, { deep: true });
    onMounted(calc);
    const w = (x) => (q.value ? Math.max(0, (x / q.value.sale_price) * 100) + '%' : '0');
    return { v, q, err, w };
  },
};

/* ================= 商家端 ================= */
const MerchantGate = {
  props: { m: Object },
  template: `<div v-if="!m" class="pad"><Empty text="你还没有提交入驻申请" icon="🏪"><button class="btn mt12" @click="go('/merchant-apply')">立即入驻</button></Empty></div>
    <div v-else-if="m.status !== 'approved'" class="card center" style="margin-top:12px;padding:28px 16px">
      <div style="font-size:44px">{{ m.status === 'pending' ? '⏳' : '❌' }}</div>
      <h3 style="margin:8px 0 4px">{{ m.status === 'pending' ? '入驻审核中' : '入驻申请未通过' }}</h3>
      <div class="muted">{{ m.has_manager ? '对接客户经理：' + m.manager_name + '，审核通过后即可上架商品' : '平台审核中，预计 1 个工作日' }}</div>
      <div class="muted mt8">审核期间可以先去「商品」录入，通过后自动对学生可见</div>
    </div>`,
};

defineRoute('/m', {
  components: { MerchantGate },
  template: `<NavBar :title="d?.merchant?.name || '商家工作台'" />
    <div class="page with-bar">
      <div v-if="loading && !d" class="loading">加载中…</div>
      <MerchantGate v-else-if="!d || d.merchant.status !== 'approved'" :m="d?.merchant" />
      <template v-else>
        <div class="hero-card">
          <div class="row between"><span style="opacity:.8">今日收入（元）</span><span class="tag" style="background:rgba(255,255,255,.2);color:#fff">{{ d.merchant.has_manager ? '客户经理：' + d.merchant.manager_name : '平台直营' }}</span></div>
          <div class="big">{{ yuan(d.today_income) }}</div>
          <div class="stats mt12">
            <div class="stat"><b>{{ d.today_orders }}</b><span>今日订单</span></div>
            <div class="stat"><b>{{ d.unused_coupons }}</b><span>待核销券</span></div>
            <div class="stat"><b>{{ yuan(d.total_income) }}</b><span>累计收入</span></div>
          </div>
        </div>
        <div class="card" style="padding:4px 0"><div class="grid4">
          <div class="entry" @click="go('/m/verify')"><div class="ico" style="background:var(--primary-soft)">📷</div>扫码核销</div>
          <div class="entry" @click="go('/m/deal/new')"><div class="ico" style="background:#eafaf0">➕</div>上架商品</div>
          <div class="entry" @click="go('/m/orders?type=takeout')"><div class="ico" style="background:#e9f7ff">🛵</div>外卖备餐</div>
          <div class="entry" @click="go('/m/shop')"><div class="ico" style="background:#fff6e0">⚙️</div>店铺设置</div>
        </div></div>
        <div class="section-title">外卖备餐汇总 <small>按送餐时间点</small></div>
        <Empty v-if="!d.takeout_slots.length" :text="d.merchant.takeout_enabled ? '暂无待配送外卖' : '未开通校园外卖'" icon="🛵" />
        <div class="card flush" v-else>
          <div v-for="s in d.takeout_slots" :key="s.delivery_date + s.delivery_slot" class="cell" @click="go('/m/orders?type=takeout')">
            <Icon name="clock" :size="18" /><span class="grow"><b>{{ s.delivery_date === today ? '今天' : s.delivery_date.slice(5) }} {{ s.delivery_slot }}</b> <span class="muted">送达</span></span>
            <span>{{ s.orders }} 单 / {{ s.items }} 份</span><Icon name="right" :size="14" class="arrow" />
          </div>
        </div>
        <div class="notice">💡 原型阶段由商家端推进外卖"配送中 / 已送达"，v0.3 起由骑手端完成</div>
      </template>
    </div>`,
  setup() {
    const { data: d, loading } = useLoad(async () => {
      try { return await api('/merchant/dashboard', { silent: true }); }
      catch (e) { if (e.code === 412) return null; throw e; }
    });
    return { d, loading, today: todayStr() };
  },
}, { tab: 'm-home', role: 'merchant' });

defineRoute('/m/deals', {
  template: `<NavBar title="商品管理" />
    <div class="page with-bar" style="padding-top:12px">
      <Empty v-if="data && !data.length" text="还没有商品" icon="🛍️"><button class="btn mt12" @click="go('/m/deal/new')">上架第一个商品</button></Empty>
      <div v-for="d in data" :key="d.id" class="card" :style="{ opacity: d.status === 'on' ? 1 : .6 }">
        <div class="row between"><b class="ellipsis grow">{{ d.title }}</b><span class="tag" :class="d.status === 'on' ? 'ok' : ''">{{ d.status === 'on' ? '在售' : '已下架' }}</span></div>
        <div class="row mt8" style="gap:6px"><span class="tag primary">{{ d.type === 'takeout' ? '校园外卖' : '到店团购' }}</span><span class="tag">{{ d.pricing_mode === 'voucher' ? '代金券模式' : '平台定价' }}</span><span class="muted">已售 {{ d.sold }} · 库存 {{ d.stock }}</span></div>
        <div class="quote mt8">
          <div class="line"><span>用户实付 / 美团价</span><b>¥{{ yuan(d.sale_price) }} / ¥{{ yuan(d.competitor_price) }}</b></div>
          <div class="line"><span>我的到手</span><b style="color:var(--ok)">¥{{ yuan(d.merchant_settle) }}</b></div>
        </div>
        <div class="row mt8" style="justify-content:flex-end"><button class="btn sm line" @click="toggle(d)">{{ d.status === 'on' ? '下架' : '上架' }}</button><button class="btn sm ghost" @click="go('/m/deal/' + d.id)">编辑</button></div>
      </div>
    </div>
    <div class="action-bar" style="bottom:var(--tab-h)"><button class="btn block" @click="go('/m/deal/new')">+ 上架商品</button></div>`,
  setup() {
    const { data } = useLoad(async () => { try { return await api('/merchant/deals', { silent: true }); } catch (e) { return []; } });
    return { data, async toggle(d) { try { const r = await post(`/merchant/deals/${d.id}/toggle`); d.status = r.status; toast(r.status === 'on' ? '已上架' : '已下架'); } catch (e) {} } };
  },
}, { tab: 'm-deals', role: 'merchant' });

const DealEditor = {
  components: { PricingCalc },
  template: `<NavBar :title="id ? '编辑商品' : '上架商品'" back="/m/deals" />
    <div class="page" style="padding-top:12px;padding-bottom:90px" v-if="ready">
      <div class="form">
        <div class="field"><label>类型</label><div class="chips" style="justify-content:flex-end;flex:1">
          <span class="chip" :class="{ on: f.type === 'groupbuy' }" @click="f.type = 'groupbuy'">到店团购</span>
          <span class="chip" :class="{ on: f.type === 'takeout' }" @click="f.type = 'takeout'">校园外卖</span></div></div>
        <div class="field"><label>商品名称</label><input v-model="f.title" placeholder="如：招牌黄焖鸡 单人餐"></div>
        <div class="field"><label>库存</label><input v-model="f.stock" type="number"></div>
        <div class="field col"><label>描述</label><textarea v-model="f.description" placeholder="套餐内容、使用时间等" style="min-height:50px"></textarea></div>
      </div>
      <PricingCalc v-model="pricing" @quote="q = $event" />
    </div>
    <div class="action-bar"><button class="btn block" :disabled="!q || !f.title || busy" @click="save">{{ id ? '保存' : '确认上架' }}</button></div>`,
  setup() {
    const id = store.route.params.id;
    const f = reactive({ type: 'groupbuy', title: '', stock: 999, description: '' });
    const pricing = reactive({ pricing_mode: 'voucher', competitor_price: '', merchant_settle: '', voucher_face: '', voucher_cost: '', sale_price: '' });
    const q = ref(null), busy = ref(false), ready = ref(!id);
    onMounted(async () => {
      if (!id) return;
      const d = (await api('/merchant/deals')).find((x) => String(x.id) === id);
      if (!d) return go('/m/deals', true);
      Object.assign(f, { type: d.type, title: d.title, stock: d.stock, description: d.description || '' });
      const y = (c) => (c == null ? '' : c / 100);
      Object.assign(pricing, { pricing_mode: d.pricing_mode, competitor_price: y(d.competitor_price), merchant_settle: y(d.merchant_settle), voucher_face: y(d.voucher_face), voucher_cost: y(d.voucher_cost), sale_price: y(d.sale_price) });
      ready.value = true;
    });
    return {
      id, f, pricing, q, busy, ready,
      async save() {
        busy.value = true;
        try { await post(id ? '/merchant/deals/' + id : '/merchant/deals', { ...f, ...pricing }); toast(id ? '已保存' : '上架成功'); go('/m/deals', true); }
        catch (e) {} finally { busy.value = false; }
      },
    };
  },
};
defineRoute('/m/deal/new', DealEditor, { role: 'merchant' });
defineRoute('/m/deal/:id', DealEditor, { role: 'merchant' });

defineRoute('/m/verify', {
  template: `<NavBar title="券码核销" />
    <div class="page with-bar">
      <div class="card center" style="margin-top:12px;padding:28px 16px">
        <div style="font-size:56px">📷</div>
        <div class="muted">正式版支持扫码核销，原型请手动输入 12 位券码</div>
        <input v-model="code" inputmode="numeric" maxlength="16" placeholder="输入券码" style="margin-top:16px;width:100%;height:50px;border-radius:12px;border:2px solid var(--line);text-align:center;font-size:22px;letter-spacing:3px;outline:0" @keyup.enter="verify">
        <button class="btn block mt12" :disabled="code.replace(/\\D/g, '').length < 12 || busy" @click="verify">核销</button>
      </div>
      <div class="section-title" v-if="pending.length">演示辅助 · 学生待使用券码 <small>点击填入，正式版不显示</small></div>
      <div class="card flush" v-if="pending.length">
        <div v-for="p in pending" :key="p.code" class="cell" @click="code = p.code"><span class="grow">{{ p.title }}<div class="muted">{{ p.nickname }}</div></span><b style="letter-spacing:1px">{{ p.code }}</b></div>
      </div>
      <div class="section-title" v-if="history.length">本次核销</div>
      <div class="card flush" v-if="history.length">
        <div v-for="h in history" :key="h.code" class="cell"><span class="tag ok">成功</span><span class="grow">{{ h.title }}</span><span class="muted">{{ h.code }}</span></div>
      </div>
    </div>`,
  setup() {
    const code = ref(''), busy = ref(false), history = ref([]), pending = ref([]);
    async function loadPending() {
      // 演示辅助：仅 dev 环境返回本店待核销券码，正式版商家只能通过扫码/手输获取
      try { pending.value = await api('/dev/coupons', { silent: true }); } catch (e) { pending.value = []; }
    }
    onMounted(loadPending);
    return {
      code, busy, history, pending,
      async verify() {
        busy.value = true;
        try {
          const r = await post('/merchant/verify', { code: code.value });
          history.value.unshift({ code: r.coupon_code, title: r.order.title });
          toast('核销成功 · ' + r.order.title); code.value = ''; loadPending();
        } catch (e) {} finally { busy.value = false; }
      },
    };
  },
}, { tab: 'm-verify', role: 'merchant' });

defineRoute('/m/orders', {
  template: `<NavBar title="订单" />
    <div class="seg"><button v-for="t in tabs" :key="t.v" :class="{ on: type === t.v }" @click="type = t.v">{{ t.t }}</button></div>
    <div class="page with-bar">
      <div v-if="loading && !data" class="loading">加载中…</div>
      <Empty v-else-if="!data?.length" text="暂无订单" icon="🧾" />
      <template v-for="g in grouped" :key="g.key">
        <div class="section-title" v-if="g.key">{{ g.key }} <small>{{ g.items.length }} 单</small></div>
        <div v-for="o in g.items" :key="o.id" class="card">
          <div class="row between"><b class="ellipsis grow">{{ o.title }} × {{ o.quantity }}</b><span :class="statusCls('order', o.status)">{{ orderStatus(o) }}</span></div>
          <div class="muted mt8">{{ o.nickname }} · {{ o.contact_phone }} · {{ shortTime(o.paid_at) }}</div>
          <div class="muted" v-if="o.type === 'takeout'">送至 {{ o.delivery_point }}<template v-if="o.remark"> · 备注：{{ o.remark }}</template></div>
          <div class="row between mt8"><span>到手 <b style="color:var(--ok)">¥{{ yuan(o.merchant_amount) }}</b></span>
            <button v-if="o.type === 'takeout' && ['paid', 'delivering'].includes(o.status)" class="btn sm" @click="advance(o)">{{ o.status === 'paid' ? '已出餐，开始配送' : '确认送达' }}</button></div>
        </div>
      </template>
    </div>`,
  setup() {
    const type = ref(store.route.query.type || '');
    const tabs = [{ v: '', t: '全部' }, { v: 'takeout', t: '校园外卖' }, { v: 'groupbuy', t: '到店团购' }];
    const { data, loading, load } = useLoad(async () => { try { return await api('/merchant/orders', { query: { type: type.value }, silent: true }); } catch (e) { return []; } });
    watch(type, () => load());
    const grouped = computed(() => {
      if (type.value !== 'takeout') return [{ key: '', items: data.value || [] }];
      const map = {};
      (data.value || []).forEach((o) => { const k = `${o.delivery_date === todayStr() ? '今天' : o.delivery_date} ${o.delivery_slot} 批次`; (map[k] = map[k] || []).push(o); });
      return Object.entries(map).map(([key, items]) => ({ key, items }));
    });
    return {
      type, tabs, data, loading, grouped,
      async advance(o) { try { const r = await post(`/merchant/orders/${o.id}/advance`); o.status = r.status; toast(r.status === 'completed' ? '已送达，货款已结算' : '配送中'); } catch (e) {} },
    };
  },
}, { tab: 'm-orders', role: 'merchant' });

defineRoute('/m/shop', {
  template: `<NavBar title="店铺设置" back="/m" />
    <div class="page" style="padding-top:12px;padding-bottom:90px" v-if="m">
      <div class="card">
        <div class="row between"><b style="font-size:16px">{{ m.name }}</b><span :class="statusCls('merchant', m.status)">{{ statusText('merchant', m.status) }}</span></div>
        <div class="muted">{{ catOf(m.category).name }} · {{ m.address }}</div>
        <div class="muted" v-if="m.has_manager">对接客户经理：{{ m.manager_name }}</div>
      </div>
      <div class="form">
        <div class="field"><label>联系电话</label><input v-model="m.phone"></div>
        <div class="field"><label>校园外卖</label><span class="grow muted" style="text-align:right">固定时间点集中配送</span>
          <button class="switch" :class="{ on: m.takeout_enabled }" @click="m.takeout_enabled = m.takeout_enabled ? 0 : 1"></button></div>
        <div class="field col"><label>店铺简介</label><textarea v-model="m.intro"></textarea></div>
      </div>
    </div>
    <div class="action-bar" v-if="m"><button class="btn block" @click="save">保存</button></div>`,
  setup() {
    const { data: m } = useLoad(() => api('/merchant/profile'));
    return { m, async save() { try { m.value = await post('/merchant/profile', m.value); toast('已保存'); } catch (e) {} } };
  },
}, { role: 'merchant' });

/* ================= 客户经理端 ================= */
defineRoute('/g', {
  template: `<NavBar title="客户经理" />
    <div class="page with-bar" v-if="d">
      <div class="hero-card">
        <div style="opacity:.8">我的专属邀请码</div>
        <div class="row between"><div class="invite-code">{{ d.invite_code }}</div><button class="btn sm" style="background:rgba(255,255,255,.22)" @click="copy">复制邀请话术</button></div>
        <div style="opacity:.8;font-size:12px">商家入驻时填写此码，即永久绑定为你的推广商家</div>
      </div>
      <div class="card">
        <div class="card-title">佣金收入（元）</div>
        <div class="stats">
          <div class="stat"><b style="color:var(--primary)">{{ yuan(d.commission_today) }}</b><span>今日</span></div>
          <div class="stat"><b>{{ yuan(d.commission_month) }}</b><span>本月</span></div>
          <div class="stat"><b>{{ yuan(d.commission_total) }}</b><span>累计</span></div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">推广成果</div>
        <div class="stats">
          <div class="stat"><b>{{ d.merchant_counts.approved }}</b><span>已入驻商家</span></div>
          <div class="stat"><b>{{ d.order_count }}</b><span>带来订单</span></div>
          <div class="stat"><b>{{ yuan(d.gmv) }}</b><span>交易额</span></div>
        </div>
      </div>
      <div class="card row" v-if="d.merchant_counts.pending" style="cursor:pointer" @click="go('/g/merchants')">
        <span style="font-size:22px">⏳</span><span class="grow"><b>{{ d.merchant_counts.pending }} 家商家待你审核</b></span><Icon name="right" :size="14" class="muted"/>
      </div>
      <div class="card row" style="cursor:pointer" @click="go('/g/calc')">
        <span style="font-size:22px">🧮</span><span class="grow"><b>定价试算</b><div class="muted">谈商家时现场算给老板看：他到手多少、学生省多少</div></span><Icon name="right" :size="14" class="muted"/>
      </div>
    </div>`,
  setup() {
    const { data: d } = useLoad(() => api('/manager/dashboard'));
    return {
      d,
      async copy() {
        const text = `老板您好！我们是「校园生活」平台，专注服务 ${store.user.school?.name || '本校'} 学生，抽佣远低于外卖平台，还有校园外卖团队集中配送。入驻时填写邀请码 ${d.value.invite_code}，我来全程帮您运营～`;
        try { await navigator.clipboard.writeText(text); toast('已复制邀请话术'); } catch (e) { confirmBox('邀请话术', text, '好的', '关闭'); }
      },
    };
  },
}, { tab: 'g-home', role: 'manager' });

defineRoute('/g/merchants', {
  template: `<NavBar title="我的商家" />
    <div class="page with-bar" style="padding-top:12px">
      <Empty v-if="data && !data.length" text="还没有绑定商家，把邀请码发给老板吧" icon="🤝" />
      <div v-for="m in data" :key="m.id" class="card">
        <div class="row"><div class="thumb sm" :style="{ background: catOf(m.category).bg }">{{ catOf(m.category).emoji }}</div>
          <div class="grow"><div class="row between"><b class="ellipsis">{{ m.name }}</b><span :class="statusCls('merchant', m.status)">{{ statusText('merchant', m.status) }}</span></div>
            <div class="muted ellipsis">{{ m.address }} · {{ m.phone }}</div></div></div>
        <div class="quote mt8" v-if="m.status === 'approved'">
          <div class="line"><span>累计订单</span><b>{{ m.orders }}</b></div>
          <div class="line"><span>为我带来佣金</span><b style="color:var(--primary)">¥{{ yuan(m.commission) }}</b></div>
        </div>
        <div class="row mt8" v-if="m.status === 'pending'" style="justify-content:flex-end">
          <span class="muted grow">申请于 {{ shortTime(m.created_at) }}</span>
          <button class="btn sm line" @click="review(m, 'reject')">驳回</button><button class="btn sm" @click="review(m, 'approve')">审核通过</button></div>
      </div>
    </div>`,
  setup() {
    const { data } = useLoad(() => api('/manager/merchants'));
    return {
      data,
      async review(m, action) {
        if (!(await confirmBox(action === 'approve' ? `通过「${m.name}」的入驻申请？` : `驳回「${m.name}」？`))) return;
        try { const r = await post(`/manager/merchants/${m.id}/${action}`); m.status = r.status; toast('已处理'); } catch (e) {}
      },
    };
  },
}, { tab: 'g-merchants', role: 'manager' });

defineRoute('/g/calc', {
  components: { PricingCalc },
  template: `<NavBar title="定价试算" />
    <div class="page with-bar" style="padding-top:12px">
      <PricingCalc v-model="v" />
      <div class="card"><div class="card-title">谈判要点</div>
        <div class="ink2" style="font-size:13px">· <b>代金券模式</b>：老板到手和美团一样，多一个渠道白赚客流<br>· <b>平台定价</b>：老板少赚一点，换学生集中下单的稳定销量<br>· 学生端每个商品都显示"比美团省 X 元"，一两块也能形成习惯</div></div>
    </div>`,
  setup() { return { v: reactive({ pricing_mode: 'voucher', competitor_price: 15, merchant_settle: 10.5, voucher_face: 2, voucher_cost: 1, sale_price: 12 }) }; },
}, { tab: 'g-calc', role: 'manager' });

defineRoute('/g/commissions', {
  template: `<NavBar title="佣金明细" />
    <div class="page with-bar" style="padding-top:12px">
      <Empty v-if="data && !data.length" text="还没有佣金，商家出单后自动入账" icon="💰" />
      <div class="card flush" v-else>
        <div v-for="l in data" :key="l.id" class="list-item" style="cursor:default">
          <div class="grow"><b class="ellipsis" style="display:block">{{ l.merchant_name }}</b><div class="muted ellipsis">{{ l.remark }}</div><div class="muted">{{ shortTime(l.created_at) }}</div></div>
          <b style="color:var(--primary);font-size:16px">+{{ yuan(l.amount) }}</b>
        </div>
      </div>
      <p class="muted center">佣金在券码核销 / 外卖送达时实时入账 · 提现功能 v0.3 上线</p>
    </div>`,
  setup() { const { data } = useLoad(() => api('/manager/commissions')); return { data }; },
}, { tab: 'g-commissions', role: 'manager' });
