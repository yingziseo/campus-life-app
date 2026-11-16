/* 学生端 · 周边本地生活：商家列表、店铺、下单（可用平台优惠券）、支付、券码、订单、商家入驻申请 */

const LOCAL_CATS = [
  { v: '', t: '全部' }, { v: 'takeout', t: '校园外卖' }, { v: 'food', t: '美食' }, { v: 'netcafe', t: '网吧' },
  { v: 'billiards', t: '台球' }, { v: 'homestay', t: '民宿' }, { v: 'ktv', t: 'KTV' },
];
const dist = (m) => (m ? (m >= 1000 ? (m / 1000).toFixed(1) + 'km' : m + 'm') : '');

defineRoute('/local', {
  template: `<NavBar title="周边生活" />
    <div class="seg"><button v-for="c in cats" :key="c.v" :class="{ on: cat === c.v }" @click="cat = c.v">{{ c.t }}</button></div>
    <div class="page with-bar">
      <div class="pad" style="padding-bottom:0"><div class="search-input"><Icon name="search" :size="17" /><input v-model="kw" @keyup.enter="load()" placeholder="搜索商家"></div></div>
      <div class="slogan-bar"><span class="seal"><Icon name="shield" :size="12" :stroke="2.4" />{{ $store.config.price_slogan }}</span><span class="grow">同一家店、同样的菜，每单都标注比{{ cmpLabel() }}省多少</span></div>
      <div v-if="cat === 'takeout'" class="notice info" style="margin-top:0"><Icon name="clock" :size="15" />校园外卖每天 {{ slots }} 集中送到取餐点，配送费仅 ¥{{ yuan($store.config.delivery_fee) }}</div>
      <Loading v-if="loading && !data" />
      <Empty v-else-if="!data?.length" text="这个分类还没有商家入驻" icon="store" />
      <div class="card flush" v-else>
        <div v-for="m in data" :key="m.id" class="shop-item" @click="go('/local/merchant/' + m.id)">
          <Cover cls="thumb" :src="m.cover" :cat="m.category" :icon="32" />
          <div class="grow">
            <div class="row between"><span class="name ellipsis">{{ m.name }}</span><span v-if="m.is_ad" class="tag ad-line">广告</span></div>
            <div class="meta"><span>{{ catOf(m.category).name }}</span><i></i><span>已售 {{ m.sold }}</span><i></i><span>{{ dist(m.distance_m) }}</span></div>
            <div class="tags"><span v-if="m.max_saving > 0" class="tag save">最高省{{ yuan(m.max_saving) }}元</span><span v-if="m.takeout_enabled" class="tag info">校园外卖</span><span class="tag">{{ m.intro }}</span></div>
            <div class="row mt8" v-if="m.min_price"><Price :v="m.min_price" size="md" /><span class="muted">起</span></div>
          </div>
        </div>
      </div>
    </div>`,
  setup() {
    const cat = ref(store.route.query.cat || ''), kw = ref('');
    const { data, loading, load } = useLoad(() => api('/local/merchants', { query: { category: cat.value, keyword: kw.value } }));
    const slots = ref('11:30 / 17:30 / 21:00');
    watch(cat, () => load());
    onMounted(async () => {
      try { const c = await api(`/schools/${store.user.school.id}/config`, { silent: true }); slots.value = c.delivery_slots.join(' / '); } catch (e) {}
    });
    return { cats: LOCAL_CATS, cat, kw, data, loading, load, dist, slots };
  },
}, { tab: 'local', role: 'student' });

defineRoute('/local/merchant/:id', {
  template: `<NavBar :title="m?.name || '店铺'" back="/local" />
    <div class="page" v-if="m">
      <Cover cls="hero-cover" :src="m.cover" :cat="m.category" :icon="64" />
      <div class="card float-card">
        <div class="row between"><h3 style="margin:0;font-size:19px">{{ m.name }}</h3><span class="tag brand lg">{{ catOf(m.category).name }}</span></div>
        <div class="muted mt4">{{ m.intro }}</div>
        <div class="divider"></div>
        <div class="row ink2" style="font-size:13px"><Icon name="location" :size="15" /><span class="grow ellipsis">{{ m.address }}</span><span class="muted">{{ dist(m.distance_m) }}</span>
          <a class="icon-btn" style="width:30px;height:30px;background:#f5f6f8" :href="'tel:' + m.phone" aria-label="电话"><Icon name="phone" :size="15" /></a></div>
      </div>
      <template v-for="g in groups" :key="g.type">
        <div class="section" v-if="g.items.length"><h3 style="font-size:16px"><Icon :name="g.icon" :size="18" style="color:var(--brand)" />{{ g.title }}</h3><small>{{ g.sub }}</small></div>
        <div class="card flush" v-if="g.items.length">
          <div v-for="d in g.items" :key="d.id" class="deal-row" @click="go('/local/deal/' + d.id)">
            <Cover cls="thumb" :src="d.image" :cat="d.type === 'takeout' ? 'takeout' : m.category" :icon="30" />
            <div class="grow">
              <b class="clamp2" style="font-size:15px;line-height:1.4">{{ d.title }}</b>
              <div class="row" style="gap:4px;margin-top:4px"><span class="tag save">比{{ cmpLabel() }}省{{ yuan(d.saving) }}元</span><span v-if="d.voucher_label" class="tag line">{{ d.voucher_label }}</span></div>
              <div class="row mt8"><Price :v="d.sale_price" /><span class="strike">¥{{ yuan(d.competitor_price) }}</span>
                <span class="grow"></span><button class="buy-btn">抢购</button></div>
            </div>
          </div>
        </div>
      </template>
      <Empty v-if="!m.deals.length" text="商家还没有上架商品" icon="store" />
    </div>
    <Loading v-else />`,
  setup() {
    const { data: m } = useLoad(() => api('/local/merchants/' + store.route.params.id));
    const groups = computed(() => !m.value ? [] : [
      { type: 'takeout', icon: 'takeout', title: '校园外卖', sub: '固定时间送到取餐点', items: m.value.deals.filter((d) => d.type === 'takeout') },
      { type: 'groupbuy', icon: 'ticket', title: '到店团购', sub: '买券到店核销，随时退', items: m.value.deals.filter((d) => d.type === 'groupbuy') },
    ]);
    return { m, groups, dist };
  },
}, { role: 'student' });

defineRoute('/local/deal/:id', {
  template: `<NavBar title="商品详情" back />
    <div class="page with-action" v-if="d">
      <Cover cls="hero-cover" :src="d.image" :cat="d.type === 'takeout' ? 'takeout' : d.category" :icon="72" style="height:230px" />
      <div class="card float-card">
        <div class="row" style="align-items:baseline"><Price :v="d.sale_price" size="xl" />
          <span class="strike">{{ cmpLabel() }} ¥{{ yuan(d.competitor_price) }}</span>
          <span class="grow"></span><span class="muted">已售 {{ d.sold }}</span></div>
        <div class="row mt8" style="gap:6px"><span class="tag save-solid lg"><Icon name="shield" :size="12" :stroke="2.4" />{{ $store.config.price_slogan }}</span><span class="tag save lg">比{{ cmpLabel() }}省 {{ yuan(d.saving) }} 元</span></div>
        <h3 style="margin:12px 0 4px;font-size:18px">{{ d.title }}</h3>
        <div class="muted">{{ d.merchant_name }}<template v-if="d.description"> · {{ d.description }}</template></div>
        <div v-if="d.voucher_label" class="notice brand" style="margin:12px 0 0"><Icon name="ticket" :size="15" />含平台代金券「{{ d.voucher_label }}」：到店标价 ¥{{ yuan(d.list_price) }}，券已自动抵扣</div>
      </div>

      <template v-if="d.type === 'takeout'">
        <div class="card">
          <div class="card-title"><Icon name="clock" :size="17" />送餐时间</div>
          <div class="muted mt4 mb8">送餐前 {{ d.cutoff_minutes }} 分钟截单，错过自动顺延到明天</div>
          <div class="chips"><span v-for="s in d.delivery.delivery_slots" :key="s" class="chip" :class="{ on: f.delivery_slot === s }" @click="f.delivery_slot = s">{{ slotDay(s) }} {{ s }}</span></div>
          <div class="card-title mt16"><Icon name="location" :size="17" />取餐点</div>
          <div class="chips mt8"><span v-for="p in d.delivery.delivery_points" :key="p" class="chip" :class="{ on: f.delivery_point === p }" @click="f.delivery_point = p">{{ p }}</span></div>
        </div>
        <div class="form"><div class="field"><label>备注</label><input v-model="f.remark" placeholder="少辣 / 不要香菜"></div></div>
      </template>
      <div v-else class="card">
        <div class="card-title"><Icon name="info" :size="17" />购买须知</div>
        <div class="kv mt4"><span>使用方式</span><span>支付后获得券码，到店出示核销</span></div>
        <div class="kv"><span>退款规则</span><span>未使用随时退，原路返回</span></div>
        <div class="kv"><span>商家地址</span><span>{{ d.address }}</span></div>
      </div>

      <div class="form">
        <div class="field"><label>数量</label><span class="grow"></span>
          <span class="stepper"><button :disabled="f.quantity <= 1" @click="f.quantity--"><Icon name="minus" :size="16" /></button><b>{{ f.quantity }}</b><button :disabled="f.quantity >= 20" @click="f.quantity++"><Icon name="plus" :size="16" /></button></span></div>
        <div class="field" style="cursor:pointer" @click="pickOpen = true"><label>平台优惠券</label><span class="grow"></span>
          <span v-if="coupon" class="tag save-solid lg">-¥{{ yuan(discount) }}</span>
          <span v-else class="muted">{{ coupons.length ? coupons.length + ' 张可用' : '暂无可用' }}</span><Icon name="right" :size="16" class="muted" /></div>
      </div>
      <div class="hint" v-if="!coupons.length"><Icon name="gift" :size="13" />进福利群每天领券，<a style="color:var(--brand-ink)" @click.prevent="go('/coupons')">去领券中心</a></div>
    </div>
    <Loading v-else />
    <div class="action-bar" v-if="d">
      <div class="sum"><div><span class="muted">合计 </span><Price :v="total" /></div>
        <div class="muted">共省 ¥{{ yuan(d.saving * f.quantity + discount) }}<template v-if="d.type === 'takeout'"> · 含配送费 ¥{{ yuan(d.delivery_fee) }}</template></div></div>
      <button class="btn lg" :disabled="busy" @click="submit">提交订单</button>
    </div>
    <div v-if="pickOpen" class="mask" @click.self="pickOpen = false"><div class="sheet" style="background:var(--bg);padding-left:0;padding-right:0">
      <div class="sheet-title">选择优惠券</div>
      <Empty v-if="!coupons.length" text="暂无可用优惠券" icon="ticket"><button class="btn sm mt12" @click="go('/coupons')">去领券</button></Empty>
      <div v-for="c in coupons" :key="c.id" class="coupon pick" :class="{ on: couponId === c.id }" @click="couponId = c.id; pickOpen = false">
        <div class="amt"><b><small>¥</small>{{ yuan(c.amount) }}</b><span>{{ c.threshold ? '满' + yuan(c.threshold) + '可用' : '无门槛' }}</span></div>
        <div class="info"><b>{{ c.title }}</b><span class="muted">{{ c.scope_text }} · 至 {{ c.expires_at.slice(5, 16) }}</span></div>
        <div class="act"><span class="check" :class="{ on: couponId === c.id }"><Icon v-if="couponId === c.id" name="check" :size="12" :stroke="3" /></span></div>
      </div>
      <div style="padding:4px 12px 0"><button class="btn ghost block" style="box-shadow:none;background:#fff" @click="couponId = 0; pickOpen = false">不使用优惠券</button></div>
    </div></div>`,
  setup() {
    const f = reactive({ quantity: 1, delivery_slot: '', delivery_point: '', remark: '' });
    const coupons = ref([]), couponId = ref(0), pickOpen = ref(false), touched = ref(false);
    const { data: d } = useLoad(async () => {
      const r = await api('/local/deals/' + store.route.params.id);
      if (r.delivery) { f.delivery_slot = r.delivery.delivery_slots[0] || ''; f.delivery_point = r.delivery.delivery_points[0] || ''; }
      return r;
    });
    // 数量变化后重新获取可用券，默认选抵扣最多的一张
    async function loadCoupons() {
      try {
        coupons.value = await api('/coupons/usable', { query: { deal_id: store.route.params.id, quantity: f.quantity }, silent: true });
        if (!coupons.value.find((c) => c.id === couponId.value)) couponId.value = touched.value ? 0 : coupons.value[0]?.id || 0;
      } catch (e) { coupons.value = []; }
    }
    onMounted(loadCoupons);
    watch(() => f.quantity, loadCoupons);
    watch(couponId, () => (touched.value = true));
    const coupon = computed(() => coupons.value.find((c) => c.id === couponId.value));
    const discount = computed(() => (coupon.value && d.value ? Math.min(coupon.value.amount, d.value.sale_price * f.quantity) : 0));
    const total = computed(() => d.value ? d.value.sale_price * f.quantity + (d.value.type === 'takeout' ? d.value.delivery_fee : 0) - discount.value : 0);
    const busy = ref(false);
    // 与后端 OrderService::resolveDelivery 同一规则：距送餐不足截单时间则顺延到明天
    const slotDay = (s) => {
      const [h, m] = s.split(':').map(Number);
      const t = new Date(); t.setHours(h, m, 0, 0);
      return Date.now() + (d.value?.cutoff_minutes ?? 40) * 60000 <= t.getTime() ? '今天' : '明天';
    };
    return {
      d, f, total, busy, slotDay, coupons, couponId, coupon, discount, pickOpen,
      async submit() {
        busy.value = true;
        try { const o = await post('/orders', { deal_id: d.value.id, ...f, coupon_id: couponId.value || 0 }); go('/order/' + o.id, true); } catch (e) { loadCoupons(); } finally { busy.value = false; }
      },
    };
  },
}, { role: 'student' });

/** 订单详情（参考美团：顶部状态 + 小号操作按钮，退款等次要操作不抢视觉） */
defineRoute('/order/:id', {
  template: `<NavBar title="订单详情" back="/orders" />
    <div class="page" :class="{ 'with-action': o?.status === 'pending_pay' }" v-if="o">
      <div class="status-head">
        <h2>{{ head.title }}<Icon v-if="o.status === 'completed'" name="check-circle" :size="22" style="color:var(--ok)" /></h2>
        <p>{{ head.desc }}<b v-if="head.strong"> {{ head.strong }}</b></p>
      </div>
      <div class="card status-card">
        <Steps v-if="o.type === 'takeout' && !['pending_pay','cancelled','refunded'].includes(o.status)" :items="['已支付','已出餐','配送中','已送达']" :current="{ paid: 0, ready: 1, delivering: 2, completed: 3 }[o.status] ?? -1" />
        <template v-else-if="o.type === 'groupbuy' && o.coupons.length">
          <div class="muted">到店出示券码，由商家核销</div>
          <div v-for="c in o.coupons" :key="c.code" class="ticket" :class="{ used: c.status !== 'unused' }">
            <div class="l"><div class="muted">券码</div><div class="code">{{ c.code.replace(/(\\d{4})(?=\\d)/g, '$1 ') }}</div></div>
            <div class="r">{{ { unused: '待使用', used: '已使用', refunded: '已退款' }[c.status] }}</div>
          </div>
        </template>
        <div v-else-if="o.status === 'pending_pay'" class="row between"><span class="muted">需支付</span><Price :v="o.total_amount" size="lg" /></div>
        <div class="row mt12" style="gap:8px;flex-wrap:wrap">
          <span class="tag save lg"><Icon name="piggy" :size="13" />本单比{{ cmpLabel() }}省 ¥{{ yuan(o.saved) }}</span>
          <span v-if="o.rider_name" class="tag info lg"><Icon name="takeout" :size="13" />骑手 {{ o.rider_name }}</span>
          <span class="grow"></span>
        </div>
        <div class="ops mt12" v-if="ops.length"><button v-for="a in ops" :key="a.k" class="btn" :class="{ primary: a.primary }" @click="act(a.k)">{{ a.t }}</button></div>
      </div>
      <div class="card" v-if="o.proof_image">
        <div class="card-title"><Icon name="camera" :size="17" />送达照片</div>
        <div class="proof" @click="$store.img = o.proof_image"><img :src="o.proof_image" alt="送达照片"><span class="tag ad">{{ o.delivery_point }} · {{ shortTime(o.completed_at) }}</span></div>
      </div>
      <div class="card">
        <div class="row tap" @click="go('/local/merchant/' + o.merchant_id)"><Icon name="store" :size="17" /><b class="grow">{{ o.merchant_name }}</b><Icon name="right" :size="16" class="muted" /></div>
        <div class="row mt12">
          <Cover cls="thumb sm" :cat="o.type === 'takeout' ? 'takeout' : 'groupbuy'" :icon="22" />
          <div class="grow"><div class="ellipsis">{{ o.title }}</div><div class="muted">× {{ o.quantity }}</div></div><b class="num">¥{{ yuan(o.goods_amount) }}</b>
        </div>
        <div class="divider"></div>
        <div class="kv" v-if="o.delivery_fee"><span>配送费</span><span>¥{{ yuan(o.delivery_fee) }}</span></div>
        <div class="kv" v-if="o.coupon_discount"><span>平台优惠券</span><span style="color:var(--price)">-¥{{ yuan(o.coupon_discount) }}</span></div>
        <div class="kv"><span>{{ cmpLabel() }}同款价</span><s class="muted">¥{{ yuan(o.competitor_amount) }}</s></div>
        <div class="kv" style="align-items:baseline"><span>实付</span><Price :v="o.total_amount" size="md" /></div>
      </div>
      <div class="card">
        <template v-if="o.type === 'takeout'">
          <div class="kv"><span>送达时间</span><span>{{ o.delivery_date === today ? '今天' : o.delivery_date }} {{ o.delivery_slot }}</span></div>
          <div class="kv"><span>取餐点</span><span>{{ o.delivery_point }}</span></div>
        </template>
        <div class="kv"><span>订单号</span><span class="num">{{ o.order_no }}</span></div>
        <div class="kv"><span>下单时间</span><span>{{ shortTime(o.created_at) }}</span></div>
        <div class="kv" v-if="o.remark"><span>备注</span><span>{{ o.remark }}</span></div>
      </div>
    </div>
    <Loading v-else />
    <div class="action-bar" v-if="o?.status === 'pending_pay'">
      <div class="sum"><div class="muted">需支付</div><Price :v="o.total_amount" /></div>
      <button class="btn lg" :disabled="busy" @click="pay">微信支付（模拟）</button>
    </div>`,
  setup() {
    const { data: o } = useLoad(() => api('/orders/' + store.route.params.id));
    const busy = ref(false);
    const today = todayStr();
    const canRefund = computed(() => o.value?.status === 'paid' && (o.value.type === 'takeout' || o.value.coupons.every((c) => c.status === 'unused')));
    const head = computed(() => {
      const x = o.value;
      const when = `${x.delivery_date === today ? '今天' : (x.delivery_date || '').slice(5)} ${x.delivery_slot || ''}`;
      if (x.status === 'pending_pay') return { title: '等待支付', desc: '请尽快完成支付，超时订单将自动取消' };
      if (x.status === 'cancelled') return { title: '订单已取消', desc: x.coupon_discount ? '优惠券已退回你的账户' : '期待下次光临' };
      if (x.status === 'refunded') return { title: '退款成功', desc: '款项已原路退回' + (x.coupon_discount ? '，优惠券已退回' : '') };
      if (x.type === 'takeout') {
        return {
          paid: { title: '商家备餐中', desc: `预计 ${when} 送达`, strong: x.delivery_point },
          ready: { title: '已出餐，等待骑手取餐', desc: `预计 ${when} 送达`, strong: x.delivery_point },
          delivering: { title: '骑手配送中', desc: `${x.rider_name} 正在送往`, strong: x.delivery_point },
          completed: { title: '已送达，请尽快取餐', desc: '已放到取餐点', strong: x.delivery_point },
        }[x.status];
      }
      return x.status === 'completed' ? { title: '已使用', desc: '感谢光临，欢迎再来' } : { title: '待使用', desc: '到店出示券码即可使用，未使用随时可退' };
    });
    // 次要操作：小号描边按钮（申请退款 / 联系商家 / 再来一单）
    const ops = computed(() => {
      const x = o.value; if (!x) return [];
      const list = [];
      if (x.status === 'pending_pay') list.push({ k: 'cancel', t: '取消订单' });
      if (canRefund.value) list.push({ k: 'refund', t: '申请退款' });
      if (x.status !== 'pending_pay') list.push({ k: 'call', t: '联系商家' });
      if (['completed', 'refunded', 'cancelled'].includes(x.status)) list.push({ k: 'again', t: '再来一单', primary: true });
      return list;
    });
    return {
      o, busy, today, head, ops,
      async pay() {
        busy.value = true;
        try { o.value = await post(`/orders/${o.value.id}/pay`); toast('支付成功'); } catch (e) {} finally { busy.value = false; }
      },
      async act(k) {
        if (k === 'again') return go('/local/deal/' + o.value.deal_id);
        if (k === 'call') return confirmBox('联系商家', `${o.value.merchant_name}\n${o.value.merchant_address}`, '知道了', '关闭');
        const refund = k === 'refund';
        if (!(await confirmBox(refund ? '确定申请退款？' : '确定取消订单？', refund ? '退款将原路返回' : ''))) return;
        try { o.value = await post(`/orders/${o.value.id}/cancel`); toast(refund ? '退款成功' : '已取消'); } catch (e) {}
      },
    };
  },
}, { role: 'student' });

defineRoute('/orders', {
  template: `<NavBar title="我的订单" />
    <div class="seg"><button v-for="t in tabs" :key="t.v" :class="{ on: st === t.v }" @click="st = t.v">{{ t.t }}</button></div>
    <div class="page with-bar">
      <div class="hero-card row" v-if="data" style="padding:16px 18px">
        <div class="grow"><div class="label">在这里累计已省（元）</div><div class="big">{{ yuan(data.total_saved) }}</div><div style="font-size:12px;opacity:.85">对比{{ cmpLabel() }}同款价格 + 平台优惠券</div></div>
        <div style="width:58px;height:58px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center"><Icon name="piggy" :size="32" :stroke="1.6" /></div>
      </div>
      <Loading v-if="loading && !data" />
      <Empty v-else-if="!data?.orders.length" text="还没有订单，去周边逛逛吧" icon="receipt"><button class="btn sm mt12" @click="go('/local')">去逛逛</button></Empty>
      <div v-for="o in data?.orders" :key="o.id" class="card tap" @click="go('/order/' + o.id)">
        <div class="row between"><div class="row grow" style="gap:6px"><Icon name="store" :size="16" /><b class="ellipsis">{{ o.merchant_name }}</b><Icon name="right" :size="14" class="muted" /></div><span class="small" :style="{ color: ['completed','refunded','cancelled'].includes(o.status) ? 'var(--ink-3)' : 'var(--brand-ink)' }">{{ orderStatus(o) }}</span></div>
        <div class="row mt12">
          <Cover cls="thumb md" :cat="o.type === 'takeout' ? 'takeout' : 'groupbuy'" :icon="26" />
          <div class="grow"><div class="ellipsis">{{ o.title }}</div>
            <div class="muted" v-if="o.type === 'takeout'">{{ o.delivery_date.slice(5) }} {{ o.delivery_slot }} 送达 · {{ o.delivery_point }}</div>
            <div class="muted" v-else>{{ shortTime(o.created_at) }} · 共 {{ o.quantity }} 份</div>
            <span class="tag save mt4">省{{ yuan(o.saved) }}元</span></div>
          <div class="right"><div class="muted">实付</div><b class="num" style="font-size:16px">¥{{ yuan(o.total_amount) }}</b></div>
        </div>
      </div>
    </div>`,
  setup() {
    const st = ref('');
    const tabs = [{ v: '', t: '全部' }, { v: 'pending_pay', t: '待支付' }, { v: 'paid', t: '待使用' }, { v: 'completed', t: '已完成' }, { v: 'refunded', t: '退款' }];
    const { data, loading, load } = useLoad(() => api('/orders', { query: { status: st.value } }));
    watch(st, () => load());
    return { st, tabs, data, loading };
  },
}, { tab: 'orders', role: 'student' });

/* ---------- 商家入驻申请（学生账号 → 商家） ---------- */
defineRoute('/merchant-apply', {
  template: `<NavBar title="商家入驻" back="/me" />
    <div class="page with-action">
      <div class="hero-card" style="background:linear-gradient(135deg,#4f86ff,#2357f0);box-shadow:0 6px 16px rgba(47,107,255,.28)">
        <div style="font-size:19px;font-weight:700">把店开进 {{ $store.user.school?.name }}</div>
        <div class="row mt12" style="gap:14px;font-size:12px;opacity:.95"><span class="row" style="gap:4px"><Icon name="percent" :size="14" />低抽佣</span><span class="row" style="gap:4px"><Icon name="takeout" :size="14" />外卖团队配送</span><span class="row" style="gap:4px"><Icon name="users" :size="14" />精准触达学生</span></div>
      </div>
      <div class="form">
        <div class="form-title">店铺信息</div>
        <div class="field"><label>店铺名称<span class="req">*</span></label><input v-model="f.name" placeholder="与门头一致"></div>
        <div class="field"><label>经营类目</label><select v-model="f.category"><option v-for="c in cats" :key="c.v" :value="c.v">{{ c.t }}</option></select><Icon name="right" :size="16" class="muted" /></div>
        <div class="field"><label>店铺地址<span class="req">*</span></label><input v-model="f.address" placeholder="如：东门商业街 12 号"></div>
        <div class="field"><label>联系电话<span class="req">*</span></label><input v-model="f.phone"></div>
        <div class="field"><label>距学校</label><input v-model="f.distance_m" type="number" placeholder="选填"><span class="unit">米</span></div>
        <div class="field col"><label>店铺简介</label><textarea v-model="f.intro" placeholder="招牌菜 / 特色"></textarea></div>
      </div>
      <div class="form">
        <div class="form-title">资质照片</div>
        <div class="field col"><label>店铺门头照</label><ImagePicker v-model="f.cover" :max="1" icon="camera" label="门头照" /></div>
        <div class="field col"><label>营业执照 / 食品经营许可证 <span class="muted">仅平台审核可见</span></label><ImagePicker v-model="f.license_image" :max="1" icon="file" label="上传证照" /></div>
      </div>
      <div class="form">
        <div class="field"><label>开通外卖</label><span class="grow muted right">加入校园外卖团队配送</span>
          <button class="switch" :class="{ on: f.takeout_enabled }" @click="f.takeout_enabled = f.takeout_enabled ? 0 : 1"></button></div>
        <div class="field"><label>邀请码</label><input v-model="f.invite_code" placeholder="客户经理提供，如 QD8801" style="text-transform:uppercase"></div>
      </div>
      <div class="hint">填写邀请码后，由对接的客户经理初审、平台终审，并为你提供运营支持。</div>
    </div>
    <div class="action-bar"><button class="btn block" :disabled="busy" @click="submit">提交入驻申请</button></div>`,
  setup() {
    const f = reactive({ name: '', category: 'food', address: '', phone: '', distance_m: '', intro: '', takeout_enabled: 0, invite_code: '', cover: '', license_image: '' });
    const cats = [{ v: 'food', t: '餐饮美食' }, { v: 'netcafe', t: '网吧' }, { v: 'billiards', t: '台球' }, { v: 'homestay', t: '民宿' }, { v: 'ktv', t: 'KTV' }, { v: 'other', t: '其他' }];
    const busy = ref(false);
    return {
      f, cats, busy,
      async submit() {
        busy.value = true;
        try { await post('/merchant/apply', f); await refreshMe(); toast('提交成功，等待审核'); go('/m', true); } catch (e) {} finally { busy.value = false; }
      },
    };
  },
}, { role: 'student' });
