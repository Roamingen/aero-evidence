<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import * as echarts from 'echarts';

const chartsLoading = ref(false);

const stats = ref({
  blockHeight: 0,
  totalChainRecords: 0,
  monthlyNewRecords: 0,
});

const trendData = ref({ dates: [], records: [], blocks: [] });

const browserTabs = ref('records');
const recentRecords = ref([]);
const recentBlocks = ref([]);
const recentTransactions = ref([]);

const activityLog = ref([]);

function getAuthToken() {
  try {
    const s = localStorage.getItem('aero-evidence.auth-session.v1');
    return s ? JSON.parse(s).token || null : null;
  } catch { return null; }
}

async function apiFetch(path) {
  const token = getAuthToken();
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

async function fetchStatistics() {
  try {
    const data = await apiFetch('/api/dashboard/statistics');
    stats.value.blockHeight = data.blockHeight || 0;
    stats.value.totalChainRecords = data.onChainRecords || 0;
  } catch (e) { console.error(e); }
}

async function fetchSystemStats() {
  try {
    const data = await apiFetch('/api/dashboard/system-stats');
    stats.value.monthlyNewRecords = data.recordsThisMonth || 0;
  } catch (e) { console.error(e); }
}

async function fetchTrendData() {
  try {
    const data = await apiFetch('/api/dashboard/trend');
    trendData.value = {
      dates: data.dates || [],
      records: data.records || [],
      blocks: data.blocks || [],
    };
  } catch (e) { console.error(e); }
}

async function fetchBrowserData() {
  try {
    const data = await apiFetch('/api/dashboard/browser');
    recentRecords.value = (data.records || []).map(item => ({
      id: item.id,
      aircraftNo: item.title || '-',
      status: item.status || '已上链',
      chainTime: new Date(item.timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
    }));
  } catch (e) { console.error(e); }
}

async function fetchChainBrowser() {
  try {
    const data = await apiFetch('/api/dashboard/chain-browser');
    recentBlocks.value = data.blocks || [];
    recentTransactions.value = data.transactions || [];
  } catch (e) { console.error(e); }
}

async function fetchActivityLog() {
  try {
    const data = await apiFetch('/api/dashboard/activity-log');
    activityLog.value = (data.activities || []).map(item => ({
      id: item.recordId,
      icon: item.icon,
      action: item.action,
      employee: item.performer,
      aircraft: item.aircraftNo,
      time: new Date(item.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      recordId: item.recordId,
    }));
  } catch (e) { console.error(e); }
}

let _chartInstance = null;
const _resizeHandler = () => _chartInstance?.resize();

function mountChart() {
  const dom = document.getElementById('trend-chart');
  if (!dom || _chartInstance) return;
  _chartInstance = echarts.init(dom);
  _chartInstance.setOption({
    grid: { left: '5%', right: '5%', bottom: '10%', top: '10%', containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(19,32,51,0.92)',
      borderColor: '#607087',
      textStyle: { color: '#f5f7fa' },
    },
    legend: { data: ['上链记录', '生成区块'], textStyle: { color: '#607087' } },
    xAxis: {
      type: 'category',
      data: trendData.value.dates,
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#e4e8ef' } },
      axisLabel: { color: '#607087', fontSize: 11, interval: 2 },
    },
    yAxis: [
      { type: 'value', name: '上链记录数', position: 'left', axisLine: { lineStyle: { color: '#7ab8e6' } }, axisLabel: { color: '#607087' } },
      { type: 'value', name: '生成区块数', position: 'right', axisLine: { lineStyle: { color: '#e8b8a1' } }, axisLabel: { color: '#607087' } },
    ],
    series: [
      { name: '上链记录', data: trendData.value.records, type: 'line', smooth: true, itemStyle: { color: '#7ab8e6' }, lineStyle: { color: '#7ab8e6', width: 2.5 }, areaStyle: { color: 'rgba(122,184,230,0.18)' }, yAxisIndex: 0 },
      { name: '生成区块', data: trendData.value.blocks, type: 'line', smooth: true, itemStyle: { color: '#e8b8a1' }, lineStyle: { color: '#e8b8a1', width: 2.5 }, areaStyle: { color: 'rgba(232,184,161,0.18)' }, yAxisIndex: 1 },
    ],
  });
  window.addEventListener('resize', _resizeHandler);
}

function unmountChart() {
  window.removeEventListener('resize', _resizeHandler);
  _chartInstance?.dispose();
  _chartInstance = null;
}

onMounted(async () => {
  await Promise.all([
    fetchStatistics(),
    fetchSystemStats(),
    fetchTrendData(),
    fetchBrowserData(),
    fetchChainBrowser(),
    fetchActivityLog(),
  ]);
  mountChart();
  document.addEventListener('visibilitychange', () => {
    document.visibilityState === 'hidden' ? unmountChart() : mountChart();
  });
});

onUnmounted(unmountChart);
</script>

<template>
  <div class="module-stack">
    <!-- 统计卡片 -->
    <section class="module-grid card-grid-three">
      <article class="module-panel primary-summary-card">
        <div class="module-title light-title">区块高度</div>
        <div class="member-card-count light-count">{{ stats.blockHeight }}</div>
        <div class="module-subtitle light-copy">blocks</div>
      </article>
      <article class="module-panel">
        <div class="module-title">上链记录总数</div>
        <div class="member-card-count">{{ stats.totalChainRecords }}</div>
        <div class="module-subtitle">records</div>
      </article>
      <article class="module-panel">
        <div class="module-title">本月新增</div>
        <div class="member-card-count">{{ stats.monthlyNewRecords }}</div>
        <div class="module-subtitle">records</div>
      </article>
    </section>

    <!-- 区块链浏览器 + 折线图 -->
    <section class="module-grid two-up-grid">
      <article class="module-panel">
        <div class="module-title">区块链浏览器</div>
        <el-tabs v-model="browserTabs" class="browser-tabs-compact">
          <el-tab-pane label="最新条目" name="records">
            <div class="browser-content-compact">
              <div v-if="recentRecords.length === 0" class="empty-tip">暂无上链记录</div>
              <div v-for="item in recentRecords" :key="item.id" class="queue-card">
                <div class="queue-card-head">
                  <strong>{{ item.id }}</strong>
                  <span class="status-chip">{{ item.status }}</span>
                </div>
                <div class="queue-card-copy">{{ item.aircraftNo }}</div>
                <div class="queue-card-foot">{{ item.chainTime }}</div>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="最新区块" name="blocks">
            <div class="browser-content-compact">
              <div v-if="recentBlocks.length === 0" class="empty-tip">链上暂无区块数据</div>
              <div v-for="item in recentBlocks" :key="item.blockNo" class="queue-card">
                <div class="queue-card-head">
                  <strong>Block #{{ item.blockNo }}</strong>
                  <span class="status-chip">{{ item.transactions }} txns</span>
                </div>
                <div class="queue-card-copy mono" style="font-size:0.78rem">{{ item.hash }}</div>
                <div class="queue-card-foot">{{ item.timestamp }}</div>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="最新交易" name="transactions">
            <div class="browser-content-compact">
              <div v-if="recentTransactions.length === 0" class="empty-tip">暂无交易数据</div>
              <div v-for="item in recentTransactions" :key="item.hash" class="queue-card">
                <div class="queue-card-head">
                  <strong>{{ item.type }}</strong>
                  <span class="status-chip">{{ item.status }}</span>
                </div>
                <div class="queue-card-copy mono" style="font-size:0.78rem">{{ item.hash }}</div>
                <div class="queue-card-foot">{{ item.aircraftNo }} · {{ item.timestamp }}</div>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </article>

      <article class="module-panel">
        <div class="module-title">最近30天上链趋势</div>
        <div v-loading="chartsLoading" class="chart-container">
          <div id="trend-chart" style="width:100%;height:100%"></div>
        </div>
      </article>
    </section>

    <!-- 最近活动 -->
    <section class="module-panel">
      <div class="module-title">最近活动</div>
      <div class="activity-timeline">
        <div v-if="activityLog.length === 0" class="empty-tip">暂无活动记录</div>
        <div v-for="item in activityLog" :key="item.id" class="activity-item">
          <div class="activity-icon">{{ item.icon }}</div>
          <div class="activity-content">
            <div class="activity-head">
              <span class="activity-actor">{{ item.employee }}</span>
              <span class="activity-action">{{ item.action }}</span>
            </div>
            <div class="activity-meta">{{ item.aircraft }} · {{ item.recordId }} · {{ item.time }}</div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped lang="css">
.chart-container { width: 100%; height: 360px; position: relative; }

.browser-tabs-compact { margin-bottom: 0; }
.browser-tabs-compact :deep(.el-tabs__header) { margin: 0 0 0.75rem 0 !important; }

.browser-content-compact { display: grid; gap: 0.65rem; max-height: 310px; overflow-y: auto; }

.empty-tip { color: #999; font-size: 0.85rem; padding: 1rem; }

.activity-timeline { display: grid; gap: 0.8rem; }

.activity-item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 1rem;
  padding: 0.9rem 1rem;
  border-radius: 1rem;
  background: rgba(248,250,253,0.95);
  border: 1px solid rgba(19,32,51,0.06);
  align-items: start;
}

.activity-icon { font-size: 1.5rem; min-width: 2rem; display: flex; align-items: center; justify-content: center; }
.activity-content { min-width: 0; }
.activity-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; }
.activity-actor { font-weight: 700; color: #17263a; }
.activity-action { color: #607087; font-size: 0.95rem; }
.activity-meta { font-size: 0.85rem; color: #74849a; }

@media (max-width: 1024px) {
  .browser-content-compact { max-height: 280px; }
  .chart-container { height: 300px; }
}
@media (max-width: 768px) {
  .chart-container { height: 320px; }
  .activity-item { gap: 0.75rem; padding: 0.8rem 0.9rem; }
}
</style>
