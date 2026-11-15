/* 校园生活 H5 原型 · 核心：状态、接口、路由、通用组件
 * 页面与微信小程序一一对应：#/path ⇔ pages/path，api() ⇔ wx.request 封装
 */
const { createApp, reactive, ref, computed, watch, onMounted, nextTick } = Vue;

/* ---------------- 全局状态 ---------------- */
const store = reactive({
  token: safeGet('token'),
  user: null,
  ready: false,
  toast: '',
  dialog: null,   // { title, content, okText, cancelText, resolve }
  sheet: null,    // 自定义底部弹层名
  route: { path: '/', params: {}, query: {} },
});

function safeGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function safeSet(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} }

/* ---------------- 工具 ---------------- */
const yuan = (cents) => {
  if (cents === null || cents === undefined || cents === '') return '-';
  const s = (Number(cents) / 100).toFixed(2);
  return s.replace(/\.?0+$/, '');
};
const pct = (x) => Math.round(x * 100) + '%';
function timeAgo(str) {
  if (!str) return '';
  const t = new Date(str.replace(/-/g, '/')).getTime();
  const d = (Date.now() - t) / 1000;
  if (d < 60) return '刚刚';
  if (d < 3600) return Math.floor(d / 60) + ' 分钟前';
  if (d < 86400) return Math.floor(d / 3600) + ' 小时前';
  if (d < 86400 * 7) return Math.floor(d / 86400) + ' 天前';
  return str.slice(5, 10);
}
const shortTime = (s) => (s ? s.slice(5, 16) : '');
function todayStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

let toastTimer = null;
function toast(msg, ms = 1800) {
  store.toast = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (store.toast = ''), ms);
}
function confirmBox(title, content = '', okText = '确定', cancelText = '取消') {
  return new Promise((resolve) => (store.dialog = { title, content, okText, cancelText, resolve }));
}

/* ---------------- 接口 ---------------- */
class ApiError extends Error { constructor(msg, code) { super(msg); this.code = code; } }

async function api(path, { method = 'GET', body, silent = false, query } = {}) {
  let url = '/api' + path;
  if (query) {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null)).toString();
    if (qs) url += '?' + qs;
  }
  const headers = { 'Content-Type': 'application/json' };
  if (store.token) headers.Authorization = 'Bearer ' + store.token;
  let json;
  try {
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    json = await res.json();
  } catch (e) {
    json = { code: -1, msg: '网络开小差了，请稍后再试' };
  }
  if (json.code === 0) return json.data;
  if (json.code === 401) { setToken(''); store.user = null; go('/login'); }
  else if (json.code === 412 && /学校/.test(json.msg)) go('/school');
  if (!silent) toast(json.msg || '请求失败');
  throw new ApiError(json.msg, json.code);
}
const post = (path, body, opt = {}) => api(path, { ...opt, method: 'POST', body: body || {} });

function setToken(t) { store.token = t; safeSet('token', t); }

async function refreshMe() {
  store.user = await api('/auth/me', { silent: true });
  applyRoleTheme();
  return store.user;
}
function applyRoleTheme() {
  document.body.className = store.user ? 'role-' + store.user.role : '';
}
function roleHome(role) {
  return { merchant: '/m', manager: '/g' }[role] || '/';
}

/* ---------------- 路由（hash） ---------------- */
const routes = [];
/** meta: { tab: 底部高亮项, role: 限定角色, guest: 无需登录, school: 需选学校(默认学生需要) } */
function defineRoute(pattern, component, meta = {}) {
  const keys = [];
  const regex = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ pattern, regex, keys, component, meta });
}
function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs));
  for (const r of routes) {
    const m = path.match(r.regex);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { path, params, query, route: r, full: raw };
    }
  }
  return { path, params: {}, query, route: routes.find((r) => r.pattern === '/404'), full: raw };
}
function go(path, replace = false) {
  const target = '#' + path;
  if (location.hash === target) return syncRoute();
  replace ? location.replace(target) : (location.hash = target);
}
function back(fallback) {
  if (history.length > 1 && store.navDepth > 0) history.back();
  else go(fallback || roleHome(store.user?.role), true);
}
store.navDepth = 0;

function syncRoute() {
  const r = parseHash();
  const meta = r.route?.meta || {};
  // 守卫
  if (!meta.guest && !store.user) return go('/login', true);
  if (store.user) {
    if (meta.role && meta.role !== store.user.role) return go(roleHome(store.user.role), true);
    if (!meta.guest && meta.school !== false && store.user.role === 'student' && !store.user.school && r.path !== '/school') return go('/school', true);
  }
  store.route = r;
  try { parent !== window && parent.postMessage({ type: 'campus-route', path: r.full, role: store.user?.role || '' }, '*'); } catch (e) {}
}
window.addEventListener('hashchange', () => { store.navDepth++; syncRoute(); });

/* ---------------- 页面数据加载 ---------------- */
function useLoad(loader, immediate = true) {
  const data = ref(null);
  const loading = ref(false);
  const error = ref('');
  async function load(...args) {
    loading.value = true;
    error.value = '';
    try { data.value = await loader(...args); }
    catch (e) { error.value = e.message; }
    finally { loading.value = false; }
    return data.value;
  }
  if (immediate) onMounted(load);
  return { data, loading, error, load };
}

/* ---------------- 视觉辅助 ---------------- */
const CAT = {
  food:      { name: '美食', emoji: '🍜', bg: '#fff1e6' },
  takeout:   { name: '校园外卖', emoji: '🛵', bg: '#e9f7ff' },
  netcafe:   { name: '网吧', emoji: '🎮', bg: '#eef0ff' },
  billiards: { name: '台球', emoji: '🎱', bg: '#eafaf0' },
  homestay:  { name: '民宿', emoji: '🏡', bg: '#fff6e0' },
  ktv:       { name: 'KTV', emoji: '🎤', bg: '#ffeef6' },
  other:     { name: '其他', emoji: '🛍️', bg: '#f1f2f5' },
};
const catOf = (c) => CAT[c] || CAT.other;
const AVATAR_COLORS = ['#ff8a5b', '#5b9dff', '#36c28a', '#a07cff', '#ffb648', '#ff6f91', '#4cc3d9'];
const avatarColor = (s = '') => AVATAR_COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];

const STATUS = {
  order: { pending_pay: ['待支付', 'warn'], paid: ['待使用', 'primary'], delivering: ['配送中', 'primary'], completed: ['已完成', 'ok'], cancelled: ['已取消', ''], refunded: ['已退款', ''] },
  errand: { open: ['待接单', 'warn'], accepted: ['已接单', 'primary'], delivered: ['已送达', 'primary'], completed: ['已完成', 'ok'], cancelled: ['已取消', ''] },
  merchant: { pending: ['待审核', 'warn'], approved: ['已通过', 'ok'], rejected: ['已驳回', ''] },
  market: { on_sale: ['在售', 'ok'], reserved: ['已预订', 'warn'], sold: ['已售出', ''], off: ['已下架', ''] },
};
const statusText = (type, s) => (STATUS[type]?.[s] || [s])[0];
/** 订单状态文案区分团购/外卖：外卖已支付显示"待配送" */
const orderStatus = (o) => (o.type === 'takeout' && o.status === 'paid' ? '待配送' : statusText('order', o.status));
const statusCls = (type, s) => 'tag ' + ((STATUS[type]?.[s] || [])[1] || '');

/* ---------------- 图标 ---------------- */
const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm3.5-12.5-2 5-5 2 2-5z',
  plus: 'M12 5v14M5 12h14',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0',
  back: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  chat: 'M4 5h16v11H9l-5 4z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 3-4.5-4.5',
  scan: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M4 12h16',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  wallet: 'M3 7h18v13H3zM3 7l3-4h12l3 4M16 13h2',
  store: 'M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6',
  location: 'M12 21s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12zm0-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-14v5l3 2',
  swap: 'M7 7h13l-4-4M17 17H4l4 4',
  calc: 'M6 3h12v18H6zM9 7h6M9 12h1M14 12h1M9 16h1M14 16h1',
};
const Icon = {
  props: { name: String, size: { type: [Number, String], default: 22 }, stroke: { type: Number, default: 1.8 } },
  template: `<svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" :stroke-width="stroke" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="ICONS[name]"/></svg>`,
  setup() { return { ICONS }; },
};

/* ---------------- 通用组件 ---------------- */
const NavBar = {
  props: { title: String, back: { type: [Boolean, String], default: false }, variant: { type: String, default: '' } },
  components: { Icon },
  template: `<div class="nav" :class="variant">
      <button v-if="back" class="nav-back" @click="goBack" aria-label="返回"><Icon name="back" /></button>
      <div v-else class="nav-left"><slot name="left" /></div>
      <div class="nav-title">{{ title }}</div>
      <div class="capsule" aria-hidden="true"><span><i></i></span><span><b></b></span></div>
    </div>`,
  methods: { goBack() { back(typeof this.back === 'string' ? this.back : undefined); } },
};

const TABS = {
  student: [
    { key: 'home', text: '首页', icon: 'home', path: '/' },
    { key: 'local', text: '周边', icon: 'compass', path: '/local' },
    { key: 'publish', text: '', icon: 'plus', action: 'publish' },
    { key: 'orders', text: '订单', icon: 'receipt', path: '/orders' },
    { key: 'me', text: '我的', icon: 'user', path: '/me' },
  ],
  merchant: [
    { key: 'm-home', text: '工作台', icon: 'grid', path: '/m' },
    { key: 'm-deals', text: '商品', icon: 'store', path: '/m/deals' },
    { key: 'm-verify', text: '核销', icon: 'scan', path: '/m/verify' },
    { key: 'm-orders', text: '订单', icon: 'receipt', path: '/m/orders' },
    { key: 'me', text: '我的', icon: 'user', path: '/me' },
  ],
  manager: [
    { key: 'g-home', text: '概览', icon: 'chart', path: '/g' },
    { key: 'g-merchants', text: '商家', icon: 'store', path: '/g/merchants' },
    { key: 'g-calc', text: '定价试算', icon: 'calc', path: '/g/calc' },
    { key: 'g-commissions', text: '佣金', icon: 'wallet', path: '/g/commissions' },
    { key: 'me', text: '我的', icon: 'user', path: '/me' },
  ],
};
const TabBar = {
  props: { active: String },
  components: { Icon },
  template: `<nav class="tabbar">
      <button v-for="t in tabs" :key="t.key" class="tab" :class="{ on: t.key === active }" @click="tap(t)">
        <span v-if="t.action" class="plus"><Icon :name="t.icon" :size="24" :stroke="2.4" /></span>
        <template v-else><Icon :name="t.icon" /><span>{{ t.text }}</span></template>
      </button>
    </nav>`,
  computed: { tabs() { return TABS[store.user?.role] || TABS.student; } },
  methods: { tap(t) { t.action ? (store.sheet = t.action) : go(t.path, true); } },
};

const Empty = {
  props: { text: { type: String, default: '暂无内容' }, icon: { type: String, default: '🍃' } },
  template: `<div class="empty"><div class="ico">{{ icon }}</div><div>{{ text }}</div><slot /></div>`,
};

const Steps = {
  props: { items: Array, current: Number },
  template: `<div class="steps"><div v-for="(s, i) in items" :key="s" class="step" :class="{ on: i <= current }"><i></i>{{ s }}</div></div>`,
};

/** 发布入口底部弹层（学生端中间 + 号） */
const PublishSheet = {
  template: `<div class="mask" @click.self="close"><div class="sheet">
      <div class="sheet-title">发布</div>
      <div class="sheet-grid">
        <div class="entry" v-for="e in entries" :key="e.text" @click="open(e.path)">
          <div class="ico" :style="{ background: e.bg }">{{ e.emoji }}</div>{{ e.text }}
        </div>
      </div>
      <button class="btn line block" @click="close">取消</button>
    </div></div>`,
  setup() {
    const entries = [
      { text: '跑腿', emoji: '🏃', bg: '#fff1e6', path: '/errands/new?type=errand' },
      { text: '代取快递', emoji: '📦', bg: '#e9f7ff', path: '/errands/new?type=express' },
      { text: '卖二手', emoji: '♻️', bg: '#eafaf0', path: '/market/new' },
      { text: '发树洞', emoji: '🌳', bg: '#f2eefe', path: '/treehole/new' },
    ];
    const close = () => (store.sheet = null);
    return { entries, close, open: (p) => { close(); go(p); } };
  },
};

const Globals = { Icon, NavBar, TabBar, Empty, Steps };
const helpers = { orderStatus, yuan, pct, timeAgo, shortTime, catOf, avatarColor, statusText, statusCls, store };
