/* 学生端：登录、选学校、首页、跑腿/快递、二手、树洞、AI 问答、我的 */

/* ---------- 登录 ---------- */
defineRoute('/login', {
  template: `<div class="page" style="background:var(--card)">
    <div class="splash">
      <div class="logo">校</div>
      <h2 style="margin:20px 0 4px">欢迎来到校园生活</h2>
      <p class="muted" style="font-size:14px">跑腿 · 快递 · 二手 · 树洞 · 周边比美团更省</p>
      <div class="form" style="margin:24px 0 0;padding:0;background:transparent">
        <div class="field"><label>手机号</label><input v-model="phone" type="tel" maxlength="11" placeholder="请输入手机号"></div>
        <div class="field"><label>验证码</label><input v-model="code" maxlength="6" placeholder="演示环境填 1234">
          <button class="btn sm ghost" @click="sendCode">{{ sent ? '已发送' : '获取验证码' }}</button></div>
      </div>
      <button class="btn block mt12" style="margin-top:24px" :disabled="busy" @click="login">登录 / 注册</button>
      <p class="muted center mt12">正式版将使用微信一键登录</p>
      <div class="divider" style="margin:28px 0 16px"></div>
      <p class="muted center">演示账号快速体验</p>
      <div class="row" style="justify-content:center;gap:8px">
        <button class="btn sm line" @click="demo('student')">学生</button>
        <button class="btn sm line" @click="demo('merchant')">商家</button>
        <button class="btn sm line" @click="demo('manager')">客户经理</button>
      </div>
    </div></div>`,
  setup() {
    const phone = ref(''), code = ref(''), sent = ref(false), busy = ref(false);
    async function done(res) {
      setToken(res.token);
      await refreshMe();
      go(roleHome(store.user.role), true);
    }
    return {
      phone, code, sent, busy,
      sendCode() { sent.value = true; code.value = '1234'; toast('演示环境验证码：1234'); },
      async login() {
        busy.value = true;
        try { await done(await post('/auth/login', { phone: phone.value, code: code.value })); } catch (e) {} finally { busy.value = false; }
      },
      async demo(role) { try { await done(await post('/auth/demo', { role })); } catch (e) {} },
    };
  },
}, { guest: true });

/* ---------- 选择学校 ---------- */
defineRoute('/school', {
  template: `<NavBar title="选择学校" :back="!!$store.user?.school" />
    <div class="page">
      <div class="pad">
        <div class="search" style="margin:0 0 12px;background:var(--card)"><Icon name="search" :size="16"/>
          <input v-model="kw" placeholder="搜索学校 / 城市" style="border:0;outline:0;flex:1;background:transparent"></div>
        <div v-for="s in filtered" :key="s.id" class="school-item" :class="{ on: s.id === $store.user?.school?.id, disabled: s.status !== 'active' }" @click="pick(s)">
          <div class="thumb sm" :style="{ background: s.is_pilot ? 'var(--primary-soft)' : 'var(--bg)' }">🏫</div>
          <div class="grow">
            <div style="font-weight:600">{{ s.name }}</div>
            <div class="muted">{{ s.city }}</div>
          </div>
          <span v-if="s.is_pilot" class="tag primary">试点</span>
          <span v-else-if="s.status !== 'active'" class="tag">筹备中</span>
        </div>
        <div class="card" style="margin:16px 0 0">
          <div class="card-title">没有我的学校？</div>
          <div class="muted mb8">留下信息，我们会尽快开通，你也可以成为校园合伙人</div>
          <div v-if="!applying"><button class="btn ghost sm" @click="applying = true">申请开通我的学校</button></div>
          <div v-else class="form" style="margin:0;padding:0">
            <div class="field"><label>学校名称</label><input v-model="ap.name" placeholder="全称"></div>
            <div class="field"><label>所在城市</label><input v-model="ap.city"></div>
            <div class="field"><label>联系方式</label><input v-model="ap.contact" placeholder="手机 / 微信"></div>
            <button class="btn block mt12" @click="apply">提交申请</button>
          </div>
        </div>
      </div>
    </div>`,
  setup() {
    const { data } = useLoad(() => api('/schools'));
    const kw = ref(''), applying = ref(false), ap = reactive({ name: '', city: '', contact: '' });
    const filtered = computed(() => (data.value || []).filter((s) => !kw.value || s.name.includes(kw.value) || (s.city || '').includes(kw.value)));
    return {
      kw, filtered, applying, ap,
      async pick(s) {
        if (s.status !== 'active') return toast('该学校筹备中，敬请期待');
        try { await post('/auth/school', { school_id: s.id }); await refreshMe(); toast('已切换到 ' + s.name); go('/', true); } catch (e) {}
      },
      async apply() { try { const r = await post('/schools/apply', ap); toast(r.message); applying.value = false; } catch (e) {} },
    };
  },
}, { school: false });

/* ---------- 首页 ---------- */
defineRoute('/', {
  template: `<NavBar title="校园生活" variant="brand" />
    <div class="page with-bar">
      <div class="hero">
        <button class="school-pill" @click="go('/school')"><Icon name="location" :size="14"/>{{ $store.user.school?.name }}<Icon name="right" :size="12"/></button>
        <div class="search" @click="go('/local')"><Icon name="search" :size="16"/>搜索周边美食、网吧、台球…</div>
        <div class="banner" @click="go('/local')">
          <div><h3>周边吃喝玩乐</h3><p>同一家店，比美团再省 <b style="color:var(--save)">3 元起</b></p></div>
          <div class="big">🍱</div>
        </div>
      </div>
      <div class="card" style="margin-top:12px;padding:4px 0">
        <div class="grid4">
          <div class="entry" @click="go('/errands?type=errand')"><div class="ico" style="background:#fff1e6">🏃</div>跑腿</div>
          <div class="entry" @click="go('/errands?type=express')"><div class="ico" style="background:#e9f7ff">📦</div>代取快递</div>
          <div class="entry" @click="go('/market')"><div class="ico" style="background:#eafaf0">♻️</div>二手</div>
          <div class="entry" @click="go('/treehole')"><div class="ico" style="background:#f2eefe">🌳</div>树洞</div>
          <div class="entry" @click="go('/local?cat=takeout')"><div class="ico" style="background:#e9f7ff">🛵</div>校园外卖</div>
          <div class="entry" @click="go('/local?cat=food')"><div class="ico" style="background:#fff1e6">🍜</div>美食团购</div>
          <div class="entry" @click="go('/local?cat=netcafe')"><div class="ico" style="background:#eef0ff">🎮</div>网吧</div>
          <div class="entry" @click="go('/local?cat=billiards')"><div class="ico" style="background:#eafaf0">🎱</div>台球</div>
        </div>
      </div>
      <div class="card ai-entry" @click="go('/ai')">
        <div class="ico">AI</div>
        <div class="grow"><div style="font-weight:600">问一问 · 新生百事通</div><div class="muted">报到、校园卡、快递点、怎么用平台…</div></div>
        <Icon name="right" :size="16" class="muted" />
      </div>
      <template v-if="data">
        <div class="section-title">热门团购 <small @click="go('/local')">更多 ›</small></div>
        <div class="deal-grid">
          <div v-for="d in data.hot_deals" :key="d.id" class="deal-card" @click="go('/local/deal/' + d.id)">
            <div class="cover" :style="{ background: catOf(d.type === 'takeout' ? 'takeout' : d.category).bg }">
              {{ catOf(d.type === 'takeout' ? 'takeout' : d.category).emoji }}
              <span class="tag save">省{{ yuan(d.saving) }}元</span>
            </div>
            <div class="body">
              <div class="title ellipsis">{{ d.title }}</div>
              <div class="muted ellipsis">{{ d.merchant_name }}</div>
              <div class="row mt8"><span class="price"><small>¥</small>{{ yuan(d.sale_price) }}</span><span class="strike">美团¥{{ yuan(d.competitor_price) }}</span></div>
            </div>
          </div>
        </div>
        <div class="section-title">树洞热议 <small @click="go('/treehole')">进入树洞 ›</small></div>
        <div v-for="p in data.treehole" :key="p.id" class="post" @click="go('/treehole/' + p.id)">
          <div class="post-head"><div class="avatar" :style="{ background: avatarColor(p.anon_name) }">{{ p.anon_name.slice(-2, -1) }}</div>
            <div class="grow"><div style="font-weight:600;font-size:13px">{{ p.anon_name }}</div><div class="muted">{{ timeAgo(p.created_at) }}</div></div>
            <span class="tag primary">{{ p.tag }}</span></div>
          <div class="post-content clamp2">{{ p.content }}</div>
        </div>
        <div class="card"><div class="stats">
          <div class="stat"><b>{{ data.stats.open_errands }}</b><span>待接跑腿</span></div>
          <div class="stat"><b>{{ data.stats.market_items }}</b><span>在售二手</span></div>
          <div class="stat"><b>{{ data.stats.merchants }}</b><span>入驻商家</span></div>
        </div></div>
      </template>
      <div v-else class="loading">加载中…</div>
    </div>`,
  setup() { const { data } = useLoad(() => api('/home')); return { data }; },
}, { tab: 'home', role: 'student' });

/* ---------- 跑腿 / 代取快递 ---------- */
const ErrandCard = {
  props: { e: Object },
  template: `<div class="card" @click="go('/errands/' + e.id)" style="cursor:pointer">
      <div class="row between"><div class="row grow"><span class="tag" :class="e.type === 'express' ? 'primary' : 'warn'">{{ e.type === 'express' ? '代取快递' : '跑腿' }}</span>
        <b class="ellipsis grow">{{ e.title }}</b></div><span class="price">¥{{ yuan(e.reward) }}</span></div>
      <div class="muted mt8"><div class="ellipsis">取：{{ e.pickup_addr || '-' }}</div><div class="ellipsis">送：{{ e.deliver_addr }}</div></div>
      <div class="row between mt8"><span class="muted">{{ e.user_nickname }} · {{ timeAgo(e.created_at) }}</span><span :class="statusCls('errand', e.status)">{{ statusText('errand', e.status) }}</span></div>
    </div>`,
};

defineRoute('/errands', {
  components: { ErrandCard },
  template: `<NavBar title="跑腿 · 代取快递" back />
    <div class="seg">
      <button v-for="t in tabs" :key="t.v" :class="{ on: type === t.v }" @click="type = t.v">{{ t.t }}</button>
      <button :class="{ on: type === 'mine' }" @click="type = 'mine'">我的</button>
    </div>
    <div class="page" style="padding-top:10px;padding-bottom:80px">
      <div v-if="loading && !data" class="loading">加载中…</div>
      <Empty v-else-if="!data?.length" text="还没有人发布，来做第一个吧" icon="🏃" />
      <ErrandCard v-for="e in data" :key="e.id" :e="e" />
    </div>
    <div class="action-bar"><button class="btn block" @click="go('/errands/new?type=' + (type === 'express' ? 'express' : 'errand'))">+ 发布{{ type === 'express' ? '代取快递' : '跑腿' }}</button></div>`,
  setup() {
    const type = ref(store.route.query.type || 'errand');
    const tabs = [{ v: 'errand', t: '跑腿' }, { v: 'express', t: '代取快递' }];
    const { data, loading, load } = useLoad(() => (type.value === 'mine' ? api('/errands/mine') : api('/errands', { query: { type: type.value } })));
    watch(type, () => load());
    return { type, tabs, data, loading };
  },
}, { role: 'student' });

defineRoute('/errands/new', {
  template: `<NavBar :title="isExpress ? '发布代取快递' : '发布跑腿'" back />
    <div class="page" style="padding-top:12px;padding-bottom:90px">
      <div class="form">
        <div class="field"><label>标题</label><input v-model="f.title" :placeholder="isExpress ? '如：菜鸟中件送5号楼' : '如：二食堂带份饭'"></div>
        <template v-if="isExpress">
          <div class="field"><label>快递驿站</label><input v-model="f.express_station" placeholder="如：菜鸟驿站(东门)"></div>
          <div class="field"><label>取件码</label><input v-model="f.express_code" placeholder="仅接单人可见"></div>
          <div class="field"><label>包裹大小</label><div class="chips" style="justify-content:flex-end;flex:1">
            <span v-for="s in sizes" :key="s.v" class="chip" :class="{ on: f.size === s.v }" @click="f.size = s.v">{{ s.t }}</span></div></div>
        </template>
        <div v-else class="field"><label>取件/购买</label><input v-model="f.pickup_addr" placeholder="去哪里取/买"></div>
        <div class="field"><label>送达地点</label><input v-model="f.deliver_addr" placeholder="宿舍楼号 / 教室"></div>
        <div class="field"><label>赏金</label><input v-model="f.reward" type="number" placeholder="1 ~ 200"><span class="unit">元</span></div>
        <div class="field col"><label>补充说明</label><textarea v-model="f.description" maxlength="300" placeholder="选填"></textarea></div>
      </div>
      <div class="hint">原型阶段赏金线下支付；正式版下单预付，完成后自动打给接单同学。</div>
    </div>
    <div class="action-bar"><button class="btn block" :disabled="busy" @click="submit">发布</button></div>`,
  setup() {
    const isExpress = store.route.query.type === 'express';
    const f = reactive({ type: isExpress ? 'express' : 'errand', title: '', express_station: '', express_code: '', size: 'small', pickup_addr: '', deliver_addr: '', reward: isExpress ? 3 : 5, description: '' });
    const busy = ref(false);
    const sizes = [{ v: 'small', t: '小件' }, { v: 'medium', t: '中件' }, { v: 'large', t: '大件' }];
    return {
      isExpress, f, busy, sizes,
      async submit() {
        busy.value = true;
        try { const e = await post('/errands', f); toast('发布成功'); go('/errands/' + e.id, true); } catch (e) {} finally { busy.value = false; }
      },
    };
  },
}, { role: 'student' });

defineRoute('/errands/:id', {
  template: `<NavBar title="订单详情" back="/errands" />
    <div class="page" style="padding-top:12px;padding-bottom:90px" v-if="e">
      <div class="card">
        <Steps :items="['待接单','已接单','已送达','已完成']" :current="stepIdx" />
      </div>
      <div class="card">
        <div class="row between"><b style="font-size:16px">{{ e.title }}</b><span class="price">¥{{ yuan(e.reward) }}</span></div>
        <div class="mt8"><span class="tag" :class="e.type === 'express' ? 'primary' : 'warn'">{{ e.type === 'express' ? '代取快递' : '跑腿' }}</span>
          <span :class="statusCls('errand', e.status)" style="margin-left:6px">{{ statusText('errand', e.status) }}</span></div>
        <div class="divider"></div>
        <div class="quote" style="background:transparent;padding:0">
          <div class="line"><span class="muted">取件/购买</span><span>{{ e.pickup_addr || '-' }}</span></div>
          <div class="line"><span class="muted">送达地点</span><span>{{ e.deliver_addr }}</span></div>
          <template v-if="e.type === 'express'">
            <div class="line"><span class="muted">包裹大小</span><span>{{ { small: '小件', medium: '中件', large: '大件' }[e.size] }}</span></div>
            <div class="line"><span class="muted">取件码</span><b :style="{ color: e.is_owner || e.is_runner ? 'var(--primary-ink)' : 'var(--ink-3)' }">{{ e.express_code }}</b></div>
          </template>
          <div class="line"><span class="muted">发布人</span><span>{{ e.user_nickname }}</span></div>
          <div class="line" v-if="e.runner_nickname"><span class="muted">接单人</span><span>{{ e.runner_nickname }}</span></div>
          <div class="line"><span class="muted">发布时间</span><span>{{ shortTime(e.created_at) }}</span></div>
        </div>
        <div v-if="e.description" class="mt8 ink2">{{ e.description }}</div>
      </div>
    </div>
    <div class="action-bar" v-if="e && actions.length">
      <button v-for="a in actions" :key="a.k" class="btn" :class="[a.cls, { block: actions.length === 1 }]" style="flex:1" @click="act(a)">{{ a.t }}</button>
    </div>`,
  setup() {
    const { data: e, load } = useLoad(() => api('/errands/' + store.route.params.id));
    const stepIdx = computed(() => ({ open: 0, accepted: 1, delivered: 2, completed: 3, cancelled: 0 })[e.value?.status] ?? 0);
    const actions = computed(() => {
      const x = e.value; if (!x) return [];
      if (x.is_owner && x.status === 'open') return [{ k: 'cancel', t: '取消发布', cls: 'line' }];
      if (x.is_owner && ['accepted', 'delivered'].includes(x.status)) return [{ k: 'complete', t: '确认完成' }];
      if (x.is_runner && x.status === 'accepted') return [{ k: 'deliver', t: '我已送达' }];
      if (!x.is_owner && x.status === 'open') return [{ k: 'accept', t: '立即接单 · 赚 ¥' + yuan(x.reward) }];
      return [];
    });
    return {
      e, stepIdx, actions,
      async act(a) {
        if (a.k === 'cancel' && !(await confirmBox('确定取消发布？'))) return;
        try { e.value = await post(`/errands/${e.value.id}/${a.k}`); toast({ accept: '接单成功，取件码已显示', deliver: '已通知发布人', complete: '订单已完成', cancel: '已取消' }[a.k]); } catch (err) { load(); }
      },
    };
  },
}, { role: 'student' });

/* ---------- 二手 ---------- */
const MARKET_CATS = [{ v: '', t: '全部' }, { v: 'book', t: '教材' }, { v: 'digital', t: '数码' }, { v: 'daily', t: '生活' }, { v: 'sport', t: '运动' }, { v: 'other', t: '其他' }];
const marketEmoji = (c) => ({ book: '📚', digital: '💻', daily: '🧺', sport: '🚲' }[c] || '🎁');

defineRoute('/market', {
  template: `<NavBar title="二手交易" back />
    <div class="seg"><button v-for="c in cats" :key="c.v" :class="{ on: cat === c.v }" @click="cat = c.v">{{ c.t }}</button></div>
    <div class="page" style="padding-bottom:80px">
      <div class="pad" style="padding-bottom:0"><div class="search" style="margin:0;background:var(--card)"><Icon name="search" :size="16"/>
        <input v-model="kw" @keyup.enter="load()" placeholder="搜索宝贝" style="border:0;outline:0;flex:1;background:transparent"></div></div>
      <div v-if="loading && !data" class="loading">加载中…</div>
      <Empty v-else-if="!data?.length" text="暂无在售物品" icon="♻️" />
      <div class="deal-grid" style="margin-top:12px">
        <div v-for="i in data" :key="i.id" class="deal-card" @click="go('/market/' + i.id)">
          <Cover cls="cover" :src="i.images[0]" :emoji="marketEmoji(i.category)" bg="#f3f6f4"><span class="tag ok">{{ i.item_condition }}</span></Cover>
          <div class="body"><div class="title clamp2" style="min-height:38px">{{ i.title }}</div>
            <div class="row mt8"><span class="price"><small>¥</small>{{ yuan(i.price) }}</span><span v-if="i.original_price" class="strike">¥{{ yuan(i.original_price) }}</span></div>
            <div class="muted ellipsis">{{ i.nickname }} · {{ timeAgo(i.created_at) }}</div></div>
        </div>
      </div>
    </div>
    <div class="action-bar"><button class="btn block" @click="go('/market/new')">+ 发布闲置</button></div>`,
  setup() {
    const cat = ref(''), kw = ref('');
    const { data, loading, load } = useLoad(() => api('/market', { query: { category: cat.value, keyword: kw.value } }));
    watch(cat, () => load());
    return { cats: MARKET_CATS, cat, kw, data, loading, load, marketEmoji };
  },
}, { role: 'student' });

defineRoute('/market/new', {
  template: `<NavBar title="发布闲置" back />
    <div class="page" style="padding-top:12px;padding-bottom:90px">
      <div class="form">
        <div class="field"><label>标题</label><input v-model="f.title" placeholder="品牌型号，一句话说清楚"></div>
        <div class="field col"><label>描述</label><textarea v-model="f.description" placeholder="新旧程度、入手渠道、转手原因…"></textarea></div>
        <div class="field col"><label>图片 <span class="muted">（最多 6 张，有图卖得更快）</span></label><ImagePicker v-model="f.images" :max="6" /></div>
      </div>
      <div class="form">
        <div class="field"><label>分类</label><div class="chips" style="justify-content:flex-end;flex:1">
          <span v-for="c in cats" :key="c.v" class="chip" :class="{ on: f.category === c.v }" @click="f.category = c.v">{{ c.t }}</span></div></div>
        <div class="field"><label>成色</label><div class="chips" style="justify-content:flex-end;flex:1">
          <span v-for="c in conds" :key="c" class="chip" :class="{ on: f.item_condition === c }" @click="f.item_condition = c">{{ c }}</span></div></div>
        <div class="field"><label>价格</label><input v-model="f.price" type="number" placeholder="0.00"><span class="unit">元</span></div>
        <div class="field"><label>原价</label><input v-model="f.original_price" type="number" placeholder="选填"><span class="unit">元</span></div>
        <div class="field"><label>联系方式</label><input v-model="f.contact" placeholder="微信 / 手机"></div>
      </div>
    </div>
    <div class="action-bar"><button class="btn block" :disabled="busy" @click="submit">发布</button></div>`,
  setup() {
    const f = reactive({ title: '', description: '', category: 'book', item_condition: '9成新', price: '', original_price: '', contact: '', images: [] });
    const busy = ref(false);
    return {
      f, busy, cats: MARKET_CATS.slice(1), conds: ['全新', '95新', '9成新', '8成新', '7成新'],
      async submit() { busy.value = true; try { const i = await post('/market', f); toast('发布成功'); go('/market/' + i.id, true); } catch (e) {} finally { busy.value = false; } },
    };
  },
}, { role: 'student' });

defineRoute('/market/:id', {
  template: `<NavBar title="宝贝详情" back="/market" />
    <div class="page" style="padding-bottom:90px" v-if="i">
      <div v-if="i.images.length" class="gallery"><img v-for="u in i.images" :key="u" :src="u" alt=""></div>
      <div v-else style="height:220px;display:flex;align-items:center;justify-content:center;font-size:90px;background:#eef3ef">{{ marketEmoji(i.category) }}</div>
      <div v-if="i.images.length > 1" class="muted center" style="margin-top:-30px;position:relative;color:#fff">左右滑动查看 {{ i.images.length }} 张</div>
      <div class="card" style="margin-top:-14px;position:relative">
        <div class="row"><span class="price lg"><small>¥</small>{{ yuan(i.price) }}</span><span v-if="i.original_price" class="strike">原价 ¥{{ yuan(i.original_price) }}</span>
          <span class="grow"></span><span :class="statusCls('market', i.status)">{{ statusText('market', i.status) }}</span></div>
        <h3 style="margin:8px 0 4px">{{ i.title }}</h3>
        <div class="row"><span class="tag ok">{{ i.item_condition }}</span><span class="muted">{{ i.views }} 人看过 · {{ timeAgo(i.created_at) }}</span></div>
        <p class="ink2" style="white-space:pre-wrap">{{ i.description || '卖家很懒，什么也没写' }}</p>
      </div>
      <div class="card row"><div class="avatar" :style="{ background: avatarColor(i.nickname) }">{{ i.nickname.slice(0, 1) }}</div>
        <div class="grow"><b>{{ i.nickname }}</b><div class="muted">同校同学 · {{ $store.user.school?.short_name || $store.user.school?.name }}</div></div></div>
    </div>
    <div class="action-bar" v-if="i">
      <template v-if="i.is_owner">
        <button v-if="i.status === 'on_sale'" class="btn line" style="flex:1" @click="setStatus('reserved')">标记已预订</button>
        <button v-if="i.status !== 'sold'" class="btn" style="flex:1" @click="setStatus('sold')">标记已售出</button>
        <button v-if="i.status === 'sold'" class="btn line block" @click="setStatus('on_sale')">重新上架</button>
      </template>
      <button v-else class="btn block" @click="contact">联系卖家</button>
    </div>`,
  setup() {
    const { data: i } = useLoad(() => api('/market/' + store.route.params.id));
    return {
      i, marketEmoji,
      contact() { confirmBox('联系卖家', '联系方式：' + i.value.contact + '\n\n站内私信将在 v0.2 上线', '知道了', '关闭'); },
      async setStatus(s) { try { await post(`/market/${i.value.id}/status`, { status: s }); i.value.status = s; toast('已更新'); } catch (e) {} },
    };
  },
}, { role: 'student' });

/* ---------- 树洞 ---------- */
const TREE_TAGS = ['日常', '表白', '吐槽', '求助', '失物招领'];
const PostCard = {
  props: { p: Object, full: Boolean },
  emits: ['like'],
  components: { Icon },
  methods: { report(p) { ReportSheet.post = p; } },
  template: `<div class="post" @click="!full && go('/treehole/' + p.id)" :style="{ cursor: full ? 'default' : 'pointer' }">
      <div class="post-head"><div class="avatar" :style="{ background: avatarColor(p.anon_name) }">{{ p.anon_name.slice(-2, -1) }}</div>
        <div class="grow"><div style="font-weight:600;font-size:13px">{{ p.anon_name }}</div><div class="muted">{{ timeAgo(p.created_at) }}</div></div>
        <span class="tag primary">{{ p.tag }}</span></div>
      <div class="post-content" :class="{ clamp2: !full }">{{ p.content }}</div>
      <div class="post-foot">
        <button :class="{ liked: p.liked }" @click.stop="$emit('like', p)"><Icon name="heart" :size="16" />{{ p.like_count || '点赞' }}</button>
        <button><Icon name="chat" :size="16" />{{ p.comment_count || '评论' }}</button>
        <button v-if="full" style="margin-left:auto" @click.stop="report(p)">举报</button>
      </div>
    </div>`,
};
const ReportSheet = reactive({ post: null });
async function toggleLike(p) {
  try { const r = await post(`/treehole/${p.id}/like`); p.liked = r.liked; p.like_count = r.like_count; } catch (e) {}
}

defineRoute('/treehole', {
  components: { PostCard },
  template: `<NavBar title="树洞" back />
    <div class="seg"><button :class="{ on: tag === '' }" @click="tag = ''">全部</button>
      <button v-for="t in tags" :key="t" :class="{ on: tag === t }" @click="tag = t">{{ t }}</button></div>
    <div class="page" style="padding-top:10px;padding-bottom:80px">
      <div class="notice" style="margin-top:0">🌳 匿名发言，请友善交流。违规内容将被处理。</div>
      <div v-if="loading && !data" class="loading">加载中…</div>
      <Empty v-else-if="!data?.length" text="这里还很安静" icon="🌳" />
      <PostCard v-for="p in data" :key="p.id" :p="p" @like="toggleLike" />
    </div>
    <div class="action-bar"><button class="btn block" @click="go('/treehole/new')">+ 匿名发一条</button></div>`,
  setup() {
    const tag = ref('');
    const { data, loading, load } = useLoad(() => api('/treehole', { query: { tag: tag.value } }));
    watch(tag, () => load());
    return { tag, tags: TREE_TAGS, data, loading, toggleLike };
  },
}, { role: 'student' });

defineRoute('/treehole/new', {
  template: `<NavBar title="匿名发帖" back />
    <div class="page" style="padding-top:12px;padding-bottom:90px">
      <div class="form"><div class="field col"><textarea v-model="content" maxlength="500" style="min-height:160px" placeholder="说点什么吧…系统会为你生成一个匿名身份"></textarea>
        <div class="muted" style="text-align:right">{{ content.length }}/500</div></div></div>
      <div class="pad"><div class="muted mb8">选择话题</div><div class="chips">
        <span v-for="t in tags" :key="t" class="chip" :class="{ on: tag === t }" @click="tag = t">{{ t }}</span></div></div>
    </div>
    <div class="action-bar"><button class="btn block" :disabled="!content.trim() || busy" @click="submit">发布</button></div>`,
  setup() {
    const content = ref(''), tag = ref('日常'), busy = ref(false);
    return {
      content, tag, busy, tags: TREE_TAGS,
      async submit() { busy.value = true; try { const p = await post('/treehole', { content: content.value, tag: tag.value }); toast('已发布，你的匿名身份：' + p.anon_name, 2400); go('/treehole/' + p.id, true); } catch (e) {} finally { busy.value = false; } },
    };
  },
}, { role: 'student' });

defineRoute('/treehole/:id', {
  components: { PostCard },
  template: `<NavBar title="树洞" back="/treehole" />
    <div class="page" style="padding-top:12px;padding-bottom:80px" v-if="data">
      <PostCard :p="data.post" full @like="toggleLike" />
      <div class="section-title" style="padding-top:4px">评论 {{ data.comments.length }}</div>
      <Empty v-if="!data.comments.length" text="还没有评论，抢个沙发" icon="💬" />
      <div class="card flush" v-else>
        <div v-for="c in data.comments" :key="c.id" class="list-item" style="cursor:default">
          <div class="avatar" :style="{ background: c.anon_name === '洞主' ? 'var(--primary)' : avatarColor(c.anon_name) }">{{ c.anon_name === '洞主' ? '主' : c.anon_name.slice(-2, -1) }}</div>
          <div class="grow"><div class="row between"><b style="font-size:13px">{{ c.anon_name }}</b><span class="muted">{{ timeAgo(c.created_at) }}</span></div><div>{{ c.content }}</div></div>
        </div>
      </div>
    </div>
    <div class="chat-input"><input v-model="text" maxlength="200" placeholder="友善评论…" @keyup.enter="send"><button class="btn" :disabled="!text.trim()" @click="send">发送</button></div>
    <div v-if="rs.post" class="mask" @click.self="rs.post = null"><div class="sheet">
      <div class="sheet-title">举报原因</div>
      <div class="chips" style="justify-content:center"><span v-for="r in reasons" :key="r" class="chip" @click="doReport(r)">{{ r }}</span></div>
      <p class="muted center">累计多人举报的内容会自动隐藏，等待平台复核</p>
      <button class="btn line block" @click="rs.post = null">取消</button>
    </div></div>`,
  setup() {
    const { data } = useLoad(() => api(`/treehole/${store.route.params.id}/comments`));
    const text = ref('');
    ReportSheet.post = null;
    return {
      data, text, rs: ReportSheet, reasons: ['人身攻击', '色情低俗', '广告引流', '虚假信息', '泄露隐私', '其他'],
      async doReport(reason) {
        const p = ReportSheet.post; ReportSheet.post = null;
        try { const r = await post(`/treehole/${p.id}/report`, { reason }); toast(r.message); } catch (e) {}
      },
      toggleLike: async (p) => { await toggleLike(p); },
      async send() {
        try { const c = await post(`/treehole/${data.value.post.id}/comments`, { content: text.value }); data.value.comments.push(c); data.value.post.comment_count++; text.value = ''; } catch (e) {}
      },
    };
  },
}, { role: 'student' });

/* ---------- AI 问答（预留） ---------- */
defineRoute('/ai', {
  template: `<NavBar title="问一问" back />
    <div class="page" style="padding-bottom:70px" ref="box">
      <div class="notice">🤖 AI 智能问答即将接入，目前由校园知识库为你解答</div>
      <div class="chat">
        <div class="msg bot">你好，我是{{ $store.user.school?.short_name || '校园' }}百事通～ 新生报到、校园卡、快递点、平台怎么用，都可以问我。</div>
        <div v-if="hot.length" class="msg bot" style="padding:8px">
          <div class="muted" style="padding:2px 4px 6px">大家都在问</div>
          <div class="chips"><span v-for="h in hot" :key="h.id" class="chip" @click="ask(h.question)">{{ h.question }}</span></div>
        </div>
        <template v-for="(m, i) in msgs" :key="i">
          <div class="msg" :class="m.me ? 'me' : 'bot'">{{ m.text }}
            <div v-if="m.source === 'faq'" class="muted" style="margin-top:6px">来自校园知识库</div>
            <div v-if="m.related?.length" class="chips mt8"><span v-for="r in m.related" :key="r.id" class="chip" @click="ask(r.question)">{{ r.question }}</span></div>
          </div>
        </template>
        <div v-if="thinking" class="msg bot muted">正在思考…</div>
      </div>
    </div>
    <div class="chat-input"><input v-model="q" maxlength="200" placeholder="输入你的问题" @keyup.enter="ask()"><button class="btn" :disabled="!q.trim() || thinking" @click="ask()">发送</button></div>`,
  setup() {
    const q = ref(''), msgs = ref([]), hot = ref([]), thinking = ref(false), box = ref(null);
    onMounted(async () => { try { hot.value = await api('/ai/hot', { silent: true }); } catch (e) {} });
    const scroll = () => nextTick(() => box.value && (box.value.scrollTop = box.value.scrollHeight));
    async function ask(text) {
      const question = (text || q.value).trim();
      if (!question) return;
      msgs.value.push({ me: true, text: question }); q.value = ''; thinking.value = true; scroll();
      try { const r = await post('/ai/ask', { question }); msgs.value.push({ text: r.answer, source: r.source, related: r.related }); }
      catch (e) { msgs.value.push({ text: '网络开小差了，再试一次吧' }); }
      thinking.value = false; scroll();
    }
    return { q, msgs, hot, thinking, ask, box };
  },
}, { school: false });

/* ---------- 我的（三端共用） ---------- */
defineRoute('/me', {
  template: `<NavBar title="我的" />
    <div class="page with-bar">
      <div class="hero-card row" style="gap:14px">
        <div class="avatar" style="width:56px;height:56px;font-size:22px;background:rgba(255,255,255,.25)">{{ u.nickname.slice(0, 1) }}</div>
        <div class="grow"><div style="font-size:18px;font-weight:700">{{ u.nickname }}</div>
          <div style="opacity:.8;font-size:12px">{{ u.phone }} · {{ roleName }}</div>
          <div style="opacity:.8;font-size:12px" v-if="u.school">{{ u.school.name }}</div></div>
      </div>
      <div class="card flush">
        <template v-if="u.role === 'student'">
          <div class="cell" @click="go('/orders')"><Icon name="receipt" :size="18"/><span class="grow">我的订单</span><Icon name="right" :size="14" class="arrow"/></div>
          <div class="cell" @click="go('/errands?type=mine')"><Icon name="swap" :size="18"/><span class="grow">我的跑腿</span><Icon name="right" :size="14" class="arrow"/></div>
          <div class="cell" @click="go('/school')"><Icon name="location" :size="18"/><span class="grow">切换学校</span><span class="muted">{{ u.school?.short_name }}</span><Icon name="right" :size="14" class="arrow"/></div>
        </template>
        <div class="cell" v-if="u.rider_status === 'approved'" @click="go('/r')"><span style="font-size:18px">🛵</span><span class="grow">骑手工作台</span><span class="tag primary">外卖团队</span><Icon name="right" :size="14" class="arrow"/></div>
        <div class="cell" v-if="u.role === 'merchant'" @click="go('/m/shop')"><Icon name="store" :size="18"/><span class="grow">店铺设置</span><Icon name="right" :size="14" class="arrow"/></div>
        <div class="cell" v-if="u.role === 'manager'" @click="go('/g')"><Icon name="chart" :size="18"/><span class="grow">我的邀请码</span><b style="letter-spacing:2px">{{ u.invite_code }}</b><Icon name="right" :size="14" class="arrow"/></div>
        <div class="cell" @click="go('/ai')"><Icon name="chat" :size="18"/><span class="grow">问一问 · 帮助中心</span><Icon name="right" :size="14" class="arrow"/></div>
      </div>
      <div class="card flush" v-if="u.role === 'student'">
        <div class="cell" v-if="u.rider_status !== 'approved'" @click="joinRider"><span style="font-size:18px">🛵</span><span class="grow">加入校园外卖团队</span>
          <span class="muted">{{ u.rider_status === 'pending' ? '审核中' : '课余兼职，每单提成' }}</span><Icon name="right" :size="14" class="arrow"/></div>
        <div class="cell" @click="go('/merchant-apply')"><span style="font-size:18px">🏪</span><span class="grow">商家入驻</span><span class="muted">比美团更低抽佣</span><Icon name="right" :size="14" class="arrow"/></div>
      </div>
      <div class="card flush">
        <div class="cell" @click="editName"><span class="grow">修改昵称</span><Icon name="right" :size="14" class="arrow"/></div>
        <div class="cell" @click="logout"><span class="grow" style="color:var(--save)">退出登录</span></div>
      </div>
      <p class="muted center">校园生活 v0.1 原型 · 演示数据均为虚构</p>
    </div>`,
  setup() {
    const u = computed(() => store.user);
    const roleName = computed(() => ({ student: '学生', merchant: '商家', manager: '客户经理', admin: '管理员' })[u.value.role]);
    return {
      u, roleName,
      async joinRider() {
        if (u.value.rider_status === 'pending') return toast('申请审核中，请耐心等待');
        if (!(await confirmBox('加入校园外卖团队', '每天固定时间点集中配送，送一单提成 1 元，课余时间就能做。\n提交后由平台审核。', '提交申请'))) return;
        try { await post('/rider/apply'); await refreshMe(); toast('申请已提交'); } catch (e) {}
      },
      async editName() {
        const name = prompt('新的昵称', u.value.nickname);
        if (!name) return;
        try { store.user = await post('/auth/profile', { nickname: name }); toast('已修改'); } catch (e) {}
      },
      async logout() {
        if (!(await confirmBox('确定退出登录？'))) return;
        try { await post('/auth/logout', {}, { silent: true }); } catch (e) {}
        setToken(''); store.user = null; applyRoleTheme(); go('/login', true);
      },
    };
  },
}, { tab: 'me', school: false });

defineRoute('/404', { template: `<NavBar title="页面不存在" back /><Empty text="页面走丢了" icon="🧭"><button class="btn mt12" @click="go(roleHome($store.user?.role), true)">回首页</button></Empty>` }, { guest: true });
