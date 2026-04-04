<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { ElMessage } from 'element-plus';

import { useAuthSession } from '../stores/authSession';
import { authorizedJsonRequest } from '../utils/apiClient';
import RecordDetailDrawer from '../components/RecordDetailDrawer.vue';

const auth = useAuthSession();

const loading = ref(false);
const detailVisible = ref(false);
const detailRecordId = ref(null);
const records = ref([]);
const pagination = reactive({
  page: 1,
  pageSize: 8,
  total: 0,
});
const filters = reactive({
  keyword: '',
  aircraftRegNo: '',
  status: '',
});

const statusOptions = [
  { label: '全部记录', value: '' },
  { label: '待审核', value: 'submitted' },
  { label: '待放行', value: 'peer_checked,rii_approved' },
  { label: '已驳回', value: 'rejected' },
  { label: '已放行', value: 'released' },
];

const canLoad = computed(() => auth.isLoggedIn.value && auth.loginResult.value?.token);

function formatDateTime(value) {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  });
  return formatter.format(date).replace(/\//g, '-');
}

function statusLabel(status) {
  const mapping = {
    submitted: '待审核',
    peer_checked: '待放行',
    rii_approved: '待放行',
    released: '已放行',
    rejected: '已驳回',
    revoked: '已作废',
    draft: '草稿',
  };
  return mapping[status] || status || '-';
}

async function fetchRecords() {
  if (!canLoad.value) {
    return;
  }

  try {
    loading.value = true;
    const params = new URLSearchParams({
      page: String(pagination.page),
      pageSize: String(pagination.pageSize),
    });
    if (filters.keyword) {
      params.set('keyword', filters.keyword);
    }
    if (filters.aircraftRegNo) {
      params.set('aircraftRegNo', filters.aircraftRegNo);
    }
    if (filters.status) {
      // 支持逗号分隔的多状态筛选
      params.set('statuses', filters.status);
    }

    const data = await authorizedJsonRequest(
      auth.loginResult.value.token,
      `/api/maintenance/records?${params.toString()}`,
      { method: 'GET' },
    );

    records.value = data.rows || [];
    pagination.total = data.total || 0;
  } catch (error) {
    ElMessage.error(error.message || '加载记录失败');
  } finally {
    loading.value = false;
  }
}

function openRecordDetail(recordId) {
  detailRecordId.value = recordId;
  detailVisible.value = true;
}

function setStatusFilter(value) {
  filters.status = value;
  pagination.page = 1;
  fetchRecords();
}

onMounted(() => {
  fetchRecords();
});
</script>

<template>
  <div>
    <div v-if="!canLoad" class="result-block">
    <el-alert
      type="warning"
      :closable="false"
      title="请先登录后再进入查阅中心"
      description="当前页面需要真实 JWT 才能查询检修记录列表和详情。"
    />
    <div class="button-row top-gap">
      <RouterLink to="/auth" class="workspace-auth-link">前往认证页</RouterLink>
    </div>
  </div>

  <div v-else class="module-stack">
    <section class="module-panel">
      <div class="module-header-row">
        <div>
          <div class="module-title">查阅中心</div>
          <div class="module-subtitle">检修记录列表、状态筛选与详情查看</div>
        </div>
        <div class="filter-pills">
          <button
            v-for="option in statusOptions"
            :key="option.value || 'all'"
            class="filter-pill button-pill"
            :class="{ 'is-active': filters.status === option.value }"
            @click="setStatusFilter(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div class="form-grid record-filter-grid">
        <el-input v-model="filters.keyword" placeholder="搜索记录号、工卡号、工作类型、工号" clearable />
        <el-input v-model="filters.aircraftRegNo" placeholder="按机号过滤，例如 B-4321" clearable />
        <div class="button-row no-top-gap">
          <el-button type="primary" :loading="loading" @click="fetchRecords">查询</el-button>
        </div>
      </div>

      <div v-loading="loading" class="records-table-shell">
        <div class="records-table-row records-table-head records-table-row-wide">
          <span>记录号</span>
          <span>机号</span>
          <span>工作类型</span>
          <span>版本</span>
          <span>状态</span>
          <span>签名进度</span>
          <span>更新时间</span>
          <span>操作</span>
        </div>

        <div v-for="row in records" :key="row.recordId" class="records-table-row records-table-row-wide">
          <span class="mono">{{ row.recordId }}</span>
          <span>{{ row.aircraftRegNo }}</span>
          <span>{{ row.workType }}</span>
          <span>R{{ row.revision }}</span>
          <span><span class="status-chip">{{ statusLabel(row.status) }}</span></span>
          <span>{{ row.reviewerSignatureCount }}/{{ row.requiredReviewerSignatures }}</span>
          <span>{{ formatDateTime(row.updatedAt) }}</span>
          <span>
            <el-button text type="primary" @click="openRecordDetail(row.recordId)">查看详情</el-button>
          </span>
        </div>

        <div v-if="records.length === 0 && !loading" class="module-empty-state">
          当前条件下没有检修记录。
        </div>
      </div>
    </section>

    <section class="module-panel">
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[8, 20, 50]"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="fetchRecords"
        @size-change="() => { pagination.page = 1; fetchRecords(); }"
      />
    </section>

    <RecordDetailDrawer v-model:visible="detailVisible" :record-id="detailRecordId" />
  </div>
  </div>
</template>