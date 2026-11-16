/* 平台管理后台 · 单页应用（Vue 3，无构建） */
const { createApp, reactive, ref, computed, watch, onMounted } = Vue;

const S = reactive({ token: get('admin_token'), user: null, toast: '', page: location.hash.slice(2) || 'dashboard', schools: [], todo: {}, img: '' });
function get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function set(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} }
let tt;
const toast = (m) => { S.toast = m; clearTimeout(tt); tt = setTimeout(() => (S.toast = ''), 2000); };
const yuan = (c) => (c == null || c === '' ? '-' : (Number(c) / 100).toFixed(2).replace(/\.?0+$/, ''));
const money = (c) => '¥' + Number((Number(c || 0) / 100).toFixed(2)).toLocaleString('zh-CN');

async function api(path, { method = 'GET', body, query } = {}) {
  let url = '/api/admin' + path;
  if (path.startsWith('/api/')) url = path;
  if (query) { const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null)).toString(); if (qs) url += '?' + qs; }
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + S.token }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({ code: -1, msg: '网络错误' }));
  if (json.code === 0) return json.data;
  if (json.code === 401 || json.code === 403) { S.user = null; set('admin_token', ''); S.token = ''; }
  toast(json.msg || '请求失败');
  throw new Error(json.msg);
}
const post = (p, b) => api(p, { method: 'POST', body: b || {} });
function useList(loader, deps = []) {
  const rows = ref(null);
  const load = async () => { try { rows.value = await loader(); } catch (e) { rows.value = rows.value || []; } };
  onMounted(load);
  deps.forEach((d) => watch(d, load, { deep: true }));
  return { rows, load };
}
async function refreshTodo() { try { S.todo = (await api('/dashboard')).todo; } catch (e) {} }

const CAT = { food: '餐饮', netcafe: '网吧', billiards: '台球', homestay: '民宿', ktv: 'KTV', other: '其他' };
const ROLE = { student: '学生', merchant: '商家', manager: '客户经理', admin: '管理员' };
const ORDER = { pending_pay: '待支付', paid: '已支付', ready: '已出餐', delivering: '配送中', completed: '已完成', cancelled: '已取消', refunded: '已退款' };
const PARTY = { merchant: '商家结算', manager: '客户经理佣金', platform: '平台收入', rider: '骑手提成', student: '学生收入' };
const KIND = { settle: '结算', commission: '佣金', margin: '商品差价', delivery: '配送', subsidy: '优惠券补贴', errand_reward: '跑腿赏金', errand_fee: '跑腿服务费', market_sale: '二手货款', market_fee: '二手服务费', ad: '推荐位广告' };
const SOURCE = { order: '本地生活', errand: '跑腿', market: '二手', promotion: '推荐位' };
const PCAT = { food: '美食', takeout: '校园外卖', netcafe: '网吧', billiards: '台球', homestay: '民宿', ktv: 'KTV', other: '其他' };
const PSTATUS = { pending: ['待审核', 'warn'], active: ['投放中', 'ok'], rejected: ['已驳回', 'bad'], ended: ['已结束', ''] };
const SCOPE = { all: '全场通用', takeout: '校园外卖', groupbuy: '到店团购' };
const pct = (r) => Math.round(Number(r || 0) * 1000) / 10 + '%';
const G = { yuan, money, pct, CAT, ROLE, ORDER, PARTY, KIND, SOURCE, PCAT, PSTATUS, SCOPE, S };

/* Lucide 线性图标（与小程序端共用 /shared/icons.js） */
const Icon = {
  props: { name: String, size: { type: [Number, String], default: 18 }, stroke: { type: [Number, String], default: 1.8 } },
  template: `<svg class="i" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" :stroke-width="stroke" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="ICONS[name] || ''"></svg>`,
  setup() { return { ICONS }; },
};

/* ---------------- 柱状图（单系列） ---------------- */
const BarChart = {
  props: { data: Array, field: String, label: String, fmt: { type: Function, default: (v) => v } },
  template: `<div class="chart" @mouseleave="hover = -1">
      <svg :viewBox="'0 0 ' + W + ' ' + H" role="img" :aria-label="label">
        <g v-for="t in ticks" :key="t"><line class="grid-line" x1="36" :x2="W" :y1="y(t)" :y2="y(t)" /><text class="axis-label" x="30" :y="y(t) + 4" text-anchor="end">{{ short(t) }}</text></g>
        <g v-for="(d, i) in data" :key="d.day">
          <rect class="hit" :x="x(i)" y="0" :width="step" :height="H - 20" @mouseenter="hover = i" />
          <path class="bar" :class="{ active: hover === i }" :d="bar(i, d[field])" />
          <text class="axis-label" :x="x(i) + step / 2" :y="H - 4" text-anchor="middle">{{ d.day.slice(5) }}</text>
        </g>
      </svg>
      <div v-if="hover >= 0" class="tip" :style="{ left: ((x(hover) + step / 2) / W * 100) + '%', top: (y(data[hover][field]) / H * 100) + '%' }">
        {{ data[hover].day }} · {{ label }} <b>{{ fmt(data[hover][field]) }}</b></div>
    </div>`,
  setup(props) {
    const W = 560, H = 200, top = 10, bottom = 20, left = 36;
    const hover = ref(-1);
    const max = computed(() => { const m = Math.max(1, ...props.data.map((d) => Number(d[props.field]) || 0)); const p = Math.pow(10, Math.floor(Math.log10(m))); return Math.ceil(m / p) * p; });
    const ticks = computed(() => [0, max.value / 2, max.value]);
    const step = computed(() => (W - left) / props.data.length);
    const x = (i) => left + i * step.value;
    const y = (v) => top + (H - top - bottom) * (1 - (Number(v) || 0) / max.value);
    const bar = (i, v) => {
      const bw = Math.min(28, step.value * 0.5), bx = x(i) + (step.value - bw) / 2, by = y(v), base = H - bottom, r = Math.min(4, (base - by) / 2);
      if (base - by < 0.5) return `M${bx},${base}h${bw}`;
      return `M${bx},${base}V${by + r}q0,-${r} ${r},-${r}h${bw - 2 * r}q${r},0 ${r},${r}V${base}Z`;
    };
    const short = (t) => (props.field === 'gmv' ? (t >= 100000 ? t / 100000 + 'k' : t / 100) : t);
    return { W, H, hover, ticks, step, x, y, bar, short };
  },
};

/* ---------------- 页面 ---------------- */
const Dashboard = {
  components: { BarChart },
  template: `<div v-if="d">
    <div class="kpis">
      <div class="kpi"><span><Icon name="trend" :size="15" />交易额 GMV</span><b>{{ money(d.totals.gmv) }}</b><small>{{ d.totals.orders }} 笔本地生活订单</small></div>
      <div class="kpi hl" @click="go('revenue')"><span><Icon name="landmark" :size="15" />平台净收入</span><b>{{ money(d.totals.platform_income) }}</b><small>6 项来源，点击看收益分配</small></div>
      <div class="kpi"><span><Icon name="piggy" :size="15" />学生累计省下</span><b>{{ money(d.totals.user_saved) }}</b><small>对比竞品平台 + 优惠券</small></div>
      <div class="kpi"><span><Icon name="handshake" :size="15" />客户经理佣金</span><b>{{ money(d.totals.manager_income) }}</b><small>骑手提成 {{ money(d.totals.rider_income) }}</small></div>
      <div class="kpi"><span><Icon name="store" :size="15" />商家结算</span><b>{{ money(d.totals.merchant_income) }}</b><small>{{ d.totals.merchants }} 家已入驻</small></div>
      <div class="kpi"><span><Icon name="users" :size="15" />学生用户</span><b>{{ d.totals.students }}</b><small>学生收入 {{ money(d.totals.student_income) }}</small></div>
    </div>
    <div class="grid g3">
      <div class="card"><h3>近 7 天订单数 <small>笔</small><span style="margin-left:auto"><button class="btn line sm" @click="table = !table">{{ table ? '图表' : '表格' }}</button></span></h3>
        <BarChart v-if="!table" :data="d.daily" field="orders" label="订单" />
        <table v-else><tr><th>日期</th><th class="num">订单</th><th class="num">GMV</th><th class="num">学生省下</th></tr>
          <tr v-for="r in d.daily" :key="r.day"><td>{{ r.day }}</td><td class="num">{{ r.orders }}</td><td class="num">{{ money(r.gmv) }}</td><td class="num">{{ money(r.saved) }}</td></tr></table>
      </div>
      <div class="card"><h3>近 7 天交易额 <small>元</small></h3><BarChart :data="d.daily" field="gmv" label="交易额" :fmt="money" /></div>
      <div class="card"><h3>待办事项</h3>
        <div v-for="t in todos" :key="t.k" class="todo" @click="go(t.page)"><span class="todo-ico"><Icon :name="t.i" :size="16" /></span>{{ t.t }}<b :class="{ zero: !d.todo[t.k] }">{{ d.todo[t.k] }}</b></div>
      </div>
    </div>
    <div class="card"><h3>平台收入构成 <small>已结算流水，优惠券补贴为平台出资（负数）</small><span style="margin-left:auto"><button class="btn line sm" @click="go('revenue')">收益分配详情</button></span></h3>
      <div class="hbars"><div v-for="r in d.income" :key="r.kind" class="hbar">
        <span class="hb-label">{{ r.title }}</span>
        <span class="hb-track"><i :class="{ neg: r.amount < 0 }" :style="{ width: (Math.abs(r.amount) / incomeMax * 100) + '%' }"></i></span>
        <b class="hb-val" :class="{ neg: r.amount < 0 }">{{ r.amount < 0 ? '-' : '' }}{{ money(Math.abs(r.amount)) }}</b></div></div>
    </div>
    <div class="card"><h3>各学校经营情况</h3>
      <table><tr><th>学校</th><th>状态</th><th class="num">学生</th><th class="num">入驻商家</th><th class="num">订单</th><th class="num">GMV</th></tr>
        <tr v-for="s in d.schools" :key="s.id"><td>{{ s.name }} <span v-if="s.is_pilot" class="tag primary">试点</span></td>
          <td><span class="tag" :class="s.status === 'active' ? 'ok' : ''">{{ s.status === 'active' ? '已开通' : '筹备中' }}</span></td>
          <td class="num">{{ s.students }}</td><td class="num">{{ s.merchants }}</td><td class="num">{{ s.orders }}</td><td class="num">{{ money(s.gmv) }}</td></tr></table>
    </div>
  </div><div v-else class="empty">加载中…</div>`,
  setup() {
    const d = ref(null), table = ref(false);
    const load = async () => { d.value = await api('/dashboard', { query: { school_id: S.schoolFilter } }); S.todo = d.value.todo; };
    onMounted(load); watch(() => S.schoolFilter, load);
    const incomeMax = computed(() => Math.max(1, ...(d.value?.income || []).map((r) => Math.abs(r.amount))));
    const todos = [
      { k: 'pending_merchants', t: '待审核商家', i: 'store', page: 'merchants' },
      { k: 'pending_promotions', t: '待审核推荐位', i: 'crown', page: 'promotions' },
      { k: 'applying_schools', t: '学校开通申请', i: 'school', page: 'schools' },
      { k: 'pending_riders', t: '骑手申请', i: 'takeout', page: 'users' },
      { k: 'reported_posts', t: '被举报树洞', i: 'flag', page: 'treehole' },
      { k: 'unanswered', t: '百事通未答上的提问', i: 'help', page: 'faqs' },
    ];
    return { d, table, incomeMax, todos, go: (p) => (location.hash = '#/' + p) };
  },
};

/* ---------------- 收益分配：平台怎么赚钱、抽多少、多余利润去哪 ---------------- */
const Revenue = {
  template: `<div v-if="r">
    <div class="rev-hero">
      <div><div class="muted" style="color:rgba(255,255,255,.8)">平台净收入（已结算）</div><div class="big">{{ money(r.platform_net) }}</div>
        <div style="opacity:.85;font-size:13px">平台不向商家收取高额佣金，收入来自以下 6 项，全部按流水可追溯</div></div>
      <div class="rev-split"><div v-for="p in r.parties" :key="p.party"><span>{{ p.title }}</span><b>{{ money(p.amount) }}</b></div></div>
    </div>
    <h2 class="sec">一、平台收入来源与抽成规则</h2>
    <div class="src-grid">
      <div v-for="x in r.platform" :key="x.kind" class="src" :class="{ neg: x.amount < 0 }">
        <div class="src-head"><span class="src-ico"><Icon :name="icons[x.kind]" :size="18" /></span><b>{{ x.title }}</b><span class="tag" style="margin-left:auto">{{ x.n }} 笔</span></div>
        <div class="src-amt">{{ x.amount < 0 ? '-' : '' }}{{ money(Math.abs(x.amount)) }}</div>
        <div class="src-rule">{{ rule(x.kind) }}</div>
      </div>
    </div>
    <h2 class="sec">二、一笔订单的钱去哪了 <small>按当前参数，取销量最高的商品演示</small></h2>
    <div class="grid g2">
      <div v-for="x in r.samples" :key="x.type" class="card">
        <h3><span class="tag" :class="x.type === 'takeout' ? 'primary' : 'ok'">{{ x.type === 'takeout' ? '校园外卖' : '到店团购' }}</span>{{ x.title }}<small>{{ x.merchant_name }}</small></h3>
        <div class="muted">学生实付 <b style="color:var(--ink);font-size:16px">¥{{ yuan(x.sale_price + x.delivery_fee) }}</b>（竞品平台 ¥{{ yuan(x.competitor_price) }}，学生省 ¥{{ yuan(x.competitor_price - x.sale_price) }}）</div>
        <div class="stack">
          <i v-for="seg in segs(x)" :key="seg.k" :style="{ flex: seg.v, background: seg.c }" :title="seg.t + ' ¥' + yuan(seg.v)"></i>
        </div>
        <table class="mini"><tr v-for="seg in segs(x)" :key="seg.k"><td><i class="dot" :style="{ background: seg.c }"></i>{{ seg.t }}</td><td class="muted">{{ seg.f }}</td><td class="num"><b>¥{{ yuan(seg.v) }}</b></td></tr></table>
      </div>
    </div>
    <h2 class="sec">三、多余利润如何分配</h2>
    <div class="card rules">
      <p><b>1. 商品差价</b>（学生实付 − 商家到手）：客户经理分 {{ pct(r.rules.manager_rate) }}，平台留 {{ pct(1 - r.rules.manager_rate) }}；平台直营（无客户经理）的商家，差价全部归平台。</p>
      <p><b>2. 配送费</b>：学生付 ¥{{ yuan(r.rules.delivery_fee) }}/单，骑手提成 ¥{{ yuan(r.rules.rider_commission) }}/单，结余 ¥{{ yuan(r.rules.delivery_fee - r.rules.rider_commission) }} 归平台（覆盖保温箱、调度成本）。</p>
      <p><b>3. 跑腿 / 代取快递</b>：赏金预付托管，完成后从赏金中抽 {{ pct(r.rules.errand_fee_rate) }} 服务费，其余打给接单同学。</p>
      <p><b>4. 二手担保交易</b>：买家付款托管，确认收货后从成交价中抽 {{ pct(r.rules.market_fee_rate) }} 服务费，其余打给卖家。</p>
      <p><b>5. 首页推荐位</b>：每个行业前 3 位按天售卖（¥{{ (r.rules.ad_prices || []).map(yuan).join(' / ') }} 每天），当前在投 {{ r.ad_slots_active }} 个，广告费全额归平台。</p>
      <p><b>6. 优惠券补贴</b>：福利群发的券由平台出资，抵扣金额从平台收入中扣除，<b>不影响商家到手与客户经理佣金</b>。已领 {{ r.coupon_stats.claimed || 0 }} 张、已用 {{ r.coupon_stats.used || 0 }} 张。</p>
      <p class="muted">所有比例在「平台参数」中可调，只影响之后的新订单；历史订单按下单时快照结算。正式上线后通过微信支付服务商分账，按流水把钱直接分给商家、客户经理、骑手和学生，平台不碰他人资金（规避"二清"）。</p>
    </div>
  </div><div v-else class="empty">加载中…</div>`,
  setup() {
    const r = ref(null);
    const load = async () => { r.value = await api('/revenue', { query: { school_id: S.schoolFilter } }).catch(() => null); };
    onMounted(load); watch(() => S.schoolFilter, load);
    const icons = { margin: 'tag', delivery: 'takeout', errand_fee: 'errand', market_fee: 'market', ad: 'crown', subsidy: 'ticket' };
    const rule = (k) => {
      const x = r.value.rules;
      return {
        margin: `差价 × ${pct(1 - x.manager_rate)}（客户经理分 ${pct(x.manager_rate)}）`,
        delivery: `每单 ¥${yuan(x.delivery_fee)} − 骑手 ¥${yuan(x.rider_commission)}`,
        errand_fee: `赏金 × ${pct(x.errand_fee_rate)}`,
        market_fee: `成交价 × ${pct(x.market_fee_rate)}`,
        ad: `行业前三按天计费 ¥${(x.ad_prices || []).map(yuan).join('/')}`,
        subsidy: '平台出资，从平台收入中扣除',
      }[k];
    };
    const segs = (x) => {
      const out = [
        { k: 'm', t: '商家到手', f: x.pricing_mode === 'voucher' ? '与竞品平台到手一致' : '与商家约定', v: x.merchant_settle, c: '#12b76a' },
        { k: 'g', t: '客户经理佣金', f: '差价 × ' + pct(r.value.rules.manager_rate), v: x.manager_commission, c: '#6e4ae6' },
        { k: 'p', t: '平台留存', f: '差价剩余部分', v: x.platform_margin, c: '#ff6a1a' },
      ];
      if (x.delivery_fee) {
        out.push({ k: 'r', t: '骑手提成', f: '配送费中支出', v: x.rider_commission, c: '#0b9f9a' });
        out.push({ k: 'd', t: '配送费结余', f: '归平台', v: x.delivery_fee - x.rider_commission, c: '#ffb238' });
      }
      return out.filter((s) => s.v > 0);
    };
    return { r, icons, rule, segs };
  },
};

/* ---------------- 首页推荐位（商家买广告，行业前三） ---------------- */
const Promotions = {
  template: `<div v-if="data">
    <div class="filters"><div class="seg"><button v-for="t in tabs" :key="t.v" :class="{ on: q.status === t.v }" @click="q.status = t.v">{{ t.t }}</button></div>
      <button class="btn" @click="openNew"><Icon name="plus" :size="15" /> 后台排期</button>
      <span class="muted">学生端"热门推荐"与周边列表：本行业推荐位置顶并标注"广告"，其余按销量排序</span></div>
    <div class="card"><h3>推荐位排期看板 <small>{{ schoolName }} · 今日</small></h3>
      <div class="board"><div v-for="c in data.board" :key="c.category" class="board-col">
        <div class="board-head">{{ c.name }}</div>
        <div v-for="s in c.slots" :key="s.position" class="board-slot" :class="{ on: s.current }">
          <span class="no" :class="'n' + s.position">{{ s.position }}</span>
          <div style="min-width:0"><div class="clip" style="max-width:none">{{ s.current ? s.current.merchant_name : '空闲' }}</div><div class="muted">{{ s.current ? '至 ' + s.current.end_date.slice(5) : '¥' + yuan(s.price_per_day) + '/天' }}</div></div>
        </div>
      </div></div>
    </div>
    <div class="table-wrap"><table>
      <tr><th>商家 / 推广商品</th><th>学校</th><th>行业 · 位置</th><th>投放日期</th><th class="num">广告费</th><th>来源</th><th>状态</th><th></th></tr>
      <tr v-for="p in data.rows" :key="p.id"><td><b>{{ p.merchant_name }}</b><div class="muted">{{ p.deal_title }}</div></td><td>{{ p.school_name }}</td>
        <td>{{ PCAT[p.category] }} · 第 {{ p.position }} 位</td><td>{{ p.start_date }} ~ {{ p.end_date }}<div class="muted">{{ p.days }} 天</div></td>
        <td class="num"><b>{{ yuan(p.fee) }}</b></td><td class="muted">{{ p.source === 'admin' ? '后台排期' : '商家自助' }}</td>
        <td><span class="tag" :class="PSTATUS[p.status][1]">{{ PSTATUS[p.status][0] }}</span></td>
        <td class="actions"><template v-if="p.status === 'pending'"><button class="btn sm" @click="act(p, 'approve')">通过</button><button class="btn sm danger" @click="act(p, 'reject')">驳回退款</button></template>
          <button v-if="p.status === 'active'" class="btn sm line" @click="act(p, 'end')">提前下线</button></td></tr>
      <tr v-if="!data.rows.length"><td colspan="8" class="empty">暂无推广</td></tr>
    </table></div>
    <div v-if="f" class="drawer-mask" @click.self="f = null"><div class="drawer">
      <h2>后台排期（线下谈成的广告）</h2>
      <div class="form-row"><label>推广商品</label><select class="input" v-model="f.deal_id"><option v-for="d in deals" :key="d.id" :value="d.id">{{ d.merchant_name }} · {{ d.title }}</option></select></div>
      <div class="form-row"><label>位置</label><select class="input" v-model="f.position"><option v-for="n in 3" :key="n" :value="n">第 {{ n }} 位（¥{{ yuan(data.prices[n - 1]) }}/天）</option></select></div>
      <div class="form-row"><label>开始日期</label><input class="input" type="date" v-model="f.start_date"></div>
      <div class="form-row"><label>天数</label><input class="input" type="number" min="1" max="30" v-model="f.days" style="width:100px"></div>
      <div class="form-row"><label>广告费</label><b>¥{{ yuan(data.prices[f.position - 1] * f.days) }}</b></div>
      <div class="foot"><button class="btn line" @click="f = null">取消</button><button class="btn" @click="save">确认排期</button></div>
    </div></div>
  </div><div v-else class="empty">加载中…</div>`,
  setup() {
    const q = reactive({ status: '' });
    const data = ref(null), f = ref(null), deals = ref([]);
    const load = async () => { data.value = await api('/promotions', { query: { ...q, school_id: S.schoolFilter } }).catch(() => data.value); };
    onMounted(load); watch([q, () => S.schoolFilter], load, { deep: true });
    const schoolName = computed(() => (S.schools.find((s) => s.id == data.value?.board_school_id) || {}).name || '');
    return {
      q, data, f, deals, schoolName, tabs: [{ v: '', t: '全部' }, { v: 'pending', t: '待审核' }, { v: 'active', t: '投放中' }, { v: 'ended', t: '已结束' }],
      async openNew() {
        deals.value = (await api('/deals', { query: { status: 'on', school_id: S.schoolFilter } }).catch(() => []));
        f.value = { deal_id: deals.value[0]?.id, position: 1, start_date: new Date().toISOString().slice(0, 10), days: 7 };
      },
      async save() { const r = await post('/promotions', f.value).catch(() => null); if (r) { toast('已排期，广告费已计入平台收入'); f.value = null; load(); } },
      async act(p, a) {
        if (a !== 'approve' && !confirm(a === 'reject' ? '驳回并全额退款？' : '提前下线该推广？')) return;
        await post(`/promotions/${p.id}/${a}`).catch(() => {}); toast('已处理'); load(); refreshTodo();
      },
    };
  },
};

/* ---------------- 平台优惠券（福利群每日发券） ---------------- */
const Coupons = {
  template: `<div>
    <div class="filters"><button class="btn" @click="edit({})"><Icon name="plus" :size="15" /> 新建优惠券</button>
      <span class="muted">每日定时开抢、限量发放；运营在企业微信福利群提醒学生来抢。券由平台出资，不影响商家到手</span></div>
    <div class="table-wrap"><table>
      <tr><th>优惠券</th><th>适用</th><th>范围</th><th>每日发放</th><th>开抢</th><th>有效期</th><th class="num">今日已领</th><th class="num">累计领 / 用</th><th class="num">平台补贴</th><th>状态</th><th></th></tr>
      <tr v-for="c in rows" :key="c.id"><td><b>{{ c.title }}</b><div class="muted">减 ¥{{ yuan(c.amount) }} · {{ c.threshold ? '满 ¥' + yuan(c.threshold) : '无门槛' }}</div></td>
        <td>{{ SCOPE[c.scope] }}</td><td>{{ c.school_name || '全平台' }}</td><td>{{ c.daily_quota }} 张</td><td>{{ c.start_time }}</td><td>{{ c.valid_days > 1 ? c.valid_days + ' 天' : '当日' }}</td>
        <td class="num">{{ c.claimed_today }}</td><td class="num">{{ c.claimed_total }} / {{ c.used_total }}</td><td class="num">{{ yuan(c.subsidy_total) }}</td>
        <td><span class="tag" :class="c.status === 'on' ? 'ok' : ''">{{ c.status === 'on' ? '发放中' : '已下线' }}</span></td>
        <td class="actions"><button class="btn sm line" @click="edit(c)">编辑</button><button class="btn sm line" @click="toggle(c)">{{ c.status === 'on' ? '下线' : '上线' }}</button></td></tr>
      <tr v-if="rows && !rows.length"><td colspan="11" class="empty">暂无优惠券</td></tr>
    </table></div>
    <div v-if="f" class="drawer-mask" @click.self="f = null"><div class="drawer">
      <h2>{{ f.id ? '编辑优惠券' : '新建优惠券' }}</h2>
      <div class="form-row"><label>券名称</label><input class="input" v-model="f.title" placeholder="如：外卖立减券"></div>
      <div class="form-row"><label>抵扣金额</label><div><input class="input" type="number" step="0.5" v-model="f.amount" style="width:100px"> 元</div></div>
      <div class="form-row"><label>使用门槛</label><div>商品满 <input class="input" type="number" v-model="f.threshold" style="width:100px"> 元可用 <span class="muted">（0 = 无门槛）</span></div></div>
      <div class="form-row"><label>适用范围</label><select class="input" v-model="f.scope"><option v-for="(t, k) in SCOPE" :key="k" :value="k">{{ t }}</option></select></div>
      <div class="form-row"><label>适用学校</label><select class="input" v-model="f.school_id"><option :value="null">全平台</option><option v-for="s in S.schools" :key="s.id" :value="s.id">{{ s.name }}</option></select></div>
      <div class="form-row"><label>每日发放</label><div><input class="input" type="number" v-model="f.daily_quota" style="width:100px"> 张</div></div>
      <div class="form-row"><label>每日开抢</label><input class="input" type="time" v-model="f.start_time" style="width:140px"></div>
      <div class="form-row"><label>有效天数</label><div><input class="input" type="number" min="1" max="30" v-model="f.valid_days" style="width:100px"> 天 <span class="muted">（1 = 当天 23:59 前）</span></div></div>
      <div class="foot"><button class="btn line" @click="f = null">取消</button><button class="btn" @click="save">保存</button></div>
    </div></div>
  </div>`,
  setup() {
    const { rows, load } = useList(() => api('/coupons'));
    const f = ref(null);
    return {
      rows, f, S,
      edit: (c) => { f.value = c.id ? { ...c, amount: c.amount / 100, threshold: c.threshold / 100 } : { title: '', amount: 2, threshold: 10, scope: 'all', school_id: null, daily_quota: 100, start_time: '12:00', valid_days: 1 }; },
      async save() { const r = await post(f.value.id ? '/coupons/' + f.value.id : '/coupons', f.value).catch(() => null); if (r) { toast('已保存'); f.value = null; load(); } },
      async toggle(c) { await post('/coupons/' + c.id).catch(() => {}); load(); },
    };
  },
};

const Schools = {
  template: `<div>
    <div class="filters"><button class="btn" @click="edit({ status: 'preparing', delivery_slots: ['11:30', '17:30'], delivery_points: [] })">+ 新增学校</button>
      <span class="muted">开通（已开通）后学生即可在小程序中选择；外卖时间点与取餐点按学校单独配置</span></div>
    <div class="table-wrap"><table>
      <tr><th>学校</th><th>城市</th><th>状态</th><th>外卖送餐时间点</th><th>取餐点</th><th>申请联系方式</th><th></th></tr>
      <tr v-for="s in rows" :key="s.id"><td><b>{{ s.name }}</b> <span v-if="s.is_pilot" class="tag primary">试点</span><div class="muted">{{ s.short_name }}</div></td><td>{{ s.city }}</td>
        <td><span class="tag" :class="{ active: 'ok', applying: 'warn' }[s.status]">{{ { active: '已开通', preparing: '筹备中', applying: '学生申请' }[s.status] }}</span></td>
        <td>{{ s.delivery_slots.join('、') }}</td><td class="clip">{{ s.delivery_points.join('、') || '-' }}</td><td class="muted">{{ s.contact || '-' }}</td>
        <td class="actions"><button class="btn sm line" @click="edit(s)">编辑</button><button v-if="s.status !== 'active'" class="btn sm" @click="quick(s, 'active')">开通</button></td></tr>
    </table></div>
    <div v-if="f" class="drawer-mask" @click.self="f = null"><div class="drawer">
      <h2>{{ f.id ? '编辑学校' : '新增学校' }}</h2>
      <div class="form-row"><label>学校名称</label><input class="input" v-model="f.name"></div>
      <div class="form-row"><label>简称</label><input class="input" v-model="f.short_name"></div>
      <div class="form-row"><label>城市</label><input class="input" v-model="f.city"></div>
      <div class="form-row"><label>状态</label><select class="input" v-model="f.status"><option value="active">已开通</option><option value="preparing">筹备中</option><option value="applying">学生申请</option></select></div>
      <div class="form-row"><label>试点学校</label><label><input type="checkbox" v-model="f.is_pilot" :true-value="1" :false-value="0"> 是</label></div>
      <div class="form-row"><label>送餐时间点</label><div class="chip-edit"><span v-for="(t, i) in f.delivery_slots" :key="t">{{ t }}<button @click="f.delivery_slots.splice(i, 1)">×</button></span>
        <input class="input" type="time" v-model="newSlot" @keyup.enter="addSlot"><button class="btn sm line" @click="addSlot">添加</button></div></div>
      <div class="form-row"><label>校内取餐点</label><div class="chip-edit"><span v-for="(p, i) in f.delivery_points" :key="p">{{ p }}<button @click="f.delivery_points.splice(i, 1)">×</button></span>
        <input class="input" v-model="newPoint" placeholder="如：东门取餐柜" @keyup.enter="addPoint"><button class="btn sm line" @click="addPoint">添加</button></div></div>
      <div class="foot"><button class="btn line" @click="f = null">取消</button><button class="btn" @click="save">保存</button></div>
    </div></div>
  </div>`,
  setup() {
    const { rows, load } = useList(() => api('/schools'));
    const f = ref(null), newSlot = ref(''), newPoint = ref('');
    const save = async (data) => { const x = data || f.value; await post(x.id ? '/schools/' + x.id : '/schools', x); toast('已保存'); f.value = null; load(); refreshTodo(); };
    return {
      rows, f, newSlot, newPoint,
      edit: (s) => { f.value = JSON.parse(JSON.stringify(s)); },
      addSlot() { if (newSlot.value && !f.value.delivery_slots.includes(newSlot.value)) f.value.delivery_slots.push(newSlot.value); newSlot.value = ''; },
      addPoint() { const p = newPoint.value.trim(); if (p && !f.value.delivery_points.includes(p)) f.value.delivery_points.push(p); newPoint.value = ''; },
      save: () => save().catch(() => {}),
      quick: (s, status) => save({ ...s, status }).catch(() => {}),
    };
  },
};

const Merchants = {
  template: `<div>
    <div class="filters"><div class="seg"><button v-for="t in tabs" :key="t.v" :class="{ on: q.status === t.v }" @click="q.status = t.v">{{ t.t }}</button></div>
      <input v-model.lazy="q.keyword" placeholder="搜索店名"></div>
    <div class="table-wrap"><table>
      <tr><th>商家</th><th>学校</th><th>类目</th><th>客户经理</th><th>证照</th><th class="num">在售</th><th class="num">订单</th><th>状态</th><th></th></tr>
      <tr v-for="m in rows" :key="m.id">
        <td><b>{{ m.name }}</b><div class="muted">{{ m.address }} · {{ m.phone }}</div></td><td>{{ m.school_name }}</td><td>{{ CAT[m.category] }}<span v-if="m.takeout_enabled" class="tag primary" style="margin-left:4px">外卖</span></td>
        <td><select class="input" style="height:28px" :value="m.manager_id || ''" @change="bind(m, $event.target.value)"><option value="">平台直营</option><option v-for="g in managers" :key="g.id" :value="g.id">{{ g.nickname }}（{{ g.invite_code }}）</option></select></td>
        <td><img v-if="m.license_image" :src="m.license_image" class="thumb" @click="S.img = m.license_image"><span v-else class="muted">未上传</span></td>
        <td class="num">{{ m.deals }}</td><td class="num">{{ m.orders }}</td>
        <td><span class="tag" :class="{ approved: 'ok', pending: 'warn', rejected: 'bad' }[m.status]">{{ { approved: '已通过', pending: '待审核', rejected: '已驳回/停用' }[m.status] }}</span></td>
        <td class="actions"><template v-if="m.status !== 'approved'"><button class="btn sm" @click="act(m, 'approve')">通过</button></template>
          <button v-if="m.status === 'pending'" class="btn sm danger" @click="act(m, 'reject')">驳回</button>
          <button v-if="m.status === 'approved'" class="btn sm danger" @click="act(m, 'suspend')">停用</button></td></tr>
      <tr v-if="rows && !rows.length"><td colspan="9" class="empty">暂无商家</td></tr>
    </table></div></div>`,
  setup() {
    const q = reactive({ status: '', keyword: '' });
    const { rows, load } = useList(() => api('/merchants', { query: { ...q, school_id: S.schoolFilter } }), [q, () => S.schoolFilter]);
    const managers = ref([]);
    onMounted(async () => { managers.value = await api('/users', { query: { role: 'manager' } }).catch(() => []); });
    return {
      q, rows, managers, tabs: [{ v: '', t: '全部' }, { v: 'pending', t: '待审核' }, { v: 'approved', t: '已通过' }, { v: 'rejected', t: '已驳回' }],
      async act(m, a) { if (a !== 'approve' && !confirm(`确定${a === 'reject' ? '驳回' : '停用'}「${m.name}」？`)) return; await post(`/merchants/${m.id}/${a}`).catch(() => {}); toast('已处理'); load(); refreshTodo(); },
      async bind(m, id) { await post(`/merchants/${m.id}/manager`, { manager_id: Number(id) || 0 }).catch(() => {}); toast('已更新推广归属'); load(); },
    };
  },
};

const Deals = {
  template: `<div>
    <div class="filters"><div class="seg"><button v-for="t in tabs" :key="t.v" :class="{ on: q.pricing_mode === t.v }" @click="q.pricing_mode = t.v">{{ t.t }}</button></div>
      <input v-model.lazy="q.keyword" placeholder="搜索商品"><span class="muted">抽查竞品价真实性；商家到手低于竞品平台价 60% 标红提示（留存风险）</span></div>
    <div class="table-wrap"><table>
      <tr><th>商品</th><th>商家</th><th>模式</th><th class="num">竞品平台价</th><th class="num">商家到手</th><th class="num">到手比例</th><th class="num">用户实付</th><th class="num">用户省</th><th class="num">单份毛利</th><th class="num">已售</th><th>状态</th><th></th></tr>
      <tr v-for="d in rows" :key="d.id">
        <td><b>{{ d.title }}</b><div class="muted">{{ d.type === 'takeout' ? '校园外卖' : '到店团购' }}</div></td><td>{{ d.merchant_name }}</td>
        <td>{{ d.pricing_mode === 'voucher' ? '代金券 ' + yuan(d.voucher_cost) + '抵' + yuan(d.voucher_face) : '平台定价' }}</td>
        <td class="num">{{ yuan(d.competitor_price) }}</td><td class="num">{{ yuan(d.merchant_settle) }}</td>
        <td class="num"><span :class="d.merchant_ratio < 0.6 ? 'tag bad' : ''">{{ Math.round(d.merchant_ratio * 100) }}%</span></td>
        <td class="num"><b>{{ yuan(d.sale_price) }}</b></td><td class="num">{{ yuan(d.saving) }}</td><td class="num">{{ yuan(d.gross) }}</td><td class="num">{{ d.sold }}</td>
        <td><span class="tag" :class="d.status === 'on' ? 'ok' : ''">{{ d.status === 'on' ? '在售' : '下架' }}</span></td>
        <td><button class="btn sm line" @click="toggle(d)">{{ d.status === 'on' ? '强制下架' : '恢复上架' }}</button></td></tr>
    </table></div></div>`,
  setup() {
    const q = reactive({ pricing_mode: '', keyword: '' });
    const { rows } = useList(() => api('/deals', { query: { ...q, school_id: S.schoolFilter } }), [q, () => S.schoolFilter]);
    return { q, rows, tabs: [{ v: '', t: '全部' }, { v: 'voucher', t: '代金券模式' }, { v: 'fixed', t: '平台定价' }],
      async toggle(d) { const r = await post(`/deals/${d.id}/toggle`).catch(() => null); if (r) { d.status = r.status; toast('已更新'); } } };
  },
};

const Orders = {
  template: `<div>
    <div class="filters"><div class="seg"><button v-for="t in types" :key="t.v" :class="{ on: q.type === t.v }" @click="q.type = t.v">{{ t.t }}</button></div>
      <select v-model="q.status"><option value="">全部状态</option><option v-for="(t, k) in ORDER" :key="k" :value="k">{{ t }}</option></select>
      <input v-model.lazy="q.keyword" placeholder="订单号"></div>
    <div class="table-wrap"><table>
      <tr><th>订单号</th><th>商品</th><th>用户</th><th>商家</th><th class="num">实付</th><th class="num">商家</th><th class="num">经理佣金</th><th class="num">骑手</th><th class="num">平台净收</th><th>配送</th><th>状态</th><th>下单时间</th></tr>
      <tr v-for="o in rows" :key="o.id"><td class="muted">{{ o.order_no }}</td><td>{{ o.title }} ×{{ o.quantity }}</td><td>{{ o.user_name }}</td><td>{{ o.merchant_name }}</td>
        <td class="num"><b>{{ yuan(o.total_amount) }}</b></td><td class="num">{{ yuan(o.merchant_amount) }}</td><td class="num">{{ yuan(o.manager_commission) }}<div class="muted">{{ o.manager_name || '' }}</div></td>
        <td class="num">{{ yuan(o.rider_commission) }}<div class="muted">{{ o.rider_name || '' }}</div></td><td class="num">{{ yuan(o.platform_net) }}</td>
        <td class="muted">{{ o.type === 'takeout' ? o.delivery_date.slice(5) + ' ' + o.delivery_slot + ' ' + o.delivery_point : '到店' }}</td>
        <td><span class="tag" :class="{ completed: 'ok', pending_pay: 'warn', refunded: 'bad' }[o.status] || 'primary'">{{ ORDER[o.status] }}</span></td><td class="muted">{{ o.created_at.slice(5, 16) }}</td></tr>
      <tr v-if="rows && !rows.length"><td colspan="12" class="empty">暂无订单</td></tr>
    </table></div><p class="muted">订单金额拆分为下单时快照；分账流水在核销/送达时写入，见「资金流水」</p></div>`,
  setup() {
    const q = reactive({ type: '', status: '', keyword: '', size: 50 });
    const { rows } = useList(() => api('/orders', { query: { ...q, school_id: S.schoolFilter } }), [q, () => S.schoolFilter]);
    return { q, rows, types: [{ v: '', t: '全部' }, { v: 'groupbuy', t: '团购' }, { v: 'takeout', t: '外卖' }] };
  },
};

const Ledger = {
  template: `<div v-if="data">
    <div class="kpis"><div v-for="(v, k) in sums" :key="k" class="kpi"><span>{{ PARTY[k] }}</span><b>{{ money(v) }}</b></div></div>
    <div class="filters"><div class="seg"><button v-for="t in tabs" :key="t.v" :class="{ on: q.party_type === t.v }" @click="q.party_type = t.v">{{ t.t }}</button></div></div>
    <div class="table-wrap"><table>
      <tr><th>时间</th><th>业务</th><th>收款方</th><th>类型</th><th class="num">金额</th><th>备注</th></tr>
      <tr v-for="l in data.rows" :key="l.id"><td class="muted">{{ l.created_at.slice(5, 16) }}</td><td><span class="tag">{{ SOURCE[l.source] }}</span><div class="muted">{{ l.order_no || '' }}</div></td>
        <td>{{ l.party_name || '-' }} <span class="tag">{{ PARTY[l.party_type] }}</span></td><td>{{ KIND[l.kind] }}</td><td class="num"><b :style="{ color: l.amount < 0 ? 'var(--bad)' : '' }">{{ yuan(l.amount) }}</b></td><td class="muted">{{ l.remark }}</td></tr>
    </table></div><p class="muted">正式版通过微信支付服务商分账，按以上流水自动分给商家、客户经理、骑手</p></div>`,
  setup() {
    const q = reactive({ party_type: '', size: 50 });
    const data = ref(null);
    const load = async () => { data.value = await api('/ledger', { query: q }).catch(() => data.value); };
    onMounted(load); watch(q, load, { deep: true });
    const sums = computed(() => { const o = { merchant: 0, manager: 0, rider: 0, student: 0, platform: 0 }; (data.value?.summary || []).forEach((r) => (o[r.party_type] += Number(r.amount))); return o; });
    return { q, data, sums, tabs: [{ v: '', t: '全部' }, { v: 'merchant', t: '商家' }, { v: 'manager', t: '客户经理' }, { v: 'rider', t: '骑手' }, { v: 'student', t: '学生' }, { v: 'platform', t: '平台' }] };
  },
};

const Users = {
  template: `<div>
    <div class="filters"><div class="seg"><button v-for="t in tabs" :key="t.k" :class="{ on: tab === t.k }" @click="tab = t.k">{{ t.t }}</button></div>
      <input v-model.lazy="q.keyword" placeholder="手机号 / 昵称"></div>
    <div class="table-wrap"><table>
      <tr><th>用户</th><th>学校</th><th>角色</th><th>外卖骑手</th><th>邀请码</th><th>状态</th><th>注册</th><th></th></tr>
      <tr v-for="u in rows" :key="u.id"><td><b>{{ u.nickname }}</b><div class="muted">{{ u.phone }}</div></td><td>{{ u.school_name || '-' }}</td>
        <td>{{ ROLE[u.role] }}<div v-if="u.role === 'manager'" class="muted">推广 {{ u.bound_merchants }} 家</div></td>
        <td><span v-if="u.rider_status !== 'none'" class="tag" :class="u.rider_status === 'approved' ? 'ok' : 'warn'">{{ u.rider_status === 'approved' ? '已加入' : '申请中' }}</span><span v-else class="muted">-</span></td>
        <td>{{ u.invite_code || '-' }}</td><td><span class="tag" :class="u.status === 'banned' ? 'bad' : 'ok'">{{ u.status === 'banned' ? '已封禁' : '正常' }}</span></td>
        <td class="muted">{{ u.created_at.slice(0, 10) }}</td>
        <td class="actions">
          <button v-if="u.rider_status === 'pending'" class="btn sm" @click="upd(u, { rider_status: 'approved' })">通过骑手</button>
          <button v-if="u.rider_status === 'approved'" class="btn sm line" @click="upd(u, { rider_status: 'none' })">移出团队</button>
          <button v-if="u.role === 'student'" class="btn sm line" @click="upd(u, { role: 'manager' }, '设为客户经理将自动生成邀请码')">设为客户经理</button>
          <button v-if="u.role !== 'admin'" class="btn sm danger" @click="upd(u, { status: u.status === 'banned' ? 'active' : 'banned' }, u.status === 'banned' ? '' : '封禁后该用户无法登录')">{{ u.status === 'banned' ? '解封' : '封禁' }}</button></td></tr>
    </table></div></div>`,
  setup() {
    const tab = ref('all'), q = reactive({ keyword: '' });
    const tabs = [{ k: 'all', t: '全部' }, { k: 'student', t: '学生', f: { role: 'student' } }, { k: 'rider', t: '骑手申请', f: { rider_status: 'pending' } }, { k: 'riders', t: '外卖团队', f: { rider_status: 'approved' } },
      { k: 'manager', t: '客户经理', f: { role: 'manager' } }, { k: 'merchant', t: '商家', f: { role: 'merchant' } }];
    const { rows, load } = useList(() => api('/users', { query: { ...q, ...(tabs.find((t) => t.k === tab.value).f || {}), school_id: S.schoolFilter } }), [tab, q, () => S.schoolFilter]);
    return { tab, tabs, q, rows, async upd(u, data, tip) { if (tip && !confirm(tip + '，确定？')) return; await post('/users/' + u.id, data).catch(() => {}); toast('已更新'); load(); refreshTodo(); } };
  },
};

const Treehole = {
  template: `<div>
    <div class="filters"><div class="seg"><button :class="{ on: q.reported }" @click="q.reported = 1">被举报</button><button :class="{ on: !q.reported && q.status === 'hidden' }" @click="q.reported = 0; q.status = 'hidden'">已隐藏</button><button :class="{ on: !q.reported && !q.status }" @click="q.reported = 0; q.status = ''">全部</button></div>
      <span class="muted">前台匿名，后台可见真实身份；被 3 人举报自动隐藏</span></div>
    <div class="table-wrap"><table>
      <tr><th>内容</th><th>匿名 / 真实身份</th><th>标签</th><th class="num">举报</th><th>举报原因</th><th>状态</th><th></th></tr>
      <tr v-for="p in rows" :key="p.id"><td style="max-width:360px">{{ p.content }}<div class="muted">{{ p.school_name }} · {{ p.created_at.slice(5, 16) }}</div></td>
        <td>{{ p.anon_name }}<div class="muted">{{ p.real_name }} {{ p.real_phone }}</div></td><td>{{ p.tag }}</td>
        <td class="num"><span :class="p.report_count ? 'tag bad' : ''">{{ p.report_count }}</span></td><td class="muted">{{ p.reasons || '-' }}</td>
        <td><span class="tag" :class="p.status === 'hidden' ? 'bad' : 'ok'">{{ p.status === 'hidden' ? '已隐藏' : '正常' }}</span></td>
        <td class="actions"><button v-if="p.status !== 'hidden'" class="btn sm danger" @click="act(p, 'hide')">隐藏</button><button class="btn sm line" @click="act(p, 'restore')">{{ p.status === 'hidden' ? '恢复' : '驳回举报' }}</button></td></tr>
      <tr v-if="rows && !rows.length"><td colspan="7" class="empty">没有需要处理的内容</td></tr>
    </table></div></div>`,
  setup() {
    const q = reactive({ reported: 1, status: '' });
    const { rows, load } = useList(() => api('/treehole', { query: { ...q, school_id: S.schoolFilter } }), [q, () => S.schoolFilter]);
    return { q, rows, async act(p, a) { await post(`/treehole/${p.id}/${a}`).catch(() => {}); toast('已处理'); load(); refreshTodo(); } };
  },
};

const Faqs = {
  template: `<div class="grid g2" style="align-items:start">
    <div><div class="filters"><button class="btn" @click="edit({})">+ 新增问答</button><span class="muted">AI 接入前由知识库兜底回答；接入后作为 AI 的参考资料</span></div>
      <div class="table-wrap"><table><tr><th>问题</th><th>范围</th><th class="num">命中</th><th></th></tr>
        <tr v-for="f in rows" :key="f.id"><td><b>{{ f.question }}</b><div class="muted clip" style="max-width:380px">{{ f.answer }}</div><div class="muted">关键词：{{ f.keywords || '-' }}</div></td>
          <td>{{ f.school_name || '全平台' }}</td><td class="num">{{ f.hits }}</td><td class="actions"><button class="btn sm line" @click="edit(f)">编辑</button><button class="btn sm danger" @click="del(f)">删除</button></td></tr></table></div></div>
    <div class="card"><h3>用户提问记录 <small>未答上的问题可一键加入知识库</small></h3>
      <div class="filters"><div class="seg"><button :class="{ on: src === 'none' }" @click="src = 'none'">未答上</button><button :class="{ on: src === '' }" @click="src = ''">全部</button></div></div>
      <table><tr><th>提问</th><th>来源</th><th></th></tr>
        <tr v-for="l in logs" :key="l.id"><td>{{ l.question }}<div class="muted">{{ l.nickname || '游客' }} · {{ l.created_at.slice(5, 16) }}</div></td>
          <td><span class="tag" :class="{ faq: 'ok', ai: 'primary', none: 'warn' }[l.source]">{{ { faq: '知识库', ai: 'AI', none: '未答上' }[l.source] }}</span></td>
          <td><button v-if="l.source === 'none'" class="btn sm line" @click="edit({ question: l.question })">补充答案</button></td></tr>
        <tr v-if="!logs.length"><td colspan="3" class="empty">暂无</td></tr></table></div>
    <div v-if="f" class="drawer-mask" @click.self="f = null"><div class="drawer">
      <h2>{{ f.id ? '编辑问答' : '新增问答' }}</h2>
      <div class="form-row"><label>适用范围</label><select class="input" v-model="f.school_id"><option :value="null">全平台通用</option><option v-for="s in S.schools" :key="s.id" :value="s.id">{{ s.name }}</option></select></div>
      <div class="form-row"><label>问题</label><input class="input" v-model="f.question"></div>
      <div class="form-row" style="align-items:start"><label>答案</label><textarea class="input" rows="6" v-model="f.answer"></textarea></div>
      <div class="form-row"><label>关键词</label><input class="input" v-model="f.keywords" placeholder="逗号分隔，如：游泳,泳池"></div>
      <div class="foot"><button class="btn line" @click="f = null">取消</button><button class="btn" @click="save">保存</button></div>
    </div></div>
  </div>`,
  setup() {
    const { rows, load } = useList(() => api('/faqs'));
    const src = ref('none'), logs = ref([]), f = ref(null);
    const loadLogs = async () => { logs.value = await api('/ai-logs', { query: { source: src.value } }).catch(() => []); };
    onMounted(loadLogs); watch(src, loadLogs);
    return {
      rows, src, logs, f, S,
      edit: (x) => { f.value = { school_id: null, question: '', answer: '', keywords: '', ...x }; },
      async save() { const r = await post(f.value.id ? '/faqs/' + f.value.id : '/faqs', f.value).catch(() => null); if (!r) return; toast('已保存'); f.value = null; load(); },
      async del(x) { if (!confirm('删除「' + x.question + '」？')) return; await post(`/faqs/${x.id}/delete`).catch(() => {}); load(); },
    };
  },
};

const Settings = {
  template: `<div class="grid g2" style="align-items:start" v-if="f">
    <div class="card">
    <h3>分成与定价规则 <small>修改只影响之后的新订单，历史订单按下单快照结算</small></h3>
    <div class="form-row"><label>客户经理分成</label><div><input class="input" type="number" step="5" min="0" max="100" v-model="rate" style="width:100px"> % <span class="muted">商品差价中客户经理的比例</span></div></div>
    <div class="form-row"><label>最少比竞品便宜</label><div><input class="input" type="number" step="0.5" v-model="minSaving" style="width:100px"> 元 <span class="muted">低于此值的定价无法上架</span></div></div>
    <h3 style="margin-top:22px">校园外卖</h3>
    <div class="form-row"><label>配送费（学生付）</label><div><input class="input" type="number" step="0.5" v-model="fee" style="width:100px"> 元/单</div></div>
    <div class="form-row"><label>骑手提成</label><div><input class="input" type="number" step="0.5" v-model="rider" style="width:100px"> 元/单 <span class="muted">平台每单结余 ¥{{ (fee - rider).toFixed(2) }}</span></div></div>
    <div class="form-row"><label>截单时间</label><div>送餐前 <input class="input" type="number" v-model="f.takeout_cutoff_minutes" style="width:80px"> 分钟</div></div>
    <h3 style="margin-top:22px">校园服务抽成 <small>不抽多，积少成多</small></h3>
    <div class="form-row"><label>跑腿 / 代取快递</label><div><input class="input" type="number" step="0.5" min="0" max="30" v-model="errandRate" style="width:100px"> % <span class="muted">从赏金中扣除，例：赏金 ¥3 抽 ¥{{ (3 * errandRate / 100).toFixed(2) }}</span></div></div>
    <div class="form-row"><label>二手担保交易</label><div><input class="input" type="number" step="0.5" min="0" max="20" v-model="marketRate" style="width:100px"> % <span class="muted">从成交价中扣除，例：¥50 抽 ¥{{ (50 * marketRate / 100).toFixed(2) }}</span></div></div>
    <h3 style="margin-top:22px">首页推荐位 <small>每个行业前 3 位，按天计费</small></h3>
    <div class="form-row"><label>价格（元/天）</label><div class="row-inline"><span v-for="(p, i) in ads" :key="i">第 {{ i + 1 }} 位 <input class="input" type="number" v-model="ads[i]" style="width:80px"></span></div></div>
    <h3 style="margin-top:22px">商家入驻</h3>
    <div class="form-row"><label>免审核入驻</label><label><input type="checkbox" v-model="f.merchant_auto_approve"> 开启后商家提交即通过（不建议）</label></div>
    </div>
    <div class="card">
    <h3>学生端文案 <small>不直接点名竞品平台</small></h3>
    <div class="form-row"><label>低价标语</label><input class="input" v-model="f.price_slogan" maxlength="12"></div>
    <div class="form-row"><span></span><div class="warn-box"><Icon name="alert" :size="15" />《广告法》禁止"最低价""全网最低"等绝对化用语，建议使用"全平台低价""学生专享价"等表述，并配合可举证的"比其他平台省 X 元"。</div></div>
    <div class="form-row"><label>比价对象称呼</label><input class="input" v-model="f.compare_label" maxlength="8" placeholder="如：其他平台"></div>
    <div class="form-row"><span></span><div class="muted">学生端显示为"比{{ f.compare_label }}省 X 元"、划线价"{{ f.compare_label }} ¥18"</div></div>
    <h3 style="margin-top:22px">福利群（企业微信）</h3>
    <div class="form-row"><label>群名称</label><input class="input" v-model="f.group_name" maxlength="20"></div>
    <div class="form-row"><label>群介绍</label><input class="input" v-model="f.group_desc" maxlength="60"></div>
    <div class="form-row" style="align-items:start"><label>群二维码</label><div class="row-inline">
      <img v-if="f.group_qr" :src="f.group_qr" class="thumb" style="width:72px;height:72px" @click="S.img = f.group_qr">
      <label class="btn line sm" style="display:inline-flex;align-items:center;cursor:pointer"><input type="file" accept="image/*" hidden @change="upload">{{ busy ? '上传中…' : f.group_qr ? '更换' : '上传二维码' }}</label>
      <button v-if="f.group_qr" class="btn line sm" @click="f.group_qr = ''">移除</button></div></div>
    <div style="text-align:right;margin-top:24px"><button class="btn" @click="save">保存全部设置</button></div>
    </div>
  </div>`,
  setup() {
    const f = ref(null), rate = ref(50), minSaving = ref(1), fee = ref(1.5), rider = ref(1), errandRate = ref(5), marketRate = ref(2), ads = ref([15, 10, 8]), busy = ref(false);
    onMounted(async () => {
      f.value = await api('/settings');
      rate.value = f.value.manager_rate * 100; minSaving.value = f.value.min_saving / 100; fee.value = f.value.delivery_fee / 100; rider.value = f.value.rider_commission / 100;
      errandRate.value = Math.round(f.value.errand_fee_rate * 1000) / 10; marketRate.value = Math.round(f.value.market_fee_rate * 1000) / 10; ads.value = (f.value.ad_prices || []).map((c) => c / 100);
    });
    return {
      f, rate, minSaving, fee, rider, errandRate, marketRate, ads, busy, S,
      async upload(e) {
        const file = e.target.files[0]; e.target.value = ''; if (!file) return;
        busy.value = true;
        const fd = new FormData(); fd.append('file', file);
        try { const res = await (await fetch('/api/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + S.token }, body: fd })).json(); if (res.code === 0) f.value.group_qr = res.data.url; else toast(res.msg); } catch (err) { toast('上传失败'); }
        busy.value = false;
      },
      async save() {
        const c = (y) => Math.round(Number(y) * 100);
        const r = await post('/settings', {
          manager_rate: Number(rate.value) / 100, min_saving: c(minSaving.value), delivery_fee: c(fee.value), rider_commission: c(rider.value),
          takeout_cutoff_minutes: Number(f.value.takeout_cutoff_minutes), merchant_auto_approve: f.value.merchant_auto_approve,
          errand_fee_rate: Number(errandRate.value) / 100, market_fee_rate: Number(marketRate.value) / 100, ad_prices: ads.value.map(c),
          price_slogan: f.value.price_slogan, compare_label: f.value.compare_label, group_name: f.value.group_name, group_desc: f.value.group_desc, group_qr: f.value.group_qr || '',
        }).catch(() => null);
        if (r) toast('设置已保存');
      },
    };
  },
};

const PAGES = [
  { g: '经营' },
  { k: 'dashboard', t: '数据看板', i: 'dashboard', c: Dashboard },
  { k: 'revenue', t: '收益分配', i: 'pie', c: Revenue },
  { k: 'orders', t: '订单', i: 'receipt', c: Orders },
  { k: 'ledger', t: '资金流水', i: 'banknote', c: Ledger },
  { g: '商家与营销' },
  { k: 'merchants', t: '商家审核', i: 'store', c: Merchants, b: 'pending_merchants' },
  { k: 'deals', t: '商品比价', i: 'tag', c: Deals },
  { k: 'promotions', t: '首页推荐位', i: 'crown', c: Promotions, b: 'pending_promotions' },
  { k: 'coupons', t: '优惠券', i: 'ticket', c: Coupons },
  { g: '校园与用户' },
  { k: 'schools', t: '学校管理', i: 'school', c: Schools, b: 'applying_schools' },
  { k: 'users', t: '用户与团队', i: 'users', c: Users, b: 'pending_riders' },
  { k: 'treehole', t: '树洞审核', i: 'treehole', c: Treehole, b: 'reported_posts' },
  { k: 'faqs', t: '百事通知识库', i: 'ai', c: Faqs, b: 'unanswered' },
  { g: '系统' },
  { k: 'settings', t: '平台参数', i: 'settings', c: Settings },
];

const Login = {
  template: `<div class="login"><div class="box">
    <div class="logo-lg"><Icon name="school" :size="26" /></div>
    <h2>校园生活 · 管理后台</h2><div class="muted">仅平台管理员可登录</div>
    <input class="input" v-model="phone" placeholder="管理员手机号"><input class="input" v-model="code" placeholder="验证码（演示 1234）" @keyup.enter="login">
    <button class="btn" @click="login">登录</button>
    <button class="btn line" @click="demo">演示管理员一键登录</button>
  </div></div>`,
  setup() {
    const phone = ref(''), code = ref('');
    const done = async (r) => { if (r.user.role !== 'admin') return toast('该账号不是管理员'); S.token = r.token; set('admin_token', r.token); await boot(); };
    return {
      phone, code,
      login: async () => { try { await done(await api('/api/auth/login', { method: 'POST', body: { phone: phone.value, code: code.value } })); } catch (e) {} },
      demo: async () => { try { await done(await api('/api/auth/demo', { method: 'POST', body: { role: 'admin' } })); } catch (e) {} },
    };
  },
};

const Root = {
  components: { Login },
  template: `<Login v-if="!S.user" />
    <div v-else class="layout">
      <aside class="side"><div class="brand"><div class="logo"><Icon name="school" :size="19" /></div><div>校园生活<div class="sub">平台管理后台</div></div></div>
        <nav class="menu"><template v-for="p in PAGES" :key="p.k || p.g"><div v-if="p.g" class="menu-group">{{ p.g }}</div>
          <button v-else :class="{ on: S.page === p.k }" @click="nav(p.k)"><Icon :name="p.i" :size="17" />{{ p.t }}<span v-if="p.b && S.todo[p.b]" class="badge">{{ S.todo[p.b] }}</span></button></template></nav>
        <div class="foot">{{ S.user.nickname }} · <button @click="logout">退出</button><div style="margin-top:6px"><a href="/" style="color:#80838d">返回手机预览</a></div></div></aside>
      <main class="main">
        <div class="topbar"><h1>{{ cur.t }}</h1><span style="flex:1"></span>
          <label class="muted">学校筛选</label><select class="input" v-model="S.schoolFilter" style="height:32px;border:1px solid var(--line);border-radius:6px"><option value="">全部学校</option><option v-for="s in S.schools" :key="s.id" :value="s.id">{{ s.name }}</option></select></div>
        <div class="content"><component :is="cur.c" :key="S.page" /></div>
      </main>
    </div>
    <div v-if="S.img" class="imgview" @click="S.img = ''"><img :src="S.img" alt="证照"></div>
    <div v-if="S.toast" class="toast">{{ S.toast }}</div>`,
  setup() {
    const cur = computed(() => PAGES.find((p) => p.k && p.k === S.page) || PAGES[1]);
    return { S, PAGES, cur, nav: (k) => (location.hash = '#/' + k), logout() { set('admin_token', ''); S.token = ''; S.user = null; } };
  },
};

async function boot() {
  if (!S.token) return;
  try {
    const u = await api('/api/auth/me');
    if (u.role !== 'admin') { set('admin_token', ''); S.token = ''; return toast('该账号不是管理员'); }
    S.user = u;
    S.schools = (await api('/schools')).filter((s) => s.status !== 'applying');
    refreshTodo();
  } catch (e) {}
}
window.addEventListener('hashchange', () => (S.page = location.hash.slice(2) || 'dashboard'));
S.schoolFilter = '';
const app = createApp(Root);
app.component('Icon', Icon);
Object.assign(app.config.globalProperties, G);
app.mount('#app');
boot();
