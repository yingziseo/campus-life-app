/* 骑手端（校园外卖团队）：学生兼职，按"日期 + 送餐时间点"批次集中取餐、按取餐点集中送达 */

const dayLabel = (d) => (d === todayStr() ? '今天' : d.slice(5));

defineRoute('/r', {
  template: `<NavBar title="骑手工作台" />
    <div class="page with-bar" v-if="d">
      <div class="hero-card">
        <div class="row between"><span style="opacity:.85">今日收入（元）</span><span class="tag" style="background:rgba(255,255,255,.2);color:#fff">每单提成 ¥{{ yuan(d.rider_commission) }}</span></div>
        <div class="big">{{ yuan(d.today_earning) }}</div>
        <div class="stats mt12">
          <div class="stat"><b>{{ d.today_delivered }}</b><span>今日送达</span></div>
          <div class="stat"><b>{{ d.delivering }}</b><span>配送中</span></div>
          <div class="stat"><b>{{ yuan(d.total_earning) }}</b><span>累计收入</span></div>
        </div>
      </div>
      <div class="section-title">配送批次 <small>固定时间点集中配送</small></div>
      <Empty v-if="!d.batches.length" text="暂无外卖批次，等同学们下单吧" icon="🛵" />
      <div v-for="b in d.batches" :key="b.delivery_date + b.delivery_slot" class="card" style="cursor:pointer" @click="go('/r/batch?date=' + b.delivery_date + '&slot=' + b.delivery_slot)">
        <div class="row between">
          <div class="row"><Icon name="clock" :size="20" /><b style="font-size:17px">{{ dayLabel(b.delivery_date) }} {{ b.delivery_slot }}</b><span class="muted">送达</span></div>
          <span class="tag" :class="b.completed === b.total ? 'ok' : 'primary'">{{ b.completed === b.total ? '已完成' : '进行中' }}</span>
        </div>
        <div class="muted mt8">{{ b.total }} 单 · {{ b.merchants }} 家商家 · {{ b.points }} 个取餐点</div>
        <div class="row mt8" style="gap:6px;flex-wrap:wrap">
          <span class="tag warn" v-if="b.cooking">备餐中 {{ b.cooking }}</span>
          <span class="tag primary" v-if="b.ready">待取餐 {{ b.ready }}</span>
          <span class="tag primary" v-if="b.my_delivering">我配送中 {{ b.my_delivering }}</span>
          <span class="tag ok" v-if="b.completed">已送达 {{ b.completed }}</span>
          <span class="grow"></span><span class="muted">查看 ›</span>
        </div>
      </div>
      <div class="notice">送餐前 40 分钟截单，商家出餐后到店批量取餐，按取餐点一次送达</div>
    </div>
    <div v-else class="loading">加载中…</div>`,
  setup() { const { data: d } = useLoad(() => api('/rider/dashboard')); return { d, dayLabel }; },
}, { tab: 'r-home', tabs: 'rider', rider: true, role: 'student' });

defineRoute('/r/batch', {
  template: `<NavBar :title="title" back="/r" />
    <div class="seg"><button :class="{ on: step === 'pick' }" @click="step = 'pick'">① 到店取餐</button><button :class="{ on: step === 'drop' }" @click="step = 'drop'">② 送达取餐点 <template v-if="dropCount">({{ dropCount }})</template></button></div>
    <div class="page" style="padding-top:10px;padding-bottom:90px" v-if="b">
      <template v-if="step === 'pick'">
        <Empty v-if="!b.pickups.length" text="这个批次没有订单" icon="🛵" />
        <div v-for="g in b.pickups" :key="g.merchant_id" class="card flush">
          <div class="pickup-head"><span style="font-size:20px">🏪</span><div class="grow"><b>{{ g.merchant_name }}</b><div class="muted">{{ g.merchant_address }}</div></div>
            <button class="btn sm" v-if="readyIds(g).length" @click="pickup(readyIds(g))">取餐 {{ readyIds(g).length }} 单</button></div>
          <div v-for="o in g.orders" :key="o.id" class="cell" style="cursor:default">
            <div class="grow"><div class="ellipsis">{{ o.title }} × {{ o.quantity }}</div><div class="muted">送 {{ o.delivery_point }} · {{ o.nickname }}<template v-if="o.remark"> · {{ o.remark }}</template></div></div>
            <span class="tag" :class="tagCls(o)">{{ label(o) }}</span>
          </div>
        </div>
      </template>
      <template v-else>
        <Empty v-if="!b.drops.length" text="先去商家取餐吧" icon="📦" />
        <div v-for="g in b.drops" :key="g.point" class="card flush">
          <div class="pickup-head"><Icon name="location" :size="20" /><b class="grow">{{ g.point }}</b>
            <button class="btn sm" v-if="deliveringIds(g).length" @click="deliver(deliveringIds(g))">全部送达 {{ deliveringIds(g).length }} 单</button></div>
          <div v-for="o in g.orders" :key="o.id" class="cell" style="cursor:default">
            <div class="grow"><div class="ellipsis">{{ o.nickname }} · {{ o.title }} × {{ o.quantity }}</div><div class="muted">{{ o.merchant_name }} · {{ o.contact_phone }}</div></div>
            <span class="tag" :class="tagCls(o)">{{ label(o) }}</span>
          </div>
        </div>
      </template>
    </div>
    <div v-else class="loading">加载中…</div>`,
  setup() {
    const q = store.route.query;
    const title = `${dayLabel(q.date || todayStr())} ${q.slot || ''} 批次`;
    const step = ref('pick');
    const { data: b, load } = useLoad(() => api('/rider/batch', { query: { date: q.date, slot: q.slot } }));
    const dropCount = computed(() => (b.value?.drops || []).reduce((n, g) => n + g.orders.filter((o) => o.status === 'delivering').length, 0));
    const label = (o) => ({ paid: '备餐中', ready: '待取餐', delivering: o.mine ? '我配送中' : '他人配送', completed: '已送达' })[o.status];
    const tagCls = (o) => ({ paid: 'warn', ready: 'primary', delivering: o.mine ? 'primary' : '', completed: 'ok' })[o.status];
    return {
      title, step, b, dropCount, label, tagCls,
      readyIds: (g) => g.orders.filter((o) => o.status === 'ready').map((o) => o.id),
      deliveringIds: (g) => g.orders.filter((o) => o.status === 'delivering' && o.mine).map((o) => o.id),
      async pickup(ids) {
        try { const r = await post('/rider/pickup', { order_ids: ids }); toast(`已取餐 ${r.picked} 单`); await load(); step.value = 'drop'; } catch (e) { load(); }
      },
      async deliver(ids) {
        if (!(await confirmBox(`确认 ${ids.length} 单已送达？`, '送达后将通知同学取餐'))) return;
        try { const r = await post('/rider/deliver', { order_ids: ids }); toast(`送达 ${r.delivered} 单，收入 +¥${yuan(r.earning)}`); load(); } catch (e) { load(); }
      },
    };
  },
}, { tab: 'r-home', tabs: 'rider', rider: true, role: 'student' });

defineRoute('/r/earnings', {
  template: `<NavBar title="我的收入" />
    <div class="page with-bar" style="padding-top:12px">
      <Empty v-if="data && !data.length" text="还没有收入，送出第一单吧" icon="💰" />
      <div class="card flush" v-else-if="data">
        <div v-for="l in data" :key="l.id" class="list-item" style="cursor:default">
          <div class="grow"><b class="ellipsis" style="display:block">{{ l.title }}</b><div class="muted ellipsis">{{ l.remark }}</div><div class="muted">{{ shortTime(l.created_at) }}</div></div>
          <b style="color:var(--primary);font-size:16px">+{{ yuan(l.amount) }}</b>
        </div>
      </div>
      <p class="muted center">送达即入账 · 提现功能正式版接入微信支付分账</p>
    </div>`,
  setup() { const { data } = useLoad(() => api('/rider/earnings')); return { data }; },
}, { tab: 'r-earnings', tabs: 'rider', rider: true, role: 'student' });
