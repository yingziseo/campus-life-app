/* 应用入口：根组件 + 启动流程 */
const Root = {
  components: { PublishSheet },
  template: `<div class="shell">
      <component v-if="$store.ready && view" :is="view" :key="$store.route.full" />
      <div v-else class="page"><Loading style="padding-top:45%" /></div>
      <TabBar v-if="$store.ready && tab && $store.user" :active="tab" :set="tabset" />
      <PublishSheet v-if="$store.sheet === 'publish'" />
      <div v-if="$store.dialog" class="dialog-wrap"><div class="dialog">
        <div class="dc"><h4>{{ $store.dialog.title }}</h4><p v-if="$store.dialog.content">{{ $store.dialog.content }}</p></div>
        <div class="db"><button @click="closeDialog(false)">{{ $store.dialog.cancelText }}</button><button @click="closeDialog(true)">{{ $store.dialog.okText }}</button></div>
      </div></div>
      <div v-if="$store.photo" class="mask" @click.self="closePhoto(false)"><div class="sheet">
        <div class="sheet-title">{{ $store.photo.title }}</div>
        <p class="muted center" style="margin:-8px 0 14px" v-if="$store.photo.desc">{{ $store.photo.desc }}</p>
        <ImagePicker v-model="$store.photo.url" :max="1" large icon="camera" label="拍照 / 从相册选择" />
        <div class="row mt16"><button class="btn ghost" style="flex:1;height:44px;border-radius:22px" @click="closePhoto(false)">取消</button>
          <button class="btn" style="flex:2;height:44px;border-radius:22px" :disabled="!$store.photo.url" @click="closePhoto(true)">确认提交</button></div>
      </div></div>
      <div v-if="$store.img" class="imgview" @click="$store.img = ''"><img :src="$store.img" alt=""></div>
      <div v-if="$store.toast" class="toast">{{ $store.toast }}</div>
    </div>`,
  setup() {
    const view = computed(() => store.route.route?.component);
    const tab = computed(() => store.route.route?.meta.tab);
    const tabset = computed(() => store.route.route?.meta.tabs);
    return {
      view, tab, tabset,
      closeDialog(ok) { const d = store.dialog; store.dialog = null; d.resolve(ok); },
      closePhoto(ok) { const p = store.photo; store.photo = null; p.resolve(ok ? p.url : null); },
    };
  },
};

async function boot() {
  // 预览页通过 ?as=student|merchant|manager 一键切换演示身份
  const as = new URLSearchParams(location.search).get('as');
  if (as) {
    try { const r = await post('/auth/demo', { role: as }, { silent: true }); setToken(r.token); } catch (e) { toast('演示登录失败：' + e.message); }
    history.replaceState(null, '', location.pathname + (location.hash || ''));
    if (!location.hash || location.hash === '#/') location.hash = '#' + roleHome(as);
  }
  try { Object.assign(store.config, await api('/config', { silent: true })); } catch (e) {}
  if (store.token) {
    try { await refreshMe(); } catch (e) { setToken(''); }
  }
  store.ready = true;
  syncRoute();
}

const app = createApp(Root);
Object.entries(Globals).forEach(([name, c]) => app.component(name, c));
Object.assign(app.config.globalProperties, {
  $store: store, go, back, roleHome, isRider, orderStatus, yuan, pct, timeAgo, shortTime, catOf, gradOf, dealCat, avatarColor, statusText, statusCls,
  cmpLabel, feePct, topicStyle, todayStr,
});
app.mount('#app');
boot();

// 接收预览页指令
window.addEventListener('message', (e) => {
  if (e.data?.type === 'campus-go') go(e.data.path);
});
