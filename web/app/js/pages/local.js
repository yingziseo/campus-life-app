/* 学生端 · 周边本地生活：商家列表、店铺、下单、支付、券码、订单、商家入驻申请 */

const LOCAL_CATS = [
  { v: '', t: '全部' }, { v: 'takeout', t: '🛵 校园外卖' }, { v: 'food', t: '美食' }, { v: 'netcafe', t: '网吧' },
  { v: 'billiards', t: '台球' }, { v: 'homestay', t: '民宿' }, { v: 'ktv', t: 'KTV' },
];
const dist = (m) => (m ? (m >= 1000 ? (m / 1000).toFixed(1) + 'km' : m + 'm') : '');

defineRoute('/local', {
  template: `<NavBar title="周边生活" />
    <div class="seg"><button v-for="c in cats" :key="c.v" :class="{ on: cat === c.v }" @click="cat = c.v">{{ c.t }}</button></div>
    <div class="page with-bar">
      <div class="compare" style="margin:10px 12px">
        <span style="font-size:18px">💰</span><span class="grow">每一单都标注 <b>比美团省多少</b>，同一家店，同样的菜</span>
      </div>
      <div v-if="cat === 'takeout'" class="notice" style="margin-top:0">🛵 校园外卖每天 {{ slots }} 集中送到取餐点，配送费仅 ¥1.5</div>
      <div v-if="loading && !data" class="loading">加载中…</div>
      <Empty v-else-if="!data?.length" text="这个分类还没有商家入驻" icon="🏪" />
      <div class="card flush" v-else>
        <div v-for="m in data" :key="m.id" class="list-item" @click="go('/local/merchant/' + m.id)">
          <Cover cls="thumb" :src="m.cover" :emoji="catOf(m.category).emoji" :bg="catOf(m.category).bg" />
          <div class="grow">
            <div class="row between"><b class="ellipsis">{{ m.name }}</b><span class="muted">{{ dist(m.distance_m) }}</span></div>
            <div class="muted ellipsis">{{ catOf(m.category).name }} · {{ m.intro }}</div>
            <div class="row mt8" style="flex-wrap:wrap;gap:6px">
              <span v-if="m.max_saving > 0" class="tag save">最高省{{ yuan(m.max_saving) }}元</span>
              <span v-if="m.takeout_enabled" class="tag primary">校园外卖</span>
              <span class="muted">已售 {{ m.sold }}</span>
            </div>
            <div class="row mt8" v-if="m.min_price"><span class="price" style="font-size:15px"><small>¥</small>{{ yuan(m.min_price) }}</span><span class="muted">起</span></div>
          </div>
        </div>
      </div>
    </div>`,
  setup() {
    const cat = ref(store.route.query.cat || '');
    const { data, loading, load } = useLoad(() => api('/local/merchants', { query: { category: cat.value } }));
    const slots = ref('11:30 / 17:30 / 21:00');
    watch(cat, () => load());
    onMounted(async () => {
      try { const c = await api(`/schools/${store.user.school.id}/config`, { silent: true }); slots.value = c.delivery_slots.join(' / '); } catch (e) {}
    });
    return { cats: LOCAL_CATS, cat, data, loading, dist, slots };
  },
}, { tab: 'local', role: 'student' });

defineRoute('/local/merchant/:id', {
  template: `<NavBar :title="m?.name || '店铺'" back="/local" />
    <div class="page" v-if="m">
      <Cover :src="m.cover" :emoji="catOf(m.category).emoji" :bg="catOf(m.category).bg" style="height:150px;font-size:64px" />
      <div class="card" style="margin-top:-18px;position:relative">
        <h3 style="margin:0 0 4px">{{ m.name }}</h3>
        <div class="muted">{{ catOf(m.category).name }} · {{ m.intro }}</div>
        <div class="row mt8 ink2" style="font-size:13px"><Icon name="location" :size="14"/><span class="grow ellipsis">{{ m.address }}</span><span class="muted">{{ dist(m.distance_m) }}</span></div>
      </div>
      <template v-for="g in groups" :key="g.type">
        <div class="section-title" v-if="g.items.length">{{ g.title }} <small>{{ g.sub }}</small></div>
        <div class="card flush" v-if="g.items.length">
          <div v-for="d in g.items" :key="d.id" class="list-item" @click="go('/local/deal/' + d.id)">
            <Cover cls="thumb" :src="d.image" :emoji="d.type === 'takeout' ? '🛵' : '🎫'" :bg="catOf(d.type === 'takeout' ? 'takeout' : m.category).bg" />
            <div class="grow">
              <b class="ellipsis" style="display:block">{{ d.title }}</b>
              <div class="row" style="gap:6px;margin-top:2px"><span class="tag save">比美团省{{ yuan(d.saving) }}元</span><span v-if="d.voucher_label" class="tag outline">{{ d.voucher_label }}</span></div>
              <div class="row mt8"><span class="price"><small>¥</small>{{ yuan(d.sale_price) }}</span><span class="strike">美团¥{{ yuan(d.competitor_price) }}</span>
                <span class="grow"></span><button class="btn sm">抢购</button></div>
            </div>
          </div>
        </div>
      </template>
      <Empty v-if="!m.deals.length" text="商家还没有上架商品" />
    </div>`,
  setup() {
    const { data: m } = useLoad(() => api('/local/merchants/' + store.route.params.id));
    const groups = computed(() => !m.value ? [] : [
      { type: 'takeout', title: '校园外卖', sub: '固定时间送到取餐点', items: m.value.deals.filter((d) => d.type === 'takeout') },
      { type: 'groupbuy', title: '到店团购', sub: '买券到店核销，随时退', items: m.value.deals.filter((d) => d.type === 'groupbuy') },
    ]);
    return { m, groups, dist };
  },
}, { role: 'student' });

defineRoute('/local/deal/:id', {
  template: `<NavBar title="商品详情" back />
    <div class="page" style="padding-bottom:90px" v-if="d">
      <Cover :src="d.image" :emoji="d.type === 'takeout' ? '🛵' : '🎫'" :bg="d.type === 'takeout' ? '#e9f7ff' : '#fff1e6'" style="height:200px;font-size:80px" />
      <div class="card" style="margin-top:-18px;position:relative">
        <div class="row"><span class="price lg"><small>¥</small>{{ yuan(d.sale_price) }}</span>
          <span class="strike" v-if="d.pricing_mode === 'voucher'">到店价 ¥{{ yuan(d.list_price) }}</span>
          <span class="grow"></span><span class="muted">已售 {{ d.sold }}</span></div>
        <h3 style="margin:6px 0 4px">{{ d.title }}</h3>
        <div class="muted">{{ d.merchant_name }}<template v-if="d.description"> · {{ d.description }}</template></div>
        <div class="compare mt12"><span class="grow">美团同款 <s>¥{{ yuan(d.competitor_price) }}</s></span><span>这里买 <b>省 ¥{{ yuan(d.saving) }}</b></span></div>
        <div v-if="d.voucher_label" class="muted mt8">💡 含平台代金券「{{ d.voucher_label }}」：到店标价 ¥{{ yuan(d.list_price) }}，券已自动抵扣</div>
      </div>

      <template v-if="d.type === 'takeout'">
        <div class="section-title">送餐时间 <small>送餐前 40 分钟截单，错过顺延到次日</small></div>
        <div class="card"><div class="chips">
          <span v-for="s in d.delivery.delivery_slots" :key="s" class="chip" :class="{ on: f.delivery_slot === s }" @click="f.delivery_slot = s"><Icon name="clock" :size="14" style="margin-right:4px"/>{{ slotDay(s) }} {{ s }}</span></div></div>
        <div class="section-title">取餐点</div>
        <div class="card"><div class="chips">
          <span v-for="p in d.delivery.delivery_points" :key="p" class="chip" :class="{ on: f.delivery_point === p }" @click="f.delivery_point = p">{{ p }}</span></div></div>
        <div class="form"><div class="field"><label>备注</label><input v-model="f.remark" placeholder="少辣 / 不要香菜"></div></div>
      </template>
      <div v-else class="card">
        <div class="card-title">购买须知</div>
        <div class="ink2" style="font-size:13px">· 支付后获得券码，到店出示给商家核销<br>· 未使用可随时退款，原路返回<br>· 地址：{{ d.address }}</div>
      </div>

      <div class="form">
        <div class="field"><label>数量</label><span class="grow"></span>
          <button class="btn sm line" @click="f.quantity > 1 && f.quantity--">－</button><b style="width:28px;text-align:center">{{ f.quantity }}</b><button class="btn sm line" @click="f.quantity < 20 && f.quantity++">＋</button></div>
      </div>
    </div>
    <div class="action-bar" v-if="d">
      <div class="grow"><div><span class="muted">合计 </span><span class="price"><small>¥</small>{{ yuan(total) }}</span></div>
        <div class="muted" v-if="d.type === 'takeout'">含配送费 ¥{{ yuan(d.delivery_fee) }} · 共省 ¥{{ yuan(d.saving * f.quantity) }}</div>
        <div class="muted" v-else>比美团省 ¥{{ yuan(d.saving * f.quantity) }}</div></div>
      <button class="btn" style="height:44px;padding:0 28px;border-radius:22px" :disabled="busy" @click="submit">提交订单</button>
    </div>`,
  setup() {
    const f = reactive({ quantity: 1, delivery_slot: '', delivery_point: '', remark: '' });
    const { data: d } = useLoad(async () => {
      const r = await api('/local/deals/' + store.route.params.id);
      if (r.delivery) { f.delivery_slot = r.delivery.delivery_slots[0] || ''; f.delivery_point = r.delivery.delivery_points[0] || ''; }
      return r;
    });
    const total = computed(() => d.value ? d.value.sale_price * f.quantity + (d.value.type === 'takeout' ? d.value.delivery_fee : 0) : 0);
    const busy = ref(false);
    // 与后端 OrderService::resolveDelivery 同一规则：距送餐不足截单时间则顺延到明天
    const slotDay = (s) => {
      const [h, m] = s.split(':').map(Number);
      const t = new Date(); t.setHours(h, m, 0, 0);
      return Date.now() + (d.value?.cutoff_minutes ?? 40) * 60000 <= t.getTime() ? '今天' : '明天';
    };
    return {
      d, f, total, busy, slotDay,
      async submit() {
        busy.value = true;
        try { const o = await post('/orders', { deal_id: d.value.id, ...f }); go('/order/' + o.id, true); } catch (e) {} finally { busy.value = false; }
      },
    };
  },
}, { role: 'student' });

defineRoute('/order/:id', {
  template: `<NavBar title="订单详情" back="/orders" />
    <div class="page" style="padding-top:12px;padding-bottom:90px" v-if="o">
      <div class="card center" v-if="o.status === 'pending_pay'">
        <div class="muted">需支付</div><div class="price lg" style="margin:4px 0"><small>¥</small>{{ yuan(o.total_amount) }}</div>
        <div class="tag save">已为你省下 ¥{{ yuan(o.saved) }}</div>
      </div>
      <div class="card" v-else>
        <div class="row between"><b style="font-size:16px">{{ orderStatus(o) }}</b><span class="tag save">本单省 ¥{{ yuan(o.saved) }}</span></div>
        <template v-if="o.type === 'takeout'">
          <div class="mt12"><Steps :items="['已支付','已出餐','配送中','已送达']" :current="{ paid: 0, ready: 1, delivering: 2, completed: 3 }[o.status] ?? -1" /></div>
          <div class="muted mt8" v-if="o.rider_name">配送骑手：{{ o.rider_name }}（校园外卖团队）</div>
          <div class="compare mt12" style="background:var(--primary-soft);color:var(--primary-ink)"><Icon name="clock" :size="18"/>
            <span class="grow">{{ o.delivery_date === today ? '今天' : o.delivery_date }} {{ o.delivery_slot }} 送达 <b>{{ o.delivery_point }}</b></span></div>
        </template>
        <template v-else-if="o.coupons.length">
          <div class="muted mt8">到店出示券码，由商家核销</div>
          <div v-for="c in o.coupons" :key="c.code" class="coupon" :class="{ used: c.status !== 'unused' }">
            <div><div class="muted">券码</div><div class="code">{{ c.code.replace(/(\\d{4})(?=\\d)/g, '$1 ') }}</div></div>
            <span class="tag" :class="c.status === 'unused' ? 'primary' : ''">{{ { unused: '待使用', used: '已使用', refunded: '已退款' }[c.status] }}</span>
          </div>
        </template>
      </div>
      <div class="card">
        <div class="row" style="cursor:pointer" @click="go('/local/merchant/' + o.merchant_id)"><b class="grow">{{ o.merchant_name }}</b><Icon name="right" :size="14" class="muted"/></div>
        <div class="muted">{{ o.merchant_address }}</div>
        <div class="divider"></div>
        <div class="quote" style="background:transparent;padding:0">
          <div class="line"><span>{{ o.title }} × {{ o.quantity }}</span><b>¥{{ yuan(o.goods_amount) }}</b></div>
          <div class="line" v-if="o.delivery_fee"><span>配送费</span><b>¥{{ yuan(o.delivery_fee) }}</b></div>
          <div class="line muted"><span>美团同款价</span><s>¥{{ yuan(o.competitor_amount) }}</s></div>
          <div class="line"><span>实付</span><b class="price" style="font-size:16px">¥{{ yuan(o.total_amount) }}</b></div>
          <div class="divider"></div>
          <div class="line muted"><span>订单号</span><span>{{ o.order_no }}</span></div>
          <div class="line muted"><span>下单时间</span><span>{{ shortTime(o.created_at) }}</span></div>
          <div class="line muted" v-if="o.remark"><span>备注</span><span>{{ o.remark }}</span></div>
        </div>
      </div>
    </div>
    <div class="action-bar" v-if="o && (o.status === 'pending_pay' || canRefund)">
      <template v-if="o.status === 'pending_pay'">
        <button class="btn line" @click="cancel">取消订单</button>
        <button class="btn" style="flex:1;height:44px;border-radius:22px" :disabled="busy" @click="pay">微信支付 ¥{{ yuan(o.total_amount) }}（模拟）</button>
      </template>
      <button v-else class="btn line block" @click="cancel">申请退款</button>
    </div>`,
  setup() {
    const { data: o } = useLoad(() => api('/orders/' + store.route.params.id));
    const busy = ref(false);
    const today = todayStr();
    const canRefund = computed(() => o.value?.status === 'paid' && (o.value.type === 'takeout' || o.value.coupons.every((c) => c.status === 'unused')));
    return {
      o, busy, today, canRefund,
      async pay() {
        busy.value = true;
        try { o.value = await post(`/orders/${o.value.id}/pay`); toast('支付成功'); } catch (e) {} finally { busy.value = false; }
      },
      async cancel() {
        const paid = o.value.status === 'paid';
        if (!(await confirmBox(paid ? '确定申请退款？' : '确定取消订单？', paid ? '退款将原路返回' : ''))) return;
        try { o.value = await post(`/orders/${o.value.id}/cancel`); toast(paid ? '退款成功' : '已取消'); } catch (e) {}
      },
    };
  },
}, { role: 'student' });

defineRoute('/orders', {
  template: `<NavBar title="我的订单" />
    <div class="seg"><button v-for="t in tabs" :key="t.v" :class="{ on: st === t.v }" @click="st = t.v">{{ t.t }}</button></div>
    <div class="page with-bar">
      <div class="hero-card row" v-if="data" style="padding:14px 18px">
        <div class="grow"><div style="opacity:.8;font-size:12px">在这里累计已省</div><div class="big">¥{{ yuan(data.total_saved) }}</div></div><span style="font-size:40px">🐷</span>
      </div>
      <div v-if="loading && !data" class="loading">加载中…</div>
      <Empty v-else-if="!data?.orders.length" text="还没有订单，去周边逛逛吧" icon="🧾"><button class="btn mt12" @click="go('/local')">去逛逛</button></Empty>
      <div v-for="o in data?.orders" :key="o.id" class="card" style="cursor:pointer" @click="go('/order/' + o.id)">
        <div class="row between"><b class="ellipsis grow">{{ o.merchant_name }}</b><span :class="statusCls('order', o.status)">{{ orderStatus(o) }}</span></div>
        <div class="row mt8"><div class="thumb sm" :style="{ background: o.type === 'takeout' ? '#e9f7ff' : '#fff1e6' }">{{ o.type === 'takeout' ? '🛵' : '🎫' }}</div>
          <div class="grow"><div class="ellipsis">{{ o.title }} × {{ o.quantity }}</div>
            <div class="muted" v-if="o.type === 'takeout'">{{ o.delivery_date.slice(5) }} {{ o.delivery_slot }} · {{ o.delivery_point }}</div>
            <div class="muted" v-else>{{ shortTime(o.created_at) }}</div></div>
          <div style="text-align:right"><div class="price" style="font-size:15px">¥{{ yuan(o.total_amount) }}</div><div class="tag save">省{{ yuan(o.saved) }}</div></div></div>
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
    <div class="page" style="padding-bottom:90px">
      <div class="hero-card"><div style="font-size:18px;font-weight:700">把店开进 {{ $store.user.school?.name }}</div>
        <div style="opacity:.85;font-size:13px;margin-top:4px">抽佣远低于外卖平台 · 校园外卖团队集中配送 · 精准触达全校学生</div></div>
      <div class="form">
        <div class="field"><label>店铺名称</label><input v-model="f.name"></div>
        <div class="field"><label>经营类目</label><select v-model="f.category"><option v-for="c in cats" :key="c.v" :value="c.v">{{ c.t }}</option></select></div>
        <div class="field"><label>店铺地址</label><input v-model="f.address"></div>
        <div class="field"><label>联系电话</label><input v-model="f.phone"></div>
        <div class="field"><label>距学校</label><input v-model="f.distance_m" type="number" placeholder="选填"><span class="unit">米</span></div>
        <div class="field col"><label>店铺简介</label><textarea v-model="f.intro" placeholder="招牌菜 / 特色"></textarea></div>
        <div class="field col"><label>店铺封面</label><ImagePicker v-model="f.cover" :max="1" label="门头照" /></div>
        <div class="field col"><label>营业执照 / 食品经营许可证 <span class="muted">（仅平台审核可见）</span></label><ImagePicker v-model="f.license_image" :max="1" label="上传证照" /></div>
      </div>
      <div class="form">
        <div class="field"><label>开通外卖</label><span class="grow muted" style="text-align:right">加入校园外卖团队配送</span>
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
