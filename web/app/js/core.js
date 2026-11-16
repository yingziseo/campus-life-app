/* 校园生活 H5 原型 · 核心：状态、接口、路由、通用组件
 * 页面与微信小程序一一对应：#/path ⇔ pages/path，api() ⇔ wx.request 封装
 */
const { createApp, reactive, ref, computed, watch, onMounted, nextTick } = Vue;

/* ---------------- 全局状态 ---------------- */
const store = reactive({
  token: safeGet('token'),
  user: null,
  config: { price_slogan: '全平台低价', compare_label: '其他平台', errand_fee_rate: 0.05, market_fee_rate: 0.02, delivery_fee: 150, rider_commission: 100, group: {} },
  img: '',        // 全屏看图
  photo: null,    // 拍照上传弹层 { title, desc, resolve }
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
/** 拍照上传留证（送达凭证等），返回图片地址；取消返回 null */
function askPhoto(title, desc = '') {
  return new Promise((resolve) => (store.photo = { title, desc, url: '', resolve }));
}
const cmpLabel = () => store.config.compare_label || '其他平台';
const feePct = (r) => Math.round(Number(r || 0) * 1000) / 10 + '%';

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

/** 图片上传：前端先压缩到最长边 1280px 的 JPEG，再以 multipart 上传；返回 /uploads/... 地址 */
async function uploadImage(file) {
  const blob = await compressImage(file, 1280, 0.82);
  const fd = new FormData();
  fd.append('file', blob, 'image.jpg');
  const res = await fetch('/api/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + store.token }, body: fd });
  const json = await res.json().catch(() => ({ code: -1, msg: '上传失败' }));
  if (json.code !== 0) { toast(json.msg || '上传失败'); throw new ApiError(json.msg, json.code); }
  return json.data.url;
}
function compressImage(file, maxSide, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('压缩失败'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法读取图片')); toast('无法读取该图片'); };
    img.src = url;
  });
}

function setToken(t) { store.token = t; safeSet('token', t); }

async function refreshMe() {
  store.user = await api('/auth/me', { silent: true });
  applyRoleTheme();
  return store.user;
}
function applyRoleTheme() {
  const riderPage = store.route.route?.meta.tabs === 'rider';
  document.body.className = store.user ? 'role-' + (riderPage ? 'rider' : store.user.role) : '';
}
function roleHome(role) {
  return { merchant: '/m', manager: '/g', rider: '/r' }[role] || '/';
}
const isRider = () => store.user?.rider_status === 'approved';

/* ---------------- 路由（hash） ---------------- */
const routes = [];
/** meta: { tab: 底部高亮项, role: 限定角色, guest: 无需登录, school: 需选学校(默认学生需要) } */
function defineRoute(pattern, component, meta = {}) {
  const keys = [];
  // :id 只匹配数字，避免与 /market/orders 这类静态路径冲突
  const regex = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), k === 'id' ? '(\\d+)' : '([^/]+)')) + '$');
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
    if (meta.rider && !isRider()) return go('/me', true);
    if (!meta.guest && meta.school !== false && store.user.role === 'student' && !store.user.school && r.path !== '/school') return go('/school', true);
  }
  store.route = r;
  applyRoleTheme();
  try { parent !== window && parent.postMessage({ type: 'campus-route', path: r.full, role: meta.tabs === 'rider' ? 'rider' : store.user?.role || '' }, '*'); } catch (e) {}
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

/* ---------------- 视觉规范：类目配色与图标 ---------------- */
const CAT = {
  food:      { name: '美食',     icon: 'food',      grad: ['#ffa05c', '#ff5a3c'] },
  takeout:   { name: '校园外卖', icon: 'takeout',   grad: ['#46c6f2', '#1489de'] },
  netcafe:   { name: '网吧',     icon: 'netcafe',   grad: ['#8592ff', '#4c55e6'] },
  billiards: { name: '台球',     icon: 'billiards', grad: ['#34d2b2', '#0b9f86'] },
  homestay:  { name: '民宿',     icon: 'homestay',  grad: ['#ffc955', '#f39a0b'] },
  ktv:       { name: 'KTV',      icon: 'ktv',       grad: ['#ff85b6', '#e64a8a'] },
  other:     { name: '其他',     icon: 'other',     grad: ['#aab3c3', '#7a8597'] },
  // 校园服务
  errand:    { name: '跑腿',     icon: 'errand',    grad: ['#ffb14d', '#ff7417'] },
  express:   { name: '代取快递', icon: 'express',   grad: ['#62a3ff', '#2f6bff'] },
  market:    { name: '二手',     icon: 'market',    grad: ['#3ad79f', '#0fa36e'] },
  treehole:  { name: '树洞',     icon: 'treehole',  grad: ['#ad8fff', '#7a4cf5'] },
  coupons:   { name: '领券',     icon: 'ticket',    grad: ['#ff7d6b', '#f2373a'] },
  ai:        { name: '百事通',   icon: 'ai',        grad: ['#8b6cff', '#3d8bff'] },
  groupbuy:  { name: '到店团购', icon: 'ticket',    grad: ['#ffa05c', '#ff5a3c'] },
  // 二手分类
  book:      { name: '教材',     icon: 'book',      grad: ['#6caaff', '#3a78ef'] },
  digital:   { name: '数码',     icon: 'digital',   grad: ['#8f93fb', '#5a5ee2'] },
  daily:     { name: '生活',     icon: 'daily',     grad: ['#ffb763', '#f2842a'] },
  sport:     { name: '运动',     icon: 'sport',     grad: ['#40d6a4', '#13a674'] },
};
const catOf = (c) => CAT[c] || CAT.other;
const gradOf = (c) => { const g = catOf(c).grad; return `linear-gradient(135deg, ${g[0]} 0%, ${g[1]} 100%)`; };
/** 商品封面类目：外卖单列，其余按商家类目 */
const dealCat = (d) => (d.type === 'takeout' ? 'takeout' : d.category || 'groupbuy');
const AVATAR_COLORS = ['#ff8a5b', '#5b9dff', '#36c28a', '#a07cff', '#ffb648', '#ff6f91', '#4cc3d9'];
const avatarColor = (s = '') => AVATAR_COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
const TOPIC_COLORS = { 日常: ['#eef4ff', '#2f6bff'], 表白: ['#fff0f6', '#e64a8a'], 吐槽: ['#fff6e5', '#d97706'], 求助: ['#ecfdf3', '#0f9f6e'], 失物招领: ['#f3efff', '#6e4ae6'] };
const topicStyle = (t) => { const c = TOPIC_COLORS[t] || ['#f2f3f5', '#545b68']; return { background: c[0], color: c[1] }; };

const STATUS = {
  order: { pending_pay: ['待支付', 'warn'], paid: ['待使用', 'brand'], ready: ['待取餐', 'brand'], delivering: ['配送中', 'info'], completed: ['已完成', 'ok'], cancelled: ['已取消', ''], refunded: ['已退款', ''] },
  errand: { open: ['待接单', 'warn'], accepted: ['已接单', 'brand'], delivered: ['已送达', 'info'], completed: ['已完成', 'ok'], cancelled: ['已取消', ''] },
  merchant: { pending: ['待审核', 'warn'], approved: ['已通过', 'ok'], rejected: ['已驳回', ''] },
  market: { on_sale: ['在售', 'ok'], reserved: ['交易中', 'warn'], sold: ['已售出', ''], off: ['已下架', ''] },
  trade: { paid: ['待当面交易', 'warn'], completed: ['交易成功', 'ok'], cancelled: ['已取消', ''] },
  promo: { pending: ['待审核', 'warn'], active: ['投放中', 'ok'], rejected: ['已驳回', ''], ended: ['已结束', ''] },
};
const statusText = (type, s) => (STATUS[type]?.[s] || [s])[0];
/** 订单状态文案区分团购/外卖 */
const orderStatus = (o) => (o.type === 'takeout' && o.status === 'paid' ? '商家备餐中' : o.type === 'takeout' && o.status === 'ready' ? '已出餐，待骑手取餐' : statusText('order', o.status));
const statusCls = (type, s) => 'tag ' + ((STATUS[type]?.[s] || [])[1] || '');

/* ---------------- 通用组件 ---------------- */
/** Lucide 线性图标 */
const Icon = {
  props: { name: String, size: { type: [Number, String], default: 22 }, stroke: { type: [Number, String], default: 1.8 } },
  template: `<svg class="i" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" :stroke-width="stroke" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="ICONS[name] || ''"></svg>`,
  setup() { return { ICONS }; },
};

const NavBar = {
  props: { title: String, back: { type: [Boolean, String], default: false }, variant: { type: String, default: '' } },
  template: `<div class="nav" :class="variant">
      <button v-if="back" class="nav-back" @click="goBack" aria-label="返回"><Icon name="back" :size="24" /></button>
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
    { key: 'm-home', text: '工作台', icon: 'dashboard', path: '/m' },
    { key: 'm-deals', text: '商品', icon: 'store', path: '/m/deals' },
    { key: 'm-verify', text: '核销', icon: 'scan', path: '/m/verify' },
    { key: 'm-orders', text: '订单', icon: 'receipt', path: '/m/orders' },
    { key: 'me', text: '我的', icon: 'user', path: '/me' },
  ],
  rider: [
    { key: 'r-home', text: '配送任务', icon: 'route', path: '/r' },
    { key: 'r-earnings', text: '我的收入', icon: 'wallet', path: '/r/earnings' },
    { key: 'back', text: '学生端', icon: 'swap', path: '/' },
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
  props: { active: String, set: String },
  template: `<nav class="tabbar">
      <button v-for="t in tabs" :key="t.key" class="tab" :class="{ on: t.key === active }" @click="tap(t)" :aria-label="t.text || '发布'">
        <span v-if="t.action" class="plus"><Icon :name="t.icon" :size="24" :stroke="2.4" /></span>
        <template v-else><Icon :name="t.icon" :size="23" :stroke="t.key === active ? 2.1 : 1.7" /><span>{{ t.text }}</span></template>
      </button>
    </nav>`,
  computed: { tabs() { return TABS[this.set || store.user?.role] || TABS.student; } },
  methods: { tap(t) { t.action ? (store.sheet = t.action) : go(t.path, true); } },
};

const Empty = {
  props: { text: { type: String, default: '暂无内容' }, icon: { type: String, default: 'box' } },
  template: `<div class="empty"><div class="ico"><Icon :name="icon" :size="32" :stroke="1.5" /></div><div>{{ text }}</div><slot /></div>`,
};
const Loading = { template: `<div class="loading"><span class="spinner"></span>加载中</div>` };

/** 进度条：current 为当前步骤下标，-1 表示未开始 */
const Steps = {
  props: { items: Array, current: Number },
  template: `<div class="steps">
      <div class="bar" :style="{ width: (Math.max(0, current) / (items.length - 1) * 80) + '%' }"></div>
      <div v-for="(s, i) in items" :key="s" class="step" :class="{ done: i < current, cur: i === current }">
        <i><Icon v-if="i < current" name="check" :size="11" :stroke="3.5" /></i>{{ s }}</div>
    </div>`,
};

/** 发布入口底部弹层（学生端中间 + 号） */
const PublishSheet = {
  template: `<div class="mask" @click.self="close"><div class="sheet">
      <div class="sheet-title">发布</div>
      <div class="sheet-grid">
        <button class="entry" v-for="e in entries" :key="e.c" @click="open(e.path)">
          <div class="tile" :style="{ background: gradOf(e.c) }"><Icon :name="catOf(e.c).icon" :size="26" :stroke="2" /></div>{{ e.text }}
        </button>
      </div>
      <button class="btn ghost block" style="box-shadow:none;background:#f5f6f8" @click="close">取消</button>
    </div></div>`,
  setup() {
    const entries = [
      { c: 'errand', text: '跑腿', path: '/errands/new?type=errand' },
      { c: 'express', text: '代取快递', path: '/errands/new?type=express' },
      { c: 'market', text: '卖闲置', path: '/market/new' },
      { c: 'treehole', text: '发树洞', path: '/treehole/new' },
    ];
    const close = () => (store.sheet = null);
    return { entries, close, gradOf, catOf, open: (p) => { close(); go(p); } };
  },
};

/** 多图选择上传（max=1 时为单图） */
const ImagePicker = {
  props: { modelValue: { type: [Array, String], default: () => [] }, max: { type: Number, default: 6 }, label: { type: String, default: '添加图片' }, icon: { type: String, default: 'image' }, large: Boolean },
  emits: ['update:modelValue'],
  template: `<div class="pics">
      <div v-for="(u, i) in list" :key="u" class="pic" :class="{ lg: large }"><img :src="u" alt=""><button class="pic-del" @click="remove(i)" aria-label="删除"><Icon name="x" :size="12" :stroke="2.5" /></button></div>
      <label v-if="list.length < max" class="pic add" :class="{ busy, lg: large }">
        <input type="file" accept="image/*" :multiple="max > 1" @change="pick" hidden>
        <template v-if="busy"><span class="spinner"></span><small>上传中</small></template>
        <template v-else><Icon :name="icon" :size="large ? 30 : 24" :stroke="1.6" /><small>{{ label }}</small></template>
      </label>
    </div>`,
  setup(props, { emit }) {
    const busy = ref(false);
    const list = computed(() => (Array.isArray(props.modelValue) ? props.modelValue : props.modelValue ? [props.modelValue] : []));
    const emitList = (arr) => emit('update:modelValue', props.max === 1 ? (arr[0] || '') : arr);
    async function pick(e) {
      const files = [...e.target.files].slice(0, props.max - list.value.length);
      e.target.value = '';
      if (!files.length) return;
      busy.value = true;
      const out = [...list.value];
      try { for (const f of files) out.push(await uploadImage(f)); } catch (err) {}
      busy.value = false;
      emitList(out);
    }
    return { list, busy, pick, remove: (i) => emitList(list.value.filter((_, j) => j !== i)) };
  },
};

/** 封面：有图显示图片，没图用类目渐变 + 线性图标占位 */
const Cover = {
  props: { src: String, cat: { type: String, default: 'other' }, icon: { type: Number, default: 30 }, cls: { type: String, default: '' } },
  template: `<div class="cover-box" :class="cls" :style="{ background: src ? '#eef1f4' : gradOf(cat) }">
      <img v-if="src" :src="src" alt="" loading="lazy"><div v-else class="ph"><Icon :name="catOf(cat).icon" :size="icon" :stroke="1.6" /></div><slot /></div>`,
  setup() { return { gradOf, catOf }; },
};

/** 价格：¥ 小号 + 金额 */
const Price = {
  props: { v: [Number, String], size: { type: String, default: '' } },
  template: `<span class="price" :class="size"><small>¥</small>{{ yuan(v) }}</span>`,
  setup() { return { yuan }; },
};

const Globals = { Icon, NavBar, TabBar, Empty, Loading, Steps, ImagePicker, Cover, Price };
