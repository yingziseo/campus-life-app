/* 学生端：登录、选学校、首页、跑腿/快递、二手（担保交易）、树洞、学校百事通、领券中心、钱包、我的 */

/* ---------- 登录 ---------- */
defineRoute('/login', {
  template: `<div class="page" style="background:var(--card);position:relative">
    <div class="login-bg"></div>
    <div class="splash">
      <div class="logo"><Icon name="school" :size="34" :stroke="1.8" /></div>
      <h2 style="margin:22px 0 6px;font-size:26px">你好，欢迎来到校园生活</h2>
      <p class="muted" style="font-size:14px;margin:0">跑腿 · 代取快递 · 二手 · 树洞 · 周边{{ $store.config.price_slogan }}</p>
      <div style="margin-top:30px">
        <div class="login-field"><Icon name="phone" :size="18" class="muted" /><input v-model="phone" type="tel" maxlength="11" placeholder="请输入手机号"></div>
        <div class="login-field"><Icon name="shield" :size="18" class="muted" /><input v-model="code" maxlength="6" placeholder="验证码（演示环境 1234）">
          <button class="btn xs soft" @click="sendCode">{{ sent ? '已发送' : '获取验证码' }}</button></div>
      </div>
      <button class="btn block" style="margin-top:28px" :disabled="busy" @click="login">登录 / 注册</button>
      <p class="muted center mt12">正式版使用微信手机号一键登录</p>
      <div class="row" style="margin:36px 0 4px;gap:10px"><div class="grow divider" style="margin:0"></div><span class="muted">演示账号快速体验</span><div class="grow divider" style="margin:0"></div></div>
      <div class="role-grid">
        <button v-for="r in roles" :key="r.k" @click="demo(r.k)"><span class="tile" :style="{ background: r.bg, width: '36px', height: '36px', borderRadius: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }"><Icon :name="r.i" :size="19" /></span>{{ r.t }}</button>
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
      roles: [
        { k: 'student', t: '学生', i: 'user', bg: 'linear-gradient(135deg,#ffa05c,#ff5f1f)' },
        { k: 'merchant', t: '商家', i: 'store', bg: 'linear-gradient(135deg,#4f86ff,#2357f0)' },
        { k: 'manager', t: '客户经理', i: 'handshake', bg: 'linear-gradient(135deg,#8a68ff,#5d3bd9)' },
        { k: 'rider', t: '骑手', i: 'takeout', bg: 'linear-gradient(135deg,#22c0b2,#0a8f8a)' },
      ],
      sendCode() { sent.value = true; code.value = '1234'; toast('演示环境验证码：1234'); },
      async login() {
        busy.value = true;
        try { await done(await post('/auth/login', { phone: phone.value, code: code.value })); } catch (e) {} finally { busy.value = false; }
      },
      async demo(role) {
        try { await done(await post('/auth/demo', { role })); if (role === 'rider') go('/r', true); } catch (e) {}
      },
    };
  },
}, { guest: true });

/* ---------- 选择学校 ---------- */
defineRoute('/school', {
  template: `<NavBar title="选择学校" :back="!!$store.user?.school" />
    <div class="page">
      <div class="pad">
        <div class="search-input"><Icon name="search" :size="17" /><input v-model="kw" placeholder="搜索学校 / 城市"></div>
        <div class="muted" style="margin:14px 2px 8px">已开通与筹备中的学校</div>
        <div v-for="s in filtered" :key="s.id" class="school-item" :class="{ on: s.id === $store.user?.school?.id, disabled: s.status !== 'active', pilot: s.is_pilot }" @click="pick(s)">
          <div class="ico"><Icon name="school" :size="22" /></div>
          <div class="grow"><div class="b">{{ s.name }}</div><div class="muted">{{ s.city }}</div></div>
          <span v-if="s.is_pilot" class="tag brand lg">试点学校</span>
          <span v-else-if="s.status !== 'active'" class="tag lg">筹备中</span>
          <Icon v-if="s.id === $store.user?.school?.id" name="check-circle" :size="20" style="color:var(--brand)" />
        </div>
        <div class="card" style="margin:16px 0 0">
          <div class="card-title"><Icon name="megaphone" :size="18" />没有我的学校？</div>
          <div class="muted mt4 mb8">留下信息，我们会尽快开通，你也可以成为校园合伙人</div>
          <button v-if="!applying" class="btn sm soft" @click="applying = true">申请开通我的学校</button>
          <template v-else>
            <div class="field"><label>学校名称</label><input v-model="ap.name" placeholder="全称"></div>
            <div class="field"><label>所在城市</label><input v-model="ap.city" placeholder="如：青岛"></div>
            <div class="field"><label>联系方式</label><input v-model="ap.contact" placeholder="手机 / 微信"></div>
            <button class="btn block mt12" @click="apply">提交申请</button>
          </template>
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

/* ---------- 商品卡片（首页推荐 / 周边） ---------- */
const DealCard = {
  props: { d: Object },
  template: `<div class="deal-card" @click="go('/local/deal/' + d.id)">
      <Cover cls="cover" :src="d.image || d.merchant_cover" :cat="dealCat(d)" :icon="40">
        <span v-if="d.is_ad" class="tag ad corner tr">广告</span>
        <span class="tag save-solid corner bl">省{{ yuan(d.saving) }}元</span>
      </Cover>
      <div class="body">
        <div class="title clamp2">{{ d.title }}</div>
        <div class="shop"><Icon name="store" :size="12" /><span class="ellipsis">{{ d.merchant_name }}</span></div>
        <div class="foot"><Price :v="d.sale_price" size="md" /><span class="strike">¥{{ yuan(d.competitor_price) }}</span><span class="sold">已售{{ d.sold }}</span></div>
      </div>
    </div>`,
};

/* ---------- 首页 ---------- */
defineRoute('/', {
  components: { DealCard },
  template: `<div class="page with-bar" style="position:relative">
      <div class="home-bg"></div>
      <NavBar title="校园生活" variant="brand" style="position:relative;z-index:2" />
      <div class="home-top">
        <button class="school-pill" @click="go('/school')"><Icon name="location" :size="17" :stroke="2" /><span>{{ $store.user.school?.name }}</span><Icon name="down" :size="16" :stroke="2" /></button>
        <div class="home-search" @click="go('/local')"><Icon name="search" :size="17" />搜索美食、外卖、网吧、台球<button class="btn">搜索</button></div>
        <div class="slogan"><span><Icon name="shield" :size="13" />{{ $store.config.price_slogan }}</span><span><Icon name="takeout" :size="13" />定时送达</span><span><Icon name="ticket" :size="13" />每日领券</span></div>
      </div>
      <div class="home-main">
        <div class="card" style="margin-top:14px;padding:0">
          <div class="entries">
            <button v-for="e in entries" :key="e.t" class="entry" @click="go(e.path)">
              <span v-if="e.flag" class="flag">{{ e.flag }}</span>
              <div class="tile" :style="{ background: gradOf(e.c) }"><Icon :name="e.icon || catOf(e.c).icon" :size="24" :stroke="2" /></div>{{ e.t }}
            </button>
          </div>
        </div>
        <div class="banner" :style="{ background: banners[bi].bg }" @click="go(banners[bi].path)">
          <div style="position:relative;z-index:1"><h3>{{ banners[bi].title }}</h3><p>{{ banners[bi].desc }}</p><span class="cta">{{ banners[bi].cta }}<Icon name="right" :size="13" :stroke="2.4" /></span></div>
          <div class="art"><Icon :name="banners[bi].icon" :size="46" :stroke="1.6" /></div>
          <div class="banner-dots"><i v-for="(b, i) in banners" :key="i" :class="{ on: i === bi }"></i></div>
        </div>
        <div class="card flush ai-card" @click="go('/ai')">
          <div class="ico"><Icon name="ai" :size="22" :stroke="2" /></div>
          <div class="grow"><div class="row" style="gap:6px"><b>学校百事通</b><span class="tag info">AI 问答</span></div>
            <div class="q"><span>新生报到带什么</span><span>校园卡补办</span><span>快递点在哪</span></div></div>
          <Icon name="right" :size="18" class="muted" />
        </div>
        <div class="card flush welfare" v-if="data?.coupons?.length">
          <div class="welfare-head"><Icon name="gift" :size="18" style="color:#e2381b" /><b>今日福利</b><span class="muted">进群每天领券，手慢无</span><span class="grow"></span>
            <button class="link-more" @click="go('/coupons')">领券中心<Icon name="right" :size="14" /></button></div>
          <div class="welfare-row">
            <div v-for="c in data.coupons" :key="c.id" class="mini-coupon" :class="{ got: c.mine, wait: !c.started || (!c.left && !c.mine) }" @click="claim(c)">
              <div class="amt"><small>¥</small>{{ yuan(c.amount) }}</div>
              <div class="cond">{{ c.threshold ? '满' + yuan(c.threshold) + '可用' : '无门槛' }}</div>
              <div class="go">{{ c.mine ? '已领取' : !c.started ? c.start_time + ' 开抢' : c.left ? '立即抢' : '已抢光' }}</div>
            </div>
          </div>
        </div>
        <div class="section"><h3>热门推荐</h3><button class="more" @click="go('/local')">更多<Icon name="right" :size="14" /></button></div>
        <div class="pills" style="padding-top:0">
          <button v-for="c in recCats" :key="c.v" :class="{ on: rc === c.v }" @click="rc = c.v">{{ c.t }}</button>
        </div>
        <Loading v-if="!rec" />
        <Empty v-else-if="!rec.length" text="这个行业还没有商家入驻" icon="store" />
        <div v-else class="deal-grid"><DealCard v-for="d in rec" :key="d.id" :d="d" /></div>
        <p class="muted center" style="margin:10px 0 0;font-size:11px">推荐按销量排序，标注"广告"的为商家推广</p>
        <template v-if="data">
          <div class="section"><h3>树洞热议</h3><button class="more" @click="go('/treehole')">进入树洞<Icon name="right" :size="14" /></button></div>
          <div v-for="p in data.treehole" :key="p.id" class="post" style="cursor:pointer" @click="go('/treehole/' + p.id)">
            <div class="post-head"><div class="avatar" :style="{ background: avatarColor(p.anon_name) }">{{ p.anon_name.slice(-2, -1) }}</div>
              <div class="grow"><div class="b" style="font-size:14px">{{ p.anon_name }}</div><div class="muted">{{ timeAgo(p.created_at) }}</div></div>
              <span class="topic" :style="topicStyle(p.tag)">{{ p.tag }}</span></div>
            <div class="post-content clamp2">{{ p.content }}</div>
            <div class="post-foot"><span class="row" style="gap:4px"><Icon name="heart" :size="15" />{{ p.like_count }}</span><span class="row" style="gap:4px"><Icon name="chat" :size="15" />{{ p.comment_count }}</span></div>
          </div>
        </template>
      </div>
    </div>`,
  setup() {
    const { data, load } = useLoad(() => api('/home'));
    const rc = ref(''), rec = ref(null), bi = ref(0);
    const recCats = [{ v: '', t: '全部' }, { v: 'food', t: '美食' }, { v: 'takeout', t: '校园外卖' }, { v: 'netcafe', t: '网吧' }, { v: 'billiards', t: '台球' }, { v: 'homestay', t: '民宿' }, { v: 'ktv', t: 'KTV' }];
    const loadRec = async () => { rec.value = null; try { rec.value = await api('/local/recommend', { query: { category: rc.value, limit: 6 } }); } catch (e) { rec.value = []; } };
    watch(rc, loadRec);
    onMounted(loadRec);
    const timer = setInterval(() => (bi.value = (bi.value + 1) % 2), 4000);
    Vue.onUnmounted(() => clearInterval(timer));
    return {
      data, rc, rec, recCats, bi,
      entries: [
        { c: 'errand', t: '跑腿', path: '/errands?type=errand' },
        { c: 'express', t: '代取快递', path: '/errands?type=express' },
        { c: 'market', t: '二手', path: '/market' },
        { c: 'treehole', t: '树洞', path: '/treehole' },
        { c: 'coupons', t: '领券中心', path: '/coupons', flag: '天天领' },
        { c: 'takeout', t: '校园外卖', path: '/local?cat=takeout' },
        { c: 'food', t: '美食团购', path: '/local?cat=food' },
        { c: 'netcafe', t: '网吧', path: '/local?cat=netcafe' },
        { c: 'billiards', t: '台球', path: '/local?cat=billiards' },
        { c: 'homestay', t: '民宿', path: '/local?cat=homestay' },
      ],
      banners: [
        { title: '进群领福利', desc: store.config.group?.desc || '每天群内发券', cta: '立即进群', path: '/coupons', icon: 'gift', bg: 'linear-gradient(120deg,#ff7a45 0%,#ff4d3a 60%,#f5303f 100%)' },
        { title: '校园外卖 定时达', desc: '11:30 / 17:30 / 21:00 集中送到取餐点，配送费 ¥' + yuan(store.config.delivery_fee), cta: '去点餐', path: '/local?cat=takeout', icon: 'takeout', bg: 'linear-gradient(120deg,#3fb6f5 0%,#2f7bf0 100%)' },
      ],
      async claim(c) {
        if (c.mine) return go('/coupons');
        if (!c.started) return toast(c.start_time + ' 准时开抢');
        try { await post(`/coupons/${c.id}/claim`); toast('领取成功，下单时自动可用'); load(); } catch (e) {}
      },
    };
  },
}, { tab: 'home', role: 'student' });

/* ---------- 跑腿 / 代取快递 ---------- */
const ErrandCard = {
  props: { e: Object },
  template: `<div class="card tap" @click="go('/errands/' + e.id)">
      <div class="row top">
        <div class="cover-box thumb xs" :style="{ background: gradOf(e.type) }"><Icon :name="catOf(e.type).icon" :size="20" :stroke="2" /></div>
        <div class="grow">
          <div class="row between"><b class="ellipsis grow" style="font-size:15px">{{ e.title }}</b><Price :v="e.reward" /></div>
          <div class="muted mt4 row" style="gap:4px"><Icon name="navigation" :size="12" /><span class="ellipsis">{{ e.pickup_addr || '-' }}</span></div>
          <div class="muted row" style="gap:4px"><Icon name="location" :size="12" /><span class="ellipsis">{{ e.deliver_addr }}</span></div>
        </div>
      </div>
      <div class="dashed" style="margin:10px 0"></div>
      <div class="row between"><span class="muted">{{ e.user_nickname }} · {{ timeAgo(e.created_at) }}</span>
        <span class="row" style="gap:6px"><span class="tag" v-if="e.size">{{ { small: '小件', medium: '中件', large: '大件' }[e.size] }}</span><span :class="statusCls('errand', e.status)">{{ statusText('errand', e.status) }}</span></span></div>
    </div>`,
};

defineRoute('/errands', {
  components: { ErrandCard },
  template: `<NavBar title="跑腿 · 代取快递" back />
    <div class="seg">
      <button v-for="t in tabs" :key="t.v" :class="{ on: type === t.v }" @click="type = t.v">{{ t.t }}</button>
    </div>
    <div class="page with-action" style="padding-top:10px">
      <div class="notice brand" style="margin-top:0" v-if="type !== 'mine'"><Icon name="shield" :size="15" />赏金由平台托管，送达拍照留证，确认完成后打给接单同学</div>
      <Loading v-if="loading && !data" />
      <Empty v-else-if="!data?.length" :text="type === 'mine' ? '还没有发布或接过单' : '还没有人发布，来做第一个吧'" :icon="type === 'express' ? 'express' : 'errand'" />
      <ErrandCard v-for="e in data" :key="e.id" :e="e" />
    </div>
    <div class="action-bar"><button class="btn block" @click="go('/errands/new?type=' + (type === 'express' ? 'express' : 'errand'))"><Icon name="plus" :size="18" :stroke="2.4" />发布{{ type === 'express' ? '代取快递' : '跑腿' }}</button></div>`,
  setup() {
    const type = ref(store.route.query.type || 'errand');
    const tabs = [{ v: 'errand', t: '跑腿' }, { v: 'express', t: '代取快递' }, { v: 'mine', t: '我的' }];
    const { data, loading, load } = useLoad(() => (type.value === 'mine' ? api('/errands/mine') : api('/errands', { query: { type: type.value } })));
    watch(type, () => load());
    return { type, tabs, data, loading };
  },
}, { role: 'student' });

defineRoute('/errands/new', {
  template: `<NavBar :title="isExpress ? '发布代取快递' : '发布跑腿'" back />
    <div class="page with-action" style="padding-top:12px">
      <div class="form">
        <div class="field"><label>标题<span class="req">*</span></label><input v-model="f.title" :placeholder="isExpress ? '如：菜鸟中件送5号楼' : '如：二食堂带份饭'"></div>
        <template v-if="isExpress">
          <div class="field"><label>快递驿站<span class="req">*</span></label><input v-model="f.express_station" placeholder="如：菜鸟驿站(东门)"></div>
          <div class="field"><label>取件码<span class="req">*</span></label><input v-model="f.express_code" placeholder="仅接单人可见"></div>
          <div class="field"><label>包裹大小</label><div class="chips end">
            <span v-for="s in sizes" :key="s.v" class="chip" :class="{ on: f.size === s.v }" @click="f.size = s.v">{{ s.t }}</span></div></div>
        </template>
        <div v-else class="field"><label>取件/购买<span class="req">*</span></label><input v-model="f.pickup_addr" placeholder="去哪里取 / 买"></div>
        <div class="field"><label>送达地点<span class="req">*</span></label><input v-model="f.deliver_addr" placeholder="宿舍楼号 / 教室"></div>
        <div class="field col"><label>补充说明</label><textarea v-model="f.description" maxlength="300" placeholder="选填，如：放门口即可"></textarea></div>
      </div>
      <div class="form">
        <div class="field"><label>赏金<span class="req">*</span></label><input v-model="f.reward" type="number" placeholder="1 ~ 200"><span class="unit">元</span></div>
        <div class="field"><label>快捷选择</label><div class="chips end"><span v-for="v in [2, 3, 5, 8]" :key="v" class="chip" :class="{ on: Number(f.reward) === v }" @click="f.reward = v">¥{{ v }}</span></div></div>
      </div>
      <div class="hint"><Icon name="shield" :size="13" />赏金发布时预付、由平台托管；接单同学送达拍照、你确认完成后到账（平台收取 {{ feePct($store.config.errand_fee_rate) }} 服务费，由赏金中扣除）。未被接单可随时取消，全额退回。</div>
    </div>
    <div class="action-bar">
      <div class="sum"><div><span class="muted">预付赏金 </span><Price :v="cents" size="md" /></div><div class="muted">接单同学到手 ¥{{ yuan(cents - fee) }}</div></div>
      <button class="btn lg" :disabled="busy" @click="submit">支付并发布</button>
    </div>`,
  setup() {
    const isExpress = store.route.query.type === 'express';
    const f = reactive({ type: isExpress ? 'express' : 'errand', title: '', express_station: '', express_code: '', size: 'small', pickup_addr: '', deliver_addr: '', reward: isExpress ? 3 : 5, description: '' });
    const busy = ref(false);
    const cents = computed(() => Math.round(Number(f.reward || 0) * 100));
    const fee = computed(() => Math.floor(cents.value * store.config.errand_fee_rate));
    return {
      isExpress, f, busy, cents, fee, sizes: [{ v: 'small', t: '小件' }, { v: 'medium', t: '中件' }, { v: 'large', t: '大件' }],
      async submit() {
        if (!(await confirmBox('微信支付（模拟）', `预付赏金 ¥${yuan(cents.value)}，由平台托管`, '确认支付'))) return;
        busy.value = true;
        try { const e = await post('/errands', f); toast('发布成功'); go('/errands/' + e.id, true); } catch (e) {} finally { busy.value = false; }
      },
    };
  },
}, { role: 'student' });

defineRoute('/errands/:id', {
  template: `<NavBar title="订单详情" back="/errands" />
    <div class="page with-action" v-if="e">
      <div class="status-head">
        <h2>{{ head.title }}</h2><p>{{ head.desc }}</p>
      </div>
      <div class="card status-card">
        <Steps :items="['待接单','已接单','已送达','已完成']" :current="stepIdx" />
        <div class="ops mt12" v-if="ops.length"><button v-for="a in ops" :key="a.k" class="btn" :class="{ primary: a.primary }" @click="act(a.k)">{{ a.t }}</button></div>
      </div>
      <div class="card" v-if="e.proof_image">
        <div class="card-title"><Icon name="camera" :size="17" />送达凭证</div>
        <div class="proof" @click="$store.img = e.proof_image"><img :src="e.proof_image" alt="送达照片"><span class="tag ad">{{ shortTime(e.delivered_at) }}</span></div>
      </div>
      <div class="card">
        <div class="row between"><b style="font-size:16px" class="grow ellipsis">{{ e.title }}</b><Price :v="e.reward" /></div>
        <div class="row mt8" style="gap:6px"><span class="tag" :class="e.type === 'express' ? 'info' : 'brand'">{{ e.type === 'express' ? '代取快递' : '跑腿' }}</span><span :class="statusCls('errand', e.status)">{{ statusText('errand', e.status) }}</span></div>
        <div class="divider"></div>
        <div class="kv"><span>取件/购买</span><span>{{ e.pickup_addr || '-' }}</span></div>
        <div class="kv"><span>送达地点</span><span>{{ e.deliver_addr }}</span></div>
        <template v-if="e.type === 'express'">
          <div class="kv"><span>包裹大小</span><span>{{ { small: '小件', medium: '中件', large: '大件' }[e.size] }}</span></div>
          <div class="kv"><span>取件码</span><b :style="{ color: e.is_owner || e.is_runner ? 'var(--brand-ink)' : 'var(--ink-3)' }">{{ e.express_code }}</b></div>
        </template>
        <div class="kv" v-if="e.description"><span>补充说明</span><span>{{ e.description }}</span></div>
      </div>
      <div class="card">
        <div class="kv"><span>赏金（平台托管）</span><b>¥{{ yuan(e.reward) }}</b></div>
        <div class="kv"><span>平台服务费 {{ feePct(e.fee_rate) }}</span><span>-¥{{ yuan(e.fee) }}</span></div>
        <div class="kv"><span>接单人到手</span><b style="color:var(--brand-ink)">¥{{ yuan(e.runner_income) }}</b></div>
        <div class="divider"></div>
        <div class="kv"><span>发布人</span><span>{{ e.user_nickname }}</span></div>
        <div class="kv" v-if="e.runner_nickname"><span>接单人</span><span>{{ e.runner_nickname }}</span></div>
        <div class="kv"><span>发布时间</span><span>{{ shortTime(e.created_at) }}</span></div>
      </div>
    </div>
    <div class="action-bar" v-if="e && main">
      <div class="sum" v-if="main.k === 'accept'"><div class="muted">送达后到手</div><Price :v="e.runner_income" size="md" /></div>
      <button class="btn" :class="main.k === 'accept' ? 'lg' : 'block'" :style="main.k === 'accept' ? '' : 'flex:1'" @click="act(main.k)"><Icon v-if="main.icon" :name="main.icon" :size="18" />{{ main.t }}</button>
    </div>`,
  setup() {
    const { data: e, load } = useLoad(() => api('/errands/' + store.route.params.id));
    const stepIdx = computed(() => ({ open: 0, accepted: 1, delivered: 2, completed: 3, cancelled: -1 })[e.value?.status] ?? 0);
    const head = computed(() => {
      const x = e.value;
      return {
        open: { title: '等待同学接单', desc: '赏金已托管，被接单前可随时取消' },
        accepted: { title: x.is_runner ? '去取件吧' : '同学已接单', desc: x.is_runner ? '送达后请拍照上传，留个记录' : `${x.runner_nickname} 正在帮你${x.type === 'express' ? '取快递' : '跑腿'}` },
        delivered: { title: '已送达', desc: x.is_owner ? '请核对物品，确认后赏金打给接单同学' : '等待发布人确认，确认后赏金到账' },
        completed: { title: '订单已完成', desc: x.is_runner ? `赏金 ¥${yuan(x.runner_income)} 已到账钱包` : '感谢使用校园跑腿' },
        cancelled: { title: '订单已取消', desc: '托管赏金已原路退回' },
      }[x.status];
    });
    const main = computed(() => {
      const x = e.value; if (!x) return null;
      if (x.is_owner && ['accepted', 'delivered'].includes(x.status)) return { k: 'complete', t: '确认完成，打款给接单人' };
      if (x.is_runner && x.status === 'accepted') return { k: 'deliver', t: '拍照确认送达', icon: 'camera' };
      if (!x.is_owner && x.status === 'open') return { k: 'accept', t: '立即接单' };
      return null;
    });
    const ops = computed(() => (e.value?.is_owner && e.value.status === 'open' ? [{ k: 'cancel', t: '取消订单' }] : []));
    return {
      e, stepIdx, head, main, ops,
      async act(k) {
        let body = {};
        if (k === 'cancel' && !(await confirmBox('确定取消订单？', '托管赏金将原路退回'))) return;
        if (k === 'complete' && !(await confirmBox('确认已收到？', `赏金 ¥${yuan(e.value.runner_income)} 将打给 ${e.value.runner_nickname}`))) return;
        if (k === 'deliver') {
          const url = await askPhoto('拍照确认送达', '拍下物品放置位置或交接照片，作为送达凭证');
          if (!url) return;
          body = { proof_image: url };
        }
        try { e.value = await post(`/errands/${e.value.id}/${k}`, body); toast({ accept: '接单成功，取件码已显示', deliver: '已送达，等待对方确认', complete: '订单已完成', cancel: '已取消，赏金已退回' }[k]); } catch (err) { load(); }
      },
    };
  },
}, { role: 'student' });

/* ---------- 二手（担保交易） ---------- */
const MARKET_CATS = [{ v: '', t: '全部' }, { v: 'book', t: '教材' }, { v: 'digital', t: '数码' }, { v: 'daily', t: '生活' }, { v: 'sport', t: '运动' }, { v: 'other', t: '其他' }];

defineRoute('/market', {
  template: `<NavBar title="二手闲置" back />
    <div class="seg"><button v-for="c in cats" :key="c.v" :class="{ on: cat === c.v }" @click="cat = c.v">{{ c.t }}</button></div>
    <div class="page with-action">
      <div class="pad" style="padding-bottom:0"><div class="search-input"><Icon name="search" :size="17" /><input v-model="kw" @keyup.enter="load()" placeholder="搜索宝贝"></div></div>
      <div class="notice ok"><Icon name="shield" :size="15" />担保交易：付款由平台托管，当面验货后确认收货，卖家才收到钱</div>
      <Loading v-if="loading && !data" />
      <Empty v-else-if="!data?.length" text="暂无在售物品" icon="market" />
      <div class="deal-grid">
        <div v-for="i in data" :key="i.id" class="deal-card" @click="go('/market/' + i.id)">
          <Cover cls="cover" :src="i.images[0]" :cat="i.category" :icon="40" style="height:150px"><span class="tag ok corner tl">{{ i.item_condition }}</span></Cover>
          <div class="body"><div class="title clamp2">{{ i.title }}</div>
            <div class="foot"><Price :v="i.price" size="md" /><span v-if="i.original_price" class="strike">¥{{ yuan(i.original_price) }}</span></div>
            <div class="shop"><span class="avatar" :style="{ width: '16px', height: '16px', fontSize: '9px', background: avatarColor(i.nickname) }">{{ i.nickname.slice(0, 1) }}</span><span class="ellipsis">{{ i.nickname }} · {{ timeAgo(i.created_at) }}</span></div></div>
        </div>
      </div>
    </div>
    <div class="action-bar"><button class="btn ghost" style="height:46px;border-radius:23px;padding:0 18px" @click="go('/market/orders')"><Icon name="receipt" :size="18" />我的交易</button>
      <button class="btn block" style="flex:1" @click="go('/market/new')"><Icon name="plus" :size="18" :stroke="2.4" />发布闲置</button></div>`,
  setup() {
    const cat = ref(''), kw = ref('');
    const { data, loading, load } = useLoad(() => api('/market', { query: { category: cat.value, keyword: kw.value } }));
    watch(cat, () => load());
    return { cats: MARKET_CATS, cat, kw, data, loading, load };
  },
}, { role: 'student' });

defineRoute('/market/new', {
  template: `<NavBar title="发布闲置" back />
    <div class="page with-action" style="padding-top:12px">
      <div class="form">
        <div class="field col"><textarea v-model="f.title" maxlength="40" style="min-height:44px;font-size:16px;font-weight:600" placeholder="宝贝标题：品牌型号，一句话说清楚"></textarea></div>
        <div class="field col"><textarea v-model="f.description" placeholder="描述一下新旧程度、入手渠道、转手原因…"></textarea></div>
        <div class="field col"><ImagePicker v-model="f.images" :max="6" icon="camera" label="添加图片" /><span class="muted">最多 6 张，有图卖得更快</span></div>
      </div>
      <div class="form">
        <div class="field"><label>分类</label><div class="chips end">
          <span v-for="c in cats" :key="c.v" class="chip" :class="{ on: f.category === c.v }" @click="f.category = c.v">{{ c.t }}</span></div></div>
        <div class="field"><label>成色</label><div class="chips end">
          <span v-for="c in conds" :key="c" class="chip" :class="{ on: f.item_condition === c }" @click="f.item_condition = c">{{ c }}</span></div></div>
        <div class="field"><label>价格<span class="req">*</span></label><input v-model="f.price" type="number" placeholder="0.00"><span class="unit">元</span></div>
        <div class="field"><label>原价</label><input v-model="f.original_price" type="number" placeholder="选填"><span class="unit">元</span></div>
        <div class="field"><label>联系方式<span class="req">*</span></label><input v-model="f.contact" placeholder="微信 / 手机（买家下单后可见）"></div>
      </div>
      <div class="hint"><Icon name="info" :size="13" />买家付款由平台托管，当面交易、买家确认收货后货款到你的钱包（平台收取 {{ feePct($store.config.market_fee_rate) }} 服务费）。</div>
    </div>
    <div class="action-bar"><button class="btn block" :disabled="busy" @click="submit">发布</button></div>`,
  setup() {
    const f = reactive({ title: '', description: '', category: 'book', item_condition: '9成新', price: '', original_price: '', contact: '', images: [] });
    const busy = ref(false);
    return {
      f, busy, cats: MARKET_CATS.slice(1), conds: ['全新', '95新', '9成新', '8成新'],
      async submit() { busy.value = true; try { const i = await post('/market', f); toast('发布成功'); go('/market/' + i.id, true); } catch (e) {} finally { busy.value = false; } },
    };
  },
}, { role: 'student' });

defineRoute('/market/:id', {
  template: `<NavBar title="宝贝详情" back="/market" />
    <div class="page with-action" v-if="i">
      <div v-if="i.images.length" class="gallery"><img v-for="u in i.images" :key="u" :src="u" alt="" @click="$store.img = u"></div>
      <Cover v-else :cat="i.category" :icon="72" style="height:240px" />
      <div class="card float-card">
        <div class="row"><Price :v="i.price" size="lg" /><span v-if="i.original_price" class="strike">原价 ¥{{ yuan(i.original_price) }}</span>
          <span class="grow"></span><span :class="statusCls('market', i.status)">{{ statusText('market', i.status) }}</span></div>
        <h3 style="margin:8px 0 6px;font-size:17px">{{ i.title }}</h3>
        <div class="row"><span class="tag ok">{{ i.item_condition }}</span><span class="tag">{{ catOf(i.category).name }}</span><span class="muted">{{ i.views }} 人看过 · {{ timeAgo(i.created_at) }}</span></div>
        <p class="ink2" style="white-space:pre-wrap;margin:12px 0 0;line-height:1.7">{{ i.description || '卖家很懒，什么也没写' }}</p>
      </div>
      <div class="card row">
        <div class="avatar" :style="{ background: avatarColor(i.nickname) }">{{ i.nickname.slice(0, 1) }}</div>
        <div class="grow"><b>{{ i.nickname }}</b><div class="muted">同校同学 · {{ $store.user.school?.short_name || $store.user.school?.name }}</div></div>
        <span class="tag ok lg"><Icon name="shield" :size="12" />担保交易</span>
      </div>
      <div class="card" v-if="i.active_order">
        <div class="card-title"><Icon name="hourglass" :size="17" />{{ i.is_owner ? '买家已付款，等待当面交易' : '你已付款，等待当面交易' }}</div>
        <div class="kv mt8"><span>{{ i.is_owner ? '买家' : '订单号' }}</span><span>{{ i.is_owner ? i.active_order.buyer_name : i.active_order.order_no }}</span></div>
        <div class="kv" v-if="!i.is_owner"><span>卖家联系方式</span><b>{{ i.contact }}</b></div>
        <div class="kv" v-if="i.is_owner"><span>确认收货后你到手</span><b style="color:var(--ok)">¥{{ yuan(i.active_order.price - i.active_order.fee) }}</b></div>
        <div class="ops mt8"><button class="btn" @click="go('/market/orders?role=' + (i.is_owner ? 'sell' : 'buy'))">查看交易</button></div>
      </div>
      <div class="hint" v-if="!i.is_owner && i.status === 'on_sale'"><Icon name="shield" :size="13" />下单后付款由平台托管，联系方式即可见；当面验货满意再确认收货，不满意可取消全额退款。</div>
    </div>
    <div class="action-bar" v-if="i">
      <template v-if="i.is_owner">
        <button v-if="i.status === 'on_sale'" class="btn ghost" style="flex:1;height:46px;border-radius:23px" @click="setStatus('off')">下架</button>
        <button v-if="i.status === 'on_sale'" class="btn" style="flex:1;height:46px;border-radius:23px" @click="setStatus('sold')">已线下售出</button>
        <button v-if="i.status === 'off'" class="btn block" @click="setStatus('on_sale')">重新上架</button>
        <button v-if="i.status === 'reserved' || i.status === 'sold'" class="btn block" @click="go('/market/orders?role=sell')">查看交易</button>
      </template>
      <template v-else>
        <div class="sum"><div class="muted">担保交易</div><Price :v="i.price" size="md" /></div>
        <button v-if="i.active_order" class="btn lg" @click="go('/market/orders?role=buy')">去确认收货</button>
        <button v-else class="btn lg" :disabled="i.status !== 'on_sale'" @click="buy">{{ i.status === 'on_sale' ? '我想要' : '已被拍下' }}</button>
      </template>
    </div>`,
  setup() {
    const { data: i, load } = useLoad(() => api('/market/' + store.route.params.id));
    return {
      i,
      async buy() {
        if (!(await confirmBox('微信支付（模拟）', `支付 ¥${yuan(i.value.price)}，由平台托管\n当面验货后再确认收货`, '确认支付'))) return;
        try { await post(`/market/${i.value.id}/buy`); toast('付款成功，已为你锁定宝贝'); load(); } catch (e) { load(); }
      },
      async setStatus(s) { try { await post(`/market/${i.value.id}/status`, { status: s }); i.value.status = s; toast('已更新'); } catch (e) {} },
    };
  },
}, { role: 'student' });

defineRoute('/market/orders', {
  template: `<NavBar title="我的二手交易" back="/market" />
    <div class="seg"><button :class="{ on: role === 'buy' }" @click="role = 'buy'">我买到的</button><button :class="{ on: role === 'sell' }" @click="role = 'sell'">我卖出的</button></div>
    <div class="page" style="padding-top:12px">
      <Loading v-if="!data" />
      <Empty v-else-if="!data.length" :text="role === 'buy' ? '还没有买过闲置' : '还没有卖出的闲置'" icon="market" />
      <div v-for="o in data" :key="o.id" class="card">
        <div class="row between"><span class="muted">{{ o.order_no }}</span><span :class="statusCls('trade', o.status)">{{ statusText('trade', o.status) }}</span></div>
        <div class="row mt8 tap" @click="go('/market/' + o.item_id)">
          <Cover cls="thumb sm" :src="o.images[0]" cat="market" :icon="20" />
          <div class="grow"><div class="ellipsis b">{{ o.title }}</div><div class="muted">{{ role === 'buy' ? '卖家 ' + o.seller_name : '买家 ' + o.buyer_name }} · {{ shortTime(o.created_at) }}</div></div>
          <Price :v="o.price" size="md" />
        </div>
        <div class="quote mt8" v-if="role === 'sell'"><div class="line"><span>平台服务费</span><b>-¥{{ yuan(o.fee) }}</b></div><div class="line"><span>{{ o.status === 'completed' ? '已到账' : '确认收货后到手' }}</span><b style="color:var(--ok)">¥{{ yuan(o.seller_income) }}</b></div></div>
        <div class="kv mt8" v-if="role === 'buy' && o.status === 'paid'"><span>卖家联系方式</span><b>{{ o.contact }}</b></div>
        <div class="ops mt8" v-if="o.status === 'paid'">
          <button class="btn" @click="act(o, 'cancel')">取消交易</button>
          <button v-if="o.is_buyer" class="btn primary" @click="act(o, 'confirm')">确认收货</button>
        </div>
      </div>
    </div>`,
  setup() {
    const role = ref(store.route.query.role || 'buy');
    const { data, load } = useLoad(() => api('/market-orders', { query: { role: role.value } }));
    watch(role, () => { data.value = null; load(); });
    return {
      role, data,
      async act(o, a) {
        const tip = a === 'confirm' ? ['确认收货？', `确认后 ¥${yuan(o.price)} 将打给卖家，请先当面验货`] : ['取消这笔交易？', '托管货款将全额退回买家，宝贝重新上架'];
        if (!(await confirmBox(...tip))) return;
        try { await post(`/market-orders/${o.id}/${a}`); toast(a === 'confirm' ? '交易成功' : '已取消'); load(); } catch (e) {}
      },
    };
  },
}, { role: 'student' });

/* ---------- 树洞 ---------- */
const TREE_TAGS = ['日常', '表白', '吐槽', '求助', '失物招领'];
const ReportSheet = reactive({ post: null });
const PostCard = {
  props: { p: Object, full: Boolean },
  emits: ['like'],
  methods: { report(p) { ReportSheet.post = p; } },
  template: `<div class="post" @click="!full && go('/treehole/' + p.id)" :style="{ cursor: full ? 'default' : 'pointer' }">
      <div class="post-head"><div class="avatar" :style="{ background: avatarColor(p.anon_name) }">{{ p.anon_name.slice(-2, -1) }}</div>
        <div class="grow"><div class="b" style="font-size:14px">{{ p.anon_name }}</div><div class="muted">{{ timeAgo(p.created_at) }}</div></div>
        <span class="topic" :style="topicStyle(p.tag)">{{ p.tag }}</span></div>
      <div class="post-content" :class="{ clamp2: !full }">{{ p.content }}</div>
      <div class="post-foot">
        <button :class="{ liked: p.liked }" @click.stop="$emit('like', p)"><Icon name="heart" :size="17" />{{ p.like_count || '点赞' }}</button>
        <button><Icon name="chat" :size="17" />{{ p.comment_count || '评论' }}</button>
        <button v-if="full" style="margin-left:auto" @click.stop="report(p)"><Icon name="flag" :size="15" />举报</button>
      </div>
    </div>`,
};
async function toggleLike(p) {
  try { const r = await post(`/treehole/${p.id}/like`); p.liked = r.liked; p.like_count = r.like_count; } catch (e) {}
}

defineRoute('/treehole', {
  components: { PostCard },
  template: `<NavBar title="树洞" back />
    <div class="seg"><button :class="{ on: tag === '' }" @click="tag = ''">全部</button>
      <button v-for="t in tags" :key="t" :class="{ on: tag === t }" @click="tag = t">{{ t }}</button></div>
    <div class="page with-action" style="padding-top:10px">
      <div class="notice info" style="margin-top:0"><Icon name="lock" :size="15" />匿名发言，请友善交流；违规内容将被处理</div>
      <Loading v-if="loading && !data" />
      <Empty v-else-if="!data?.length" text="这里还很安静" icon="treehole" />
      <PostCard v-for="p in data" :key="p.id" :p="p" @like="toggleLike" />
    </div>
    <div class="action-bar"><button class="btn block" @click="go('/treehole/new')"><Icon name="edit" :size="17" />匿名发一条</button></div>`,
  setup() {
    const tag = ref('');
    const { data, loading, load } = useLoad(() => api('/treehole', { query: { tag: tag.value } }));
    watch(tag, () => load());
    return { tag, tags: TREE_TAGS, data, loading, toggleLike };
  },
}, { role: 'student' });

defineRoute('/treehole/new', {
  template: `<NavBar title="匿名发帖" back />
    <div class="page with-action" style="padding-top:12px">
      <div class="form"><div class="field col"><textarea v-model="content" maxlength="500" style="min-height:180px;font-size:15px" placeholder="说点什么吧…系统会为你生成一个匿名身份"></textarea>
        <div class="muted right">{{ content.length }}/500</div></div></div>
      <div class="pad"><div class="muted mb8">选择话题</div><div class="chips">
        <span v-for="t in tags" :key="t" class="chip" :class="{ on: tag === t }" @click="tag = t">#{{ t }}</span></div></div>
    </div>
    <div class="action-bar"><button class="btn block" :disabled="!content.trim() || busy" @click="submit">匿名发布</button></div>`,
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
    <div class="page with-action" style="padding-top:12px" v-if="data">
      <PostCard :p="data.post" full @like="toggleLike" />
      <div class="section" style="padding-top:6px"><h3 style="font-size:15px">评论 {{ data.comments.length }}</h3></div>
      <Empty v-if="!data.comments.length" text="还没有评论，抢个沙发" icon="chat" />
      <div class="card flush" v-else>
        <div v-for="c in data.comments" :key="c.id" class="list-item" style="cursor:default">
          <div class="avatar" :style="{ background: c.anon_name === '洞主' ? 'var(--brand)' : avatarColor(c.anon_name), width: '30px', height: '30px', fontSize: '12px' }">{{ c.anon_name === '洞主' ? '主' : c.anon_name.slice(-2, -1) }}</div>
          <div class="grow"><div class="row between"><b style="font-size:13px">{{ c.anon_name }}<span v-if="c.anon_name === '洞主'" class="tag brand" style="margin-left:4px">楼主</span></b><span class="muted">{{ timeAgo(c.created_at) }}</span></div><div class="mt4">{{ c.content }}</div></div>
        </div>
      </div>
    </div>
    <div class="chat-input"><input v-model="text" maxlength="200" placeholder="友善评论…" @keyup.enter="send"><button class="btn" :disabled="!text.trim()" @click="send">发送</button></div>
    <div v-if="rs.post" class="mask" @click.self="rs.post = null"><div class="sheet">
      <div class="sheet-title">举报原因</div>
      <div class="chips" style="justify-content:center"><span v-for="r in reasons" :key="r" class="chip" @click="doReport(r)">{{ r }}</span></div>
      <p class="muted center mt12">累计多人举报的内容会自动隐藏，等待平台复核</p>
      <button class="btn ghost block" style="box-shadow:none;background:#f5f6f8" @click="rs.post = null">取消</button>
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

/* ---------- 学校百事通（AI 问答，当前由知识库兜底） ---------- */
defineRoute('/ai', {
  template: `<NavBar title="学校百事通" back />
    <div class="page" style="padding-bottom:70px" ref="box">
      <div class="card" style="margin-top:12px;background:linear-gradient(110deg,#f3efff,#eaf3ff)">
        <div class="row"><div class="cover-box" style="width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,#8b6cff,#3d8bff)"><Icon name="ai" :size="24" :stroke="2" /></div>
          <div class="grow"><b style="font-size:16px">{{ $store.user.school?.short_name || '校园' }}百事通</b><div class="muted">报到、校园卡、快递点、宿舍、平台怎么用，都可以问</div></div></div>
        <div class="muted mt8 row" style="gap:4px"><Icon name="info" :size="13" />AI 智能问答即将接入，目前由校园知识库为你解答</div>
      </div>
      <div class="chat">
        <div v-if="hot.length" class="msg-row"><div class="avatar" style="background:linear-gradient(135deg,#8b6cff,#3d8bff)"><Icon name="bot" :size="18" /></div>
          <div class="msg bot" style="padding:10px"><div class="muted" style="margin-bottom:8px">大家都在问</div>
            <div class="chips"><span v-for="h in hot" :key="h.id" class="chip" @click="ask(h.question)">{{ h.question }}</span></div></div></div>
        <div v-for="(m, i) in msgs" :key="i" class="msg-row" :class="{ me: m.me }">
          <div class="avatar" :style="{ background: m.me ? avatarColor($store.user.nickname) : 'linear-gradient(135deg,#8b6cff,#3d8bff)' }"><template v-if="m.me">{{ $store.user.nickname.slice(0, 1) }}</template><Icon v-else name="bot" :size="18" /></div>
          <div class="msg" :class="m.me ? 'me' : 'bot'">{{ m.text }}
            <div v-if="m.related?.length" class="chips mt8"><span v-for="r in m.related" :key="r.id" class="chip" @click="ask(r.question)">{{ r.question }}</span></div>
            <div v-if="!m.me && m.source" class="src"><Icon :name="m.source === 'faq' ? 'book' : m.source === 'ai' ? 'ai' : 'help'" :size="12" />{{ { faq: '来自校园知识库', ai: 'AI 生成，仅供参考', none: '暂未收录，已反馈给运营补充' }[m.source] }}</div>
          </div>
        </div>
        <div v-if="thinking" class="msg-row"><div class="avatar" style="background:linear-gradient(135deg,#8b6cff,#3d8bff)"><Icon name="bot" :size="18" /></div><div class="msg bot"><span class="typing"><i></i><i></i><i></i></span></div></div>
      </div>
    </div>
    <div class="chat-input"><input v-model="q" maxlength="200" placeholder="输入你的问题" @keyup.enter="ask()"><button class="btn" :disabled="!q.trim() || thinking" @click="ask()"><Icon name="send" :size="16" /></button></div>`,
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

/* ---------- 领券中心（福利群每日发券） ---------- */
defineRoute('/coupons', {
  template: `<NavBar title="领券中心" back />
    <div class="seg"><button :class="{ on: tab === 'today' }" @click="tab = 'today'">今日福利</button><button :class="{ on: tab === 'mine' }" @click="tab = 'mine'">我的券 <template v-if="mine?.length">({{ mine.length }})</template></button></div>
    <div class="page" style="padding-top:12px">
      <template v-if="tab === 'today'">
        <div class="group-card" v-if="t">
          <div class="qr"><img v-if="t.group.qr" :src="t.group.qr" alt="群二维码"><Icon v-else name="qr" :size="60" :stroke="1.4" /></div>
          <div class="grow"><div style="font-size:17px;font-weight:700">{{ t.group.name }}</div><div style="font-size:12px;opacity:.9;margin-top:4px;line-height:1.5">{{ t.group.desc }}</div>
            <div class="glass-tag mt8" style="display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 10px;border-radius:12px;background:rgba(255,255,255,.2);font-size:12px"><Icon name="users" :size="13" />长按识别二维码进群</div></div>
        </div>
        <Loading v-if="!t" />
        <template v-else>
          <div class="section" style="padding-top:6px"><h3 style="font-size:16px">今日开抢</h3><small>每人每券每天限领 1 张</small></div>
          <Empty v-if="!t.templates.length" text="今天的券还没上架" icon="ticket" />
          <div v-for="c in t.templates" :key="c.id" class="coupon" :class="{ gray: !c.mine && (!c.left || !c.started) }">
            <div class="amt"><b><small>¥</small>{{ yuan(c.amount) }}</b><span>{{ c.threshold ? '满' + yuan(c.threshold) + '可用' : '无门槛' }}</span></div>
            <div class="info"><b>{{ c.title }}</b><span class="muted">{{ c.scope_text }} · {{ c.valid_days > 1 ? '领取后 ' + c.valid_days + ' 天有效' : '当日有效' }}</span>
              <div class="row" style="gap:6px"><div class="progress" style="width:70px"><i :style="{ width: (c.claimed / c.daily_quota * 100) + '%' }"></i></div><span class="muted" style="font-size:11px">已抢 {{ Math.round(c.claimed / c.daily_quota * 100) }}%</span></div></div>
            <div class="act">
              <button v-if="c.mine" class="btn xs outline brand" @click="tab = 'mine'">去使用</button>
              <button v-else-if="!c.started" class="btn xs ghost" disabled>{{ c.start_time }} 开抢</button>
              <button v-else-if="!c.left" class="btn xs ghost" disabled>已抢光</button>
              <button v-else class="btn xs" style="background:linear-gradient(90deg,#ff6b3d,#ff3b2f)" @click="claim(c)">立即抢</button>
            </div>
          </div>
        </template>
      </template>
      <template v-else>
        <div class="pills" style="padding-top:0"><button v-for="s in sts" :key="s.v" :class="{ on: st === s.v }" @click="st = s.v">{{ s.t }}</button></div>
        <Loading v-if="!mine" />
        <Empty v-else-if="!mine.length" text="暂无优惠券，去今日福利抢一张吧" icon="ticket" />
        <div v-for="c in mine" :key="c.id" class="coupon" :class="{ gray: st !== 'available' }">
          <div class="amt"><b><small>¥</small>{{ yuan(c.amount) }}</b><span>{{ c.threshold ? '满' + yuan(c.threshold) + '可用' : '无门槛' }}</span></div>
          <div class="info"><b>{{ c.title }}</b><span class="muted">{{ c.scope_text }}</span><span class="muted">有效期至 {{ c.expires_at.slice(5, 16) }}</span></div>
          <div class="act"><button v-if="st === 'available'" class="btn xs outline brand" @click="go(c.scope === 'takeout' ? '/local?cat=takeout' : '/local')">去使用</button>
            <span v-else class="tag lg">{{ st === 'used' ? '已使用' : '已过期' }}</span></div>
        </div>
      </template>
    </div>`,
  setup() {
    const tab = ref(store.route.query.tab || 'today'), st = ref('available');
    const t = ref(null), mine = ref(null);
    const loadToday = async () => { try { t.value = await api('/coupons/today'); } catch (e) {} };
    const loadMine = async () => { mine.value = null; try { mine.value = await api('/coupons/mine', { query: { status: st.value } }); } catch (e) { mine.value = []; } };
    onMounted(() => { loadToday(); loadMine(); });
    watch(st, loadMine);
    return {
      tab, st, t, mine, sts: [{ v: 'available', t: '可使用' }, { v: 'used', t: '已使用' }, { v: 'expired', t: '已过期' }],
      async claim(c) { try { await post(`/coupons/${c.id}/claim`); toast('领取成功，下单时自动可用'); loadToday(); loadMine(); } catch (e) { loadToday(); } },
    };
  },
}, { role: 'student' });

/* ---------- 我的钱包 ---------- */
defineRoute('/wallet', {
  template: `<NavBar title="我的钱包" back="/me" />
    <div class="page" v-if="w">
      <div class="hero-card">
        <div class="label">累计收入（元）</div><div class="big">{{ yuan(w.total) }}</div>
        <div class="stats mt12"><div v-for="k in w.by_kind" :key="k.kind" class="stat"><b style="font-size:17px">{{ yuan(k.amount) }}</b><span>{{ k.title }}</span></div></div>
      </div>
      <div class="notice info"><Icon name="info" :size="15" />跑腿赏金、二手货款、配送提成在完成后实时入账；正式版通过微信支付分账到微信零钱</div>
      <div class="section"><h3 style="font-size:16px">收支明细</h3></div>
      <Empty v-if="!w.rows.length" text="还没有收入，去接个跑腿单吧" icon="wallet" />
      <div class="card flush" v-else>
        <div v-for="r in w.rows" :key="r.id" class="list-item" style="cursor:default">
          <div class="cover-box thumb xs" :style="{ background: gradOf(r.kind === 'market_sale' ? 'market' : r.kind === 'delivery' ? 'takeout' : 'errand') }"><Icon :name="r.kind === 'market_sale' ? 'market' : r.kind === 'delivery' ? 'takeout' : 'errand'" :size="18" :stroke="2" /></div>
          <div class="grow"><b class="ellipsis" style="display:block">{{ r.title }}</b><div class="muted ellipsis">{{ r.remark }}</div><div class="muted">{{ shortTime(r.created_at) }}</div></div>
          <b class="num" style="color:var(--ok);font-size:16px">+{{ yuan(r.amount) }}</b>
        </div>
      </div>
    </div>
    <Loading v-else />`,
  setup() { const { data: w } = useLoad(() => api('/wallet')); return { w }; },
}, { school: false });

/* ---------- 我的（各端共用） ---------- */
defineRoute('/me', {
  template: `<div class="page with-bar" style="position:relative">
      <div class="me-bg"></div>
      <NavBar title="我的" variant="brand" style="position:relative;z-index:2" />
      <div class="me-head">
        <div class="avatar lg">{{ u.nickname.slice(0, 1) }}</div>
        <div class="grow"><div style="font-size:20px;font-weight:700">{{ u.nickname }}</div>
          <div style="opacity:.85;font-size:12px;margin-top:2px">{{ u.phone }} · {{ roleName }}</div>
          <div style="opacity:.85;font-size:12px" v-if="u.school" class="row"><Icon name="school" :size="13" />{{ u.school.name }}</div></div>
        <button class="btn xs glass" @click="editName">编辑资料</button>
      </div>
      <div style="position:relative;z-index:1">
        <div class="card flush" v-if="u.role === 'student'">
          <div class="asset">
            <div @click="go('/wallet')"><b>{{ wallet == null ? '-' : yuan(wallet) }}</b><span>钱包(元)</span></div>
            <div @click="go('/coupons?tab=mine')"><b>{{ couponCount ?? '-' }}</b><span>优惠券</span></div>
            <div @click="go('/orders')"><b>{{ saved == null ? '-' : yuan(saved) }}</b><span>累计省(元)</span></div>
            <div @click="go('/market/orders')"><b><Icon name="market" :size="20" style="margin:0 auto 2px" /></b><span>二手交易</span></div>
          </div>
        </div>
        <div class="card flush" v-if="u.role === 'student'">
          <div class="quick">
            <button v-for="e in quick" :key="e.t" class="entry" @click="go(e.path)"><div class="tile" :style="{ background: gradOf(e.c) }"><Icon :name="e.icon || catOf(e.c).icon" :size="21" :stroke="2" /></div>{{ e.t }}</button>
          </div>
        </div>
        <div class="card flush">
          <div class="cell" v-if="u.rider_status === 'approved'" @click="go('/r')"><span class="cell-ico"><Icon name="takeout" :size="20" /></span><span class="grow">骑手工作台</span><span class="tag info">外卖团队</span><Icon name="right" :size="16" class="arrow" /></div>
          <div class="cell" v-if="u.role === 'merchant'" @click="go('/m/shop')"><span class="cell-ico"><Icon name="store" :size="20" /></span><span class="grow">店铺设置</span><Icon name="right" :size="16" class="arrow" /></div>
          <div class="cell" v-if="u.role === 'merchant'" @click="go('/m/promote')"><span class="cell-ico"><Icon name="megaphone" :size="20" /></span><span class="grow">首页推荐位</span><span class="muted">行业前三 · 按天投放</span><Icon name="right" :size="16" class="arrow" /></div>
          <div class="cell" v-if="u.role === 'manager'" @click="go('/g')"><span class="cell-ico"><Icon name="qr" :size="20" /></span><span class="grow">我的邀请码</span><b style="letter-spacing:2px">{{ u.invite_code }}</b><Icon name="right" :size="16" class="arrow" /></div>
          <div class="cell" v-if="u.role === 'student'" @click="go('/school')"><span class="cell-ico"><Icon name="location" :size="20" /></span><span class="grow">切换学校</span><span class="muted">{{ u.school?.short_name }}</span><Icon name="right" :size="16" class="arrow" /></div>
          <div class="cell" @click="go('/ai')"><span class="cell-ico"><Icon name="ai" :size="20" /></span><span class="grow">学校百事通 · 帮助中心</span><Icon name="right" :size="16" class="arrow" /></div>
        </div>
        <div class="card flush" v-if="u.role === 'student'">
          <div class="cell" v-if="u.rider_status !== 'approved'" @click="joinRider"><span class="cell-ico"><Icon name="takeout" :size="20" /></span><span class="grow">加入校园外卖团队</span>
            <span class="muted">{{ u.rider_status === 'pending' ? '审核中' : '课余兼职，每单提成' }}</span><Icon name="right" :size="16" class="arrow" /></div>
          <div class="cell" @click="go('/merchant-apply')"><span class="cell-ico"><Icon name="store" :size="20" /></span><span class="grow">商家入驻</span><span class="muted">低抽佣 · 精准触达学生</span><Icon name="right" :size="16" class="arrow" /></div>
        </div>
        <div class="card flush">
          <div class="cell" @click="logout"><span class="cell-ico"><Icon name="logout" :size="20" /></span><span class="grow">退出登录</span></div>
        </div>
        <p class="muted center">校园生活 v0.3 原型 · 演示数据均为虚构</p>
      </div>
    </div>`,
  setup() {
    const u = computed(() => store.user);
    const roleName = computed(() => ({ student: '学生', merchant: '商家', manager: '客户经理', admin: '管理员' })[u.value.role]);
    const wallet = ref(null), couponCount = ref(null), saved = ref(null);
    onMounted(async () => {
      if (u.value.role !== 'student') return;
      try {
        const [w, c, o] = await Promise.all([api('/wallet', { silent: true }), api('/coupons/mine', { silent: true }), api('/orders', { silent: true })]);
        wallet.value = w.total; couponCount.value = c.length; saved.value = o.total_saved;
      } catch (e) {}
    });
    return {
      u, roleName, wallet, couponCount, saved,
      quick: [
        { c: 'coupons', t: '领券中心', path: '/coupons' },
        { c: 'errand', t: '我的跑腿', path: '/errands?type=mine' },
        { c: 'market', t: '我的二手', path: '/market/orders' },
        { c: 'ai', t: '百事通', path: '/ai' },
      ],
      async joinRider() {
        if (u.value.rider_status === 'pending') return toast('申请审核中，请耐心等待');
        if (!(await confirmBox('加入校园外卖团队', `每天固定时间点集中配送，送一单提成 ${yuan(store.config.rider_commission)} 元，课余时间就能做。\n提交后由平台审核。`, '提交申请'))) return;
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

defineRoute('/404', { template: `<NavBar title="页面不存在" back /><Empty text="页面走丢了" icon="compass"><button class="btn mt12" @click="go(roleHome($store.user?.role), true)">回首页</button></Empty>` }, { guest: true });
