<script setup>
import { ref, onMounted } from 'vue';
import * as echarts from 'echarts';

// ============ 数据部分 ============

const chartsLoading = ref(false);

// 全局统计数据
const stats = ref({
  blockHeight: 12456,
  totalChainRecords: 3847,
  monthlyNewRecords: 328,
  chainConfirmationRate: 99.8,
});

// 折线图数据 (最近30天)
const trendData = ref({
  dates: [],
  records: [],
  blocks: [],
});

// 浏览器数据
const browserTabs = ref('records');
const recentRecords = ref([]);
const recentBlocks = ref([]);
const recentTransactions = ref([]);

// 活动日志数据
const activityLog = ref([]);

// 用户和系统统计数据
const userStats = ref({
  totalUsers: 156,
  totalRoles: 5,
  activeUsers: 128,
  pendingActivation: 8,
});

const systemStats = ref({
  totalRecords: 3847,
  recordsThisMonth: 328,
  chainConfirmationRate: 99.8,
  averageApprovalTime: '2.3h',
});

// 系统信息
const systemInfo = ref({
  version: '1.0.0-beta',
  lastUpdateTime: '2026-03-16 14:30:00',
  updateLog: 'HomePage 功能上线',
  helpUrl: 'https://docs.example.com',
});

// ============ 初始化数据 ============

function generateTrendData() {
  const dates = [];
  const records = [];
  const blocks = [];

  for (let i = 29; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    dates.push(date.toLocaleDateString('zh-CN'));

    records.push(Math.floor(Math.random() * 20) + 5);
    blocks.push(Math.floor(Math.random() * 100) + 50);
  }

  trendData.value = { dates, records, blocks };
}

function generateMockRecords() {
  const statuses = ['已上链', '待确认', '草稿'];
  const records = [];

  for (let i = 0; i < 5; i++) {
    records.push({
      id: `REC-2026031501${i}`,
      aircraftNo: `B-${Math.random().toString(36).substring(7).toUpperCase()}`,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      submittedBy: `员工${Math.floor(Math.random() * 100)}`,
      chainTime: new Date(Date.now() - Math.random() * 1000 * 60 * 60 * 24).toLocaleString('zh-CN'),
    });
  }

  recentRecords.value = records;
}

function generateMockBlocks() {
  const blocks = [];

  for (let i = 0; i < 5; i++) {
    const blockNo = 12456 - i;
    blocks.push({
      blockNo,
      timestamp: new Date(Date.now() - i * 15000).toLocaleString('zh-CN'),
      transactions: Math.floor(Math.random() * 20) + 5,
      hash: `0x${Math.random().toString(16).substring(2, 18)}...`,
    });
  }

  recentBlocks.value = blocks;
}

function generateMockTransactions() {
  const txTypes = ['CreateRecord', 'Sign', 'UpdateStatus', 'Approve'];
  const txStatuses = ['已确认', '待确认', '已失败'];
  const transactions = [];

  for (let i = 0; i < 5; i++) {
    transactions.push({
      hash: `0x${Math.random().toString(16).substring(2, 20)}...`,
      type: txTypes[Math.floor(Math.random() * txTypes.length)],
      status: txStatuses[Math.floor(Math.random() * txStatuses.length)],
      confirmations: Math.floor(Math.random() * 20) + 1,
      timestamp: new Date(Date.now() - Math.random() * 1000 * 60 * 60).toLocaleString('zh-CN'),
    });
  }

  recentTransactions.value = transactions;
}

function generateActivityLog() {
  const actions = [
    { action: '提交了检修记录', icon: '📝' },
    { action: '审核通过了记录', icon: '✓' },
    { action: '放行了记录', icon: '🚀' },
    { action: '驳回了记录', icon: '✕' },
    { action: '重新提交修改', icon: '↩️' },
  ];

  const employees = ['王小明', '李经理', '张工程师', '赵审批官', '刘技师', '陈维修', '高飞'];
  const aircrafts = ['B-2819', 'B-5632', 'B-7841', 'B-3256', 'B-9124'];

  const logs = [];
  for (let i = 0; i < 8; i++) {
    const actionObj = actions[Math.floor(Math.random() * actions.length)];
    const timeDiff = Math.floor(Math.random() * 120) + 5; // 5-125 分钟前
    const time = new Date(Date.now() - timeDiff * 60 * 1000);

    logs.push({
      id: `log-${i}`,
      icon: actionObj.icon,
      action: actionObj.action,
      employee: employees[Math.floor(Math.random() * employees.length)],
      aircraft: aircrafts[Math.floor(Math.random() * aircrafts.length)],
      time: time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      recordId: `REC-2026030${Math.floor(Math.random() * 10)}`,
    });
  }

  activityLog.value = logs;
}

function initializeCharts() {
  chartsLoading.value = true;
  setTimeout(() => {
    generateTrendData();
    chartsLoading.value = false;
    drawTrendChart();
  }, 500);
}

function drawTrendChart() {
  const chartDom = document.getElementById('trend-chart');
  if (!chartDom) return;

  const chart = echarts.init(chartDom);

  const option = {
    responsive: true,
    maintainAspectRatio: true,
    grid: {
      left: '5%',
      right: '5%',
      bottom: '10%',
      top: '10%',
      containLabel: true,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(19, 32, 51, 0.92)',
      borderColor: '#607087',
      textStyle: {
        color: '#f5f7fa',
      },
    },
    legend: {
      data: ['上链记录', '生成区块'],
      textStyle: {
        color: '#607087',
      },
    },
    xAxis: {
      type: 'category',
      data: trendData.value.dates,
      boundaryGap: false,
      axisLine: {
        lineStyle: {
          color: '#e4e8ef',
        },
      },
      axisLabel: {
        color: '#607087',
        fontSize: 11,
        interval: 2,
      },
    },
    yAxis: [
      {
        type: 'value',
        name: '上链记录数',
        position: 'left',
        axisLine: {
          lineStyle: {
            color: '#7ab8e6',
          },
        },
        axisLabel: {
          color: '#607087',
        },
      },
      {
        type: 'value',
        name: '生成区块数',
        position: 'right',
        axisLine: {
          lineStyle: {
            color: '#e8b8a1',
          },
        },
        axisLabel: {
          color: '#607087',
        },
      },
    ],
    series: [
      {
        name: '上链记录',
        data: trendData.value.records,
        type: 'line',
        smooth: true,
        itemStyle: {
          color: '#7ab8e6',
        },
        lineStyle: {
          color: '#7ab8e6',
          width: 2.5,
        },
        areaStyle: {
          color: 'rgba(122, 184, 230, 0.18)',
        },
        yAxisIndex: 0,
      },
      {
        name: '生成区块',
        data: trendData.value.blocks,
        type: 'line',
        smooth: true,
        itemStyle: {
          color: '#e8b8a1',
        },
        lineStyle: {
          color: '#e8b8a1',
          width: 2.5,
        },
        areaStyle: {
          color: 'rgba(232, 184, 161, 0.18)',
        },
        yAxisIndex: 1,
      },
    ],
  };

  chart.setOption(option);
  window.addEventListener('resize', () => chart.resize());
}

// ============ 生命周期 ============

onMounted(() => {
  generateMockRecords();
  generateMockBlocks();
  generateMockTransactions();
  generateActivityLog();
  initializeCharts();
});
</script>

<template>
  <div class="module-stack">
    <!-- ============ 统计卡片区（3列网格） ============ -->
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

    <!-- ============ 折线图 + 浏览器（左右布局） ============ -->
    <section class="module-grid two-up-grid">
      <!-- 左: 区块链浏览器 -->
      <article class="module-panel">
        <div class="module-title">区块链浏览器</div>
        <el-tabs v-model="browserTabs" class="browser-tabs-compact">
          <!-- Tab 1: 最新检修条目 -->
          <el-tab-pane label="最新条目" name="records">
            <div class="browser-content-compact">
              <div v-for="item in recentRecords" :key="item.id" class="queue-card">
                <div class="queue-card-head">
                  <strong>{{ item.id }}</strong>
                  <span class="status-chip">{{ item.status }}</span>
                </div>
                <div class="queue-card-copy">{{ item.aircraftNo }}</div>
                <div class="queue-card-foot">{{ item.submittedBy }} · {{ item.chainTime }}</div>
              </div>
            </div>
          </el-tab-pane>

          <!-- Tab 2: 最新区块 -->
          <el-tab-pane label="最新区块" name="blocks">
            <div class="browser-content-compact">
              <div v-for="item in recentBlocks" :key="item.blockNo" class="queue-card">
                <div class="queue-card-head">
                  <strong>Block #{{ item.blockNo }}</strong>
                </div>
                <div class="queue-card-copy">{{ item.transactions }} txns</div>
                <div class="queue-card-foot">{{ item.hash }}</div>
              </div>
            </div>
          </el-tab-pane>

          <!-- Tab 3: 最新交易 -->
          <el-tab-pane label="最新交易" name="transactions">
            <div class="browser-content-compact">
              <div v-for="item in recentTransactions" :key="item.hash" class="queue-card">
                <div class="queue-card-head">
                  <strong>{{ item.type }}</strong>
                  <span class="status-chip">{{ item.status }}</span>
                </div>
                <div class="queue-card-copy">{{ item.hash }}</div>
                <div class="queue-card-foot">{{ item.confirmations }} confirmations · {{ item.timestamp }}</div>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </article>

      <!-- 右: 折线图 -->
      <article class="module-panel">
        <div class="module-title">最近30天上链趋势</div>
        <div v-loading="chartsLoading" class="chart-container">
          <div id="trend-chart" style="width: 100%; height: 100%"></div>
        </div>
      </article>
    </section>

    <!-- ============ 最近活动日志 ============ -->
    <section class="module-panel">
      <div class="module-title">最近活动</div>
      <div class="activity-timeline">
        <div v-for="item in activityLog" :key="item.id" class="activity-item">
          <div class="activity-icon">{{ item.icon }}</div>
          <div class="activity-content">
            <div class="activity-head">
              <span class="activity-actor">{{ item.employee }}</span>
              <span class="activity-action">{{ item.action }}</span>
            </div>
            <div class="activity-meta">
              {{ item.aircraft }} · {{ item.recordId }} · {{ item.time }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ 用户统计 + 系统统计 ============ -->
    <section class="module-grid two-up-grid">
      <article class="module-panel">
        <div class="module-title">用户统计</div>
        <div class="stats-mini-grid">
          <div class="stats-mini-card">
            <div class="stats-mini-label">总用户数</div>
            <div class="stats-mini-value">{{ userStats.totalUsers }}</div>
          </div>
          <div class="stats-mini-card">
            <div class="stats-mini-label">活跃用户</div>
            <div class="stats-mini-value">{{ userStats.activeUsers }}</div>
          </div>
          <div class="stats-mini-card">
            <div class="stats-mini-label">角色数</div>
            <div class="stats-mini-value">{{ userStats.totalRoles }}</div>
          </div>
          <div class="stats-mini-card">
            <div class="stats-mini-label">待激活</div>
            <div class="stats-mini-value">{{ userStats.pendingActivation }}</div>
          </div>
        </div>
      </article>

      <article class="module-panel">
        <div class="module-title">系统统计</div>
        <div class="stats-mini-grid">
          <div class="stats-mini-card">
            <div class="stats-mini-label">总记录数</div>
            <div class="stats-mini-value">{{ systemStats.totalRecords }}</div>
          </div>
          <div class="stats-mini-card">
            <div class="stats-mini-label">本月新增</div>
            <div class="stats-mini-value">{{ systemStats.recordsThisMonth }}</div>
          </div>
          <div class="stats-mini-card">
            <div class="stats-mini-label">链上确认率</div>
            <div class="stats-mini-value">{{ systemStats.chainConfirmationRate }}%</div>
          </div>
          <div class="stats-mini-card">
            <div class="stats-mini-label">平均审批时间</div>
            <div class="stats-mini-value">{{ systemStats.averageApprovalTime }}</div>
          </div>
        </div>
      </article>
    </section>
    <section class="module-panel">
      <div class="system-info-content">
        <div class="info-item">
          <span class="info-label">当前版本：</span>
          <span class="info-value">{{ systemInfo.version }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">最后更新：</span>
          <span class="info-value">{{ systemInfo.lastUpdateTime }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">最新日志：</span>
          <span class="info-value">{{ systemInfo.updateLog }}</span>
        </div>
        <div class="info-item">
          <el-link type="primary" :href="systemInfo.helpUrl" target="_blank">📖 查看帮助文档</el-link>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped lang="css">
/* ============ 图表容器 ============ */
.chart-container {
  width: 100%;
  height: 360px;
  position: relative;
}

/* ============ 浏览器标签 ============ */
.browser-tabs-compact {
  margin-bottom: 0;
}

.browser-tabs-compact :deep(.el-tabs__header) {
  margin: 0 0 0.75rem 0 !important;
}

.browser-content-compact {
  display: grid;
  gap: 0.65rem;
  max-height: 310px;
  overflow-y: auto;
}

/* ============ 活动日志时间线 ============ */
.activity-timeline {
  display: grid;
  gap: 0.8rem;
}

.activity-item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 1rem;
  padding: 0.9rem 1rem;
  border-radius: 1rem;
  background: rgba(248, 250, 253, 0.95);
  border: 1px solid rgba(19, 32, 51, 0.06);
  align-items: start;
}

.activity-icon {
  font-size: 1.5rem;
  min-width: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.activity-content {
  min-width: 0;
}

.activity-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}

.activity-actor {
  font-weight: 700;
  color: #17263a;
}

.activity-action {
  color: #607087;
  font-size: 0.95rem;
}

.activity-meta {
  font-size: 0.85rem;
  color: #74849a;
}

/* ============ 统计小卡片网格 ============ */
.stats-mini-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.8rem;
  margin-top: 0.75rem;
}

.stats-mini-card {
  padding: 0.85rem 0.95rem;
  border-radius: 0.95rem;
  background: rgba(248, 250, 253, 0.95);
  border: 1px solid rgba(19, 32, 51, 0.06);
  text-align: center;
}

.stats-mini-label {
  font-size: 0.8rem;
  color: #607087;
  margin-bottom: 0.35rem;
  display: block;
}

.stats-mini-value {
  font-size: 1.6rem;
  font-weight: 800;
  color: #17263a;
}

/* ============ 系统信息 ============ */
.system-info-content {
  display: flex;
  flex-wrap: wrap;
  gap: 2.5rem;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.95rem;
}

.info-label {
  color: #607087;
  font-weight: 600;
}

.info-value {
  color: #17263a;
  font-weight: 600;
}

/* ============ 响应式设计 ============ */
@media (max-width: 1024px) {
  .browser-content-compact {
    max-height: 280px;
  }

  .chart-container {
    height: 300px;
  }

  .stats-mini-grid {
    gap: 0.6rem;
  }
}

@media (max-width: 768px) {
  .system-info-content {
    flex-direction: column;
    gap: 1rem;
  }

  .chart-container {
    height: 320px;
  }

  .activity-item {
    gap: 0.75rem;
    padding: 0.8rem 0.9rem;
  }

  .stats-mini-grid {
    grid-template-columns: 1fr;
  }
}
</style>
